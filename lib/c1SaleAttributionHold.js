import {reviewC1SaleAttribution} from './c1SaleAttributionRecovery';
import {c1AccountHoldingExplanation} from './c1AccountDecision';
import {reconcileC1ActualAccountFills} from './c1AccountLedger';

export const C1_SALE_ATTRIBUTION_HOLD='c1-pending-sale-attribution-hold-v1';
export const C1_SALE_ATTRIBUTION_HOLD_REASON='These planned sales were already recorded, but their allocation assignments require review. Do not execute or record the disputed planned sales again. Existing stops and other independently confirmed exits still apply.';
export const C1_SALE_ATTRIBUTION_HOLD_ERROR='Review the already completed planned-sale allocation before recording another planned sale';

// A read-only hold is evidence quarantine, not the proposed financial fix.
// Only the server's strictly reconciled recovery review establishes its scope.
function recognition(account,now){
 const review=reviewC1SaleAttribution({account,now});
 if(review)return review.status==='confirmation-required'?{review,evidenceScope:'current-saved-account'}:null;
 const activity=account?.intradayActivity;
 if(!activity||activity.attributionCorrectionId||!Array.isArray(activity.tickets)||activity.tickets.length<2||!Array.isArray(activity.fills))return null;
 try{
  // A later real stop or unrelated execution cannot revive an already
  // disputed repeat. Recognition alone may inspect an intact chronological
  // prefix; correction eligibility still uses the entire current account.
  reconcileC1ActualAccountFills({plan:activity.plan,fills:activity.fills,observedAt:new Date(now).toISOString()});
  const orderMap=new Map(activity.plan.orders.map(order=>[order.id,order])),ticketMap=new Map(),parts=new Map();
  let last=-Infinity;
  for(const ticket of activity.tickets){
   const at=Date.parse(ticket?.executedAt);
   if(!ticket?.id||ticketMap.has(ticket.id)||!Number.isFinite(at)||at<last)return null;
   last=at;ticketMap.set(ticket.id,ticket);parts.set(ticket.id,[]);
  }
  last=-Infinity;
  for(const fill of activity.fills){
   const order=orderMap.get(fill.orderId),suffix=':'+order?.sleeve,
    ticket=order&&ticketMap.get(fill.id.endsWith(suffix)?fill.id.slice(0,-suffix.length):null),at=Date.parse(fill.executedAt);
   if(!ticket||at<last||fill.symbol!==ticket.symbol||fill.side!==ticket.side||fill.price!==ticket.price||fill.executedAt!==ticket.executedAt)return null;
   last=at;parts.get(ticket.id).push(fill);
  }
  for(const ticket of activity.tickets){
   const fills=parts.get(ticket.id);
   if(fills.reduce((sum,fill)=>sum+fill.shares,0)!==ticket.shares||Math.abs(fills.reduce((sum,fill)=>sum+fill.fee,0)-ticket.fee)>1e-8)return null;
  }
  for(let length=1;length<activity.tickets.length;length++){
   const tickets=activity.tickets.slice(0,length),ids=new Set(tickets.map(ticket=>ticket.id)),
    fills=activity.fills.filter(fill=>{const order=orderMap.get(fill.orderId);return ids.has(fill.id.slice(0,-(':'+order.sleeve).length));});
   const prefix={...account,intradayActivity:{...activity,tickets,fills}},candidate=reviewC1SaleAttribution({account:prefix,now});
   if(candidate?.status==='confirmation-required')return {review:candidate,evidenceScope:'verified-saved-ticket-prefix',prefixTicketCount:length};
  }
 }catch{}
 return null;
}
export function buildC1SaleAttributionHold({account,now=new Date()}={}){
 const evidence=recognition(account,now);if(!evidence)return null;
 const {review}=evidence;
 const plan=account.intradayActivity?.plan,targets=[];
 for(const row of review.rows){
  if(row.allocationsAfter?.length!==1)return null;
  const sleeve=row.allocationsAfter[0].sleeve,orders=plan.orders.filter(order=>order.symbol===row.symbol&&order.sleeve===sleeve&&
   order.side==='sell'&&!order.condition&&order.reason==='portfolio-drawdown-stop'&&order.shares===row.shares);
  if(orders.length!==1)return null;
  targets.push({orderId:orders[0].id,symbol:row.symbol,sleeve,reason:'portfolio-drawdown-stop'});
 }
 return targets.length?{contract:C1_SALE_ATTRIBUTION_HOLD,status:'review-required',proposalId:review.proposalId,date:review.date,
  sourceSessionDate:plan.sourceSessionDate,reason:C1_SALE_ATTRIBUTION_HOLD_REASON,evidenceScope:evidence.evidenceScope,
  ...(evidence.prefixTicketCount?{prefixTicketCount:evidence.prefixTicketCount}:{}),targets}:null;
}
const scoped=(plan,hold)=>plan?.date===hold.date&&plan.sourceSessionDate===hold.sourceSessionDate;
const matches=(row,hold,symbol=row?.symbol)=>row?.side!=='buy'&&!row?.condition&&(!row?.date||row.date===hold.date)&&hold.targets.some(target=>target.symbol===symbol&&
 row.sleeve===target.sleeve&&row.reason===target.reason);
