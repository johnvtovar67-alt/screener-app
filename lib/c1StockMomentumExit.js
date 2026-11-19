import {readC1RecentMomentum,C1_RECENT_MOMENTUM_GATE} from './c1RecentMomentumGate';
import {isUsMarketSessionDay,marketSessionDistance} from './marketSession';
import {c1AccountPolicyFingerprint} from './c1AccountPolicyVersion';
import {resolveC1AccountActions} from './c1AccountActions';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';

export const C1_STOCK_MOMENTUM_EXIT='c1-stock-momentum-exit-v1';
export const C1_STOCK_MOMENTUM_EXIT_DATE='2026-11-19';
export const C1_STOCK_MOMENTUM_SOURCE_DATE='2026-11-18';
const ids=['base','cooldown15','sector40'];
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const validDay=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&isUsMarketSessionDay(date);
const reasons=new Set(['recent-momentum-deterioration','recent-momentum-profit-protection','rank-deterioration','early-rank-deterioration','profit-rank-deterioration']);
const rankReasons=new Set(['rank-deterioration','early-rank-deterioration','profit-rank-deterioration']);
const protective=reason=>['portfolio-drawdown-stop','initial-stop','invalidation-stop','ratcheted-stop','profit-trailing-stop','verified-current-stop','universe-removal'].includes(reason);
export const c1StockMomentumExitApplies=date=>validDay(date)&&date>=C1_STOCK_MOMENTUM_EXIT_DATE;

// Only reconciled continuous account ownership defines the clock. A new sleeve,
// Add or partial sale never starts a new episode; actual aggregate zero does.
// Completed-period count distinguishes even flat/reentry cycles on the same day.
function episodeIdentity(policy,investment){
 const completed=(policy.periods||[]).filter(row=>row.symbol===investment.symbol);
 return c1AccountPolicyFingerprint([C1_STOCK_MOMENTUM_EXIT,investment.symbol,investment.openedAt,completed.length,completed.at(-1)?.completedAt||null]);
}

// Read accepted observations only. This neither simulates trades nor persists
// a financial change. Pre-activation observations can supply confirmation
// context, but an old recovered weak patch cannot create a retroactive exit.
export function buildC1StockMomentumReviews({accountPolicy,sessions=[],historySessions=sessions,sourceSessionDate,runs={}}={}){
 if(!accountPolicy?.active||accountPolicy.complete!==true||!c1StockMomentumExitApplies(accountPolicy.date)||
  !validDay(sourceSessionDate)||sourceSessionDate<C1_STOCK_MOMENTUM_SOURCE_DATE)return null;
 const owned=new Map(sessions.map(row=>[row.date,row]));
 const history=historySessions.filter(row=>row.date<=sourceSessionDate).map(row=>owned.get(row.date)||row);
 if(history.some((row,index)=>!validDay(row?.date)||index>0&&row.date<=history[index-1].date))throw new Error('Unique chronological accepted stock-momentum history required');
 const output={};
 for(const investment of accountPolicy.openInvestments||[]){
  if(!investment.symbol||!validDay(investment.openedAt)||!Number.isSafeInteger(investment.shares)||investment.shares<=0)continue;
  let streak=0,lastDate=null,lastAvailable=false,latest=null,trigger=null;
  for(let index=0;index<history.length;index++){
   const date=history[index].date;if(date<investment.openedAt)continue;
   const review=readC1RecentMomentum({sessions:history,sessionIndex:index,symbol:investment.symbol});
   const consecutive=lastDate&&marketSessionDistance(lastDate,date)===1;
   const m=review.metrics,previous=consecutive&&lastAvailable?streak:0;
   const start=review.available&&m.negativeWindows&&m.ret1<0&&m.macdImproving===false;
   const continued=review.available&&previous>0&&m.negativeWindows&&m.macdImproving===false;
   streak=date<=investment.openedAt||!review.available?0:start||continued?previous+1:0;
   latest={...review,metrics:m?{...m,streak,confirmations:C1_RECENT_MOMENTUM_GATE.deteriorationConfirmations}:null};
   if(!trigger&&date>=C1_STOCK_MOMENTUM_SOURCE_DATE&&streak>=C1_RECENT_MOMENTUM_GATE.deteriorationConfirmations)
    trigger={sourceSessionDate:date,reason:'recent-momentum-deterioration',streak,metrics:{...latest.metrics}};
   lastDate=date;lastAvailable=review.available;
  }
  // Existing profit-protection thresholds and verified peak provenance remain
  // allocation facts. A confirmed recent-momentum exit from ANY allocation
  // applies to the stock; subsequent recovery/partial fills cannot erase it.
  const priorTriggers=Object.values(runs).flatMap(run=>(run?.prior||run)?.recentMomentumDecisions||[])
   .filter(row=>row.symbol===investment.symbol&&row.phase==='close-holding'&&row.available===true&&reasons.has(row.exitReason)&&
    validDay(row.sourceSessionDate)&&row.sourceSessionDate>=C1_STOCK_MOMENTUM_SOURCE_DATE&&row.sourceSessionDate>investment.openedAt&&row.sourceSessionDate<=sourceSessionDate)
   .sort((a,b)=>a.sourceSessionDate.localeCompare(b.sourceSessionDate));
  const prior=priorTriggers[0];
  if(prior&&(!trigger||prior.sourceSessionDate<trigger.sourceSessionDate))trigger={sourceSessionDate:prior.sourceSessionDate,reason:prior.exitReason,
   streak:prior.state?.streak??prior.metrics?.streak,metrics:prior.metrics};
  // Rank exits retain their existing confirmation/holding criteria. Their
  // already confirmed pending instruction also exits the whole stock.
  if(!trigger)for(const value of Object.values(runs)){
   const run=value?.prior||value,held=run?.openPositions?.find(row=>row.symbol===investment.symbol);
   const exit=held?.rankVerified===true&&run?.pendingDecisions?.find(row=>row.symbol===investment.symbol&&row.side==='sell'&&!row.condition&&rankReasons.has(row.reason));
   if(exit){trigger={sourceSessionDate,reason:exit.reason,streak:null,metrics:null};break;}
  }
  // A partially executed whole-stock instruction is preserved in its original
  // server plan. Its episode proof cannot transfer through actual flat/reentry.
  const episodeId=episodeIdentity(accountPolicy,investment);
  const captured=(accountPolicy.stockMomentumExitEvidence||[]).find(row=>row.symbol===investment.symbol&&row.episodeId===episodeId&&
   reasons.has(row.reason)&&validDay(row.triggerSourceSessionDate)&&row.triggerSourceSessionDate>=C1_STOCK_MOMENTUM_SOURCE_DATE&&row.triggerSourceSessionDate<=sourceSessionDate);
  if(captured&&(!trigger||captured.triggerSourceSessionDate<trigger.sourceSessionDate))trigger={sourceSessionDate:captured.triggerSourceSessionDate,reason:captured.reason,streak:null,metrics:null};
  output[investment.symbol]={contract:C1_STOCK_MOMENTUM_EXIT,symbol:investment.symbol,sourceSessionDate,
   episodeId,openedAt:investment.openedAt,available:latest?.available===true&&latest.sourceSessionDate===sourceSessionDate,
   streak,confirmations:C1_RECENT_MOMENTUM_GATE.deteriorationConfirmations,metrics:latest?.metrics||null,
   confirmed:Boolean(trigger),trigger,exitReason:trigger?.reason||null,
   limitations:latest?.limitations||['Accepted recent-momentum observations are unavailable.']};
 }
 return output;
}