function actions(rows,hold){
 if(!Array.isArray(rows))return rows;
 return rows.flatMap(action=>{
  if(action.side!=='sell'||action.conditional)return [action];
  if(!Array.isArray(action.allocationBreakdown))return action.orderIds?.some(id=>hold.targets.some(target=>target.orderId===id))?[]:[action];
  const allocationBreakdown=action.allocationBreakdown.filter(row=>!matches(row,hold,action.symbol));
  if(allocationBreakdown.length===action.allocationBreakdown.length)return [action];
  if(!allocationBreakdown.length)return [];
  const sources=(action.sourceAllocationBreakdown||action.allocationBreakdown).filter(row=>!matches(row,hold,action.symbol)),
   shares=allocationBreakdown.reduce((sum,row)=>sum+row.shares,0),estimatedValue=allocationBreakdown.reduce((sum,row)=>sum+(Number.isFinite(row.estimatedPrice)?row.estimatedPrice*row.shares:0),0),
   orderIds=[...new Set(sources.flatMap(row=>[row.orderId,...(row.orderIds||[])]).filter(Boolean))];
  return [{...action,allocationBreakdown,sourceAllocationBreakdown:sources,shares,estimatedValue,
   estimatedPrice:estimatedValue>0?estimatedValue/shares:action.estimatedPrice,orderIds,reason:allocationBreakdown[0].reason,
   reasons:[...new Set(allocationBreakdown.map(row=>row.reason).filter(Boolean))]}];
 });
}
function decisionView(decision,hold){
 if(!decision||decision.sourceSessionDate!==hold.sourceSessionDate)return decision;
 const positions=(decision.positions||[]).map(position=>{
  if(!hold.targets.some(target=>target.symbol===position.symbol))return position;
  const exits=(position.exits||[]).filter(exit=>!matches(exit,hold,position.symbol)),row={...position,exits,saleAttributionHold:hold};
  row.action=exits.length?'Exit candidate':'Review';
  row.reason=exits.length?c1AccountHoldingExplanation(row,decision.sourceSessionDate):hold.reason;
  return row;
 });
 return {...decision,positions,accountActions:actions(decision.accountActions,hold),saleAttributionHold:hold};
}
function planView(plan,hold){
 if(!plan||!scoped(plan,hold))return plan;
 const orders=plan.orders?.filter(order=>!matches(order,hold));
 return {...plan,orders,accountActions:actions(plan.accountActions,hold),saleAttributionHold:hold,
  ...(orders?.length!==plan.orders?.length?{projectedBooks:null}:{})};
}
function recordingSessionView(session,hold){
 return scoped(session?.plan,hold)?{...session,saleAttributionHold:hold,
  withheldSaleOrderIds:session.plan.orders.filter(order=>matches(order,hold)).map(order=>order.id)}:session;
}

// Never modify the captured accounting plan: fills still reference its exact
// original IDs. Only prospective published orders and recording choices change.
export function applyC1SaleAttributionHold({view,account,now=new Date()}={}){
 const hold=buildC1SaleAttributionHold({account,now});
 if(!view||!hold)return view;
 const next={...view,saleAttributionHold:hold};
 for(const name of ['decision','executionDecision','completedDecision'])if(view[name])next[name]=decisionView(view[name],hold);
 if(view.openingPlan)next.openingPlan=planView(view.openingPlan,hold);
 if(view.manualRecommendations)next.manualRecommendations={...view.manualRecommendations,
  orders:view.manualRecommendations.orders?.filter(order=>!matches(order,hold)),accountActions:actions(view.manualRecommendations.accountActions,hold),saleAttributionHold:hold};
 if(view.intradaySession)next.intradaySession=recordingSessionView(view.intradaySession,hold);
 if(view.pendingSession)next.pendingSession=recordingSessionView(view.pendingSession,hold);
 if(Array.isArray(view.pendingSessions))next.pendingSessions=view.pendingSessions.map(session=>recordingSessionView(session,hold));
 return next;
}

// A stale client cannot bypass the response quarantine. Existing identical
// receipts remain idempotent, and real stop/owner sales retain their own gates.
export function assertC1SaleAttributionHold({account,ticket,now=new Date()}={}){
 const prior=account?.intradayActivity?.tickets?.find(row=>row.id===ticket?.id);
 if(prior&&JSON.stringify(prior)===JSON.stringify(ticket))return;
 if(ticket?.side!=='sell'||ticket.recordingReason==='owner-discretionary-exit'||ticket.saleSelection?.kind==='stop')return;
 const hold=buildC1SaleAttributionHold({account,now});
 if(hold?.targets.some(target=>target.symbol===ticket.symbol))throw new Error(C1_SALE_ATTRIBUTION_HOLD_ERROR);
}