export function withC1StockMomentumDecision(decision,reviews=decision?.stockMomentumReviews){
 if(!reviews||!decision?.current)return decision;
 const positions=decision.positions.map(position=>{
  const review=reviews[position.symbol];if(!review)return position;
  if(!review.confirmed)return {...position,stockMomentumReview:review};
  const exits=(position.exits||[]).filter(exit=>!reasons.has(exit.reason));
  for(const stop of position.stops||[])if(ids.includes(stop.sleeve)&&Number.isSafeInteger(stop.shares)&&stop.shares>0)
   exits.push({sleeve:stop.sleeve,shares:stop.shares,reason:review.exitReason,stockMomentumExit:{contract:C1_STOCK_MOMENTUM_EXIT,episodeId:review.episodeId,triggerSourceSessionDate:review.trigger.sourceSessionDate}});
  return {...position,stockMomentumReview:review,action:'Exit candidate',exits};
 });
 const resolved=resolveC1AccountActions({positions,orders:positions.flatMap(position=>(position.exits||[]).map(exit=>({...exit,symbol:position.symbol,side:'sell'}))),
  accountPolicy:decision.accountPolicy,decisionId:decision.actionVersion||decision.decisionId});
 return {...decision,positions,stockMomentumReviews:reviews,accountActions:resolved.accountActions,activeExitSymbols:resolved.activeExitSymbols,
  opportunities:(decision.opportunities||[]).filter(row=>!resolved.blockedSymbols.includes(row.symbol))};
}

// Expand concrete recorder-authorized orders BEFORE projected cash/ownership
// and conditional stops are built. Existing protective exits keep priority;
// competing instructions against the same sleeve are never additive.
export function applyC1StockMomentumOrders({orders=[],books,reviews,prices,date,recordingOnly=false}={}){
 if(!reviews||!c1StockMomentumExitApplies(date))return {orders,blockedOrders:[]};
 const exits=new Set(Object.keys(reviews).filter(symbol=>reviews[symbol].confirmed)),blockedOrders=[];
 const next=orders.filter(order=>{
  if(order.side==='buy'&&exits.has(order.symbol)){blockedOrders.push({...order,blockReason:'account-active-exit'});return false;}
  return true;
 });
 for(const symbol of exits)for(const sleeve of ids){
  const held=books?.[sleeve]?.positions?.[symbol];if(!Number.isSafeInteger(held?.shares)||held.shares<=0)continue;
  const matches=next.filter(order=>order.symbol===symbol&&order.sleeve===sleeve&&order.side==='sell'&&!order.condition);
  const existing=matches.find(order=>protective(order.reason))||matches.find(order=>reasons.has(order.reason))||matches[0];
  const quote=prices instanceof Map?prices.get(symbol):prices?.[symbol],raw=typeof quote==='number'?quote:quote?.open;
  if(!recordingOnly&&!positive(raw))throw new Error('Verified stock-momentum exit opening quote required');
  const review=reviews[symbol],proof={contract:C1_STOCK_MOMENTUM_EXIT,episodeId:review.episodeId,triggerSourceSessionDate:review.trigger.sourceSessionDate};
  const replacement=existing?{...existing,shares:held.shares,stockMomentumExit:proof}:
   {id:`${sleeve}:${date}:stock-momentum-exit:${symbol}`,sleeve,date,symbol,side:'sell',shares:held.shares,
    ...(!recordingOnly?{estimatedPrice:raw*(1-C1_FROZEN_OPTIONS[sleeve].slippageBps/10000)}:{recordingOnly:true}),reason:review.exitReason,phase:1,sequence:-1,executable:false,stockMomentumExit:proof};
  for(const match of matches)next.splice(next.indexOf(match),1);
  next.push(replacement);
 }
 return {orders:next,blockedOrders};
}
