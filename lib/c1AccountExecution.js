import {marketSessionDistance,easternMarketClock} from './marketSession';
import {withC1HistoricalPriceEvidence} from './c1AccountSeed';
import {continueC1ActualAccount,reconcileC1ActualAccountFills,c1AccountBooks,c1CompletionRules} from './c1AccountLedger';
import {projectC1AccountSession} from './c1AccountProjection';

const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const ids=['base','cooldown15','sector40'];
const ownerExitReason='owner-discretionary-exit';

// First-opening plan from actual opening balances. Opening prices and current
// membership still need server provenance before this can carry live authority.
export function planC1ActualAccountOpening({adoption,baseline,opening,observedAt}={}) {
  return planFromHistory({adoption,baseline,opening,observedAt,books:c1AccountBooks(adoption),sessions:[baseline],replay:null});
}
function planFromHistory(input){
  const {adoption,baseline,opening,observedAt,sessions}=input,clock=easternMarketClock(new Date(observedAt));
  if(!baseline||sessions[0]?.date!==adoption.sourceSessionDate||!opening||marketSessionDistance(baseline.date,opening.date)!==1||!clock?.isSessionDay||clock.key!==opening.date||clock.minutes<570)throw new Error('The next observed market opening is required');
  return projectC1AccountSession(input);
}

function c1ProjectionFills(activity,adoption){
  const bySleeve=Object.fromEntries(ids.map(id=>[id,[]]));
  for(const fill of activity.fills){
    const order=activity.plan.orders.find(o=>o.id===fill.orderId),scale=adoption.seeds[order?.sleeve]?.actualDollarsPerModelDollar;
    if(!order||!positive(scale))throw new Error('Recorded intraday fill lost its C1 sleeve evidence');
    bySleeve[order.sleeve].push({symbol:fill.symbol,side:fill.side,reason:order.reason,shares:fill.shares/scale,price:fill.price,fee:fill.fee/scale,...(Number.isFinite(order.targetShares)?{targetShares:order.targetShares/scale}:{})});
  }
  return bySleeve;
}

// Re-run the unchanged current-session queue with already-recorded fills. This
// can expose the next queued entry after an unplanned owner sale frees a slot.
export function replanC1IntradayAccountOpening({adoption,sessions,historySessions,records,cashReconciliations,opening,observedAt,completionPolicy,activity,authorityPlan}={}){
  if(!activity?.tickets?.some(t=>t.recordingReason===ownerExitReason))return {activity,plan:authorityPlan};
  if(authorityPlan?.providerVerified!==true||activity.date!==authorityPlan.date||activity.plan.sourceSessionDate!==authorityPlan.sourceSessionDate)throw new Error('Verified current-session plan required after the recorded owner exit');
  adoption=withC1HistoricalPriceEvidence(adoption,historySessions||sessions);
  const continued=continueC1ActualAccount({adoption,sessions,historySessions:historySessions||sessions,records,cashReconciliations,observedAt}),actual=reconcileC1ActualAccountFills({plan:activity.plan,fills:activity.fills,observedAt});
  const rules=c1CompletionRules([...records,{date:opening.date,completionPolicy}],adoption.sourceSessionDate),projectionFills=c1ProjectionFills(activity,adoption);
  const remaining=planFromHistory({adoption,baseline:sessions.at(-1),opening,observedAt,books:actual.books,sessions,replay:continued.replay,projectionFills,accountCompletionRules:rules});
  const evidenceIds=new Set(activity.fills.map(f=>f.orderId)),evidenceOrders=activity.plan.orders.filter(o=>evidenceIds.has(o.id));
  const idsSeen=new Set(evidenceOrders.map(o=>o.id)),futureOrders=remaining.orders.map(o=>({...o,postExitReplacement:true}));
  for(const order of futureOrders)if(idsSeen.has(order.id))throw new Error('Replacement order identity conflicts with recorded activity');else idsSeen.add(order.id);
  const plan={...remaining,providerVerified:true,sourceReceipt:clone(authorityPlan.sourceReceipt),quoteValidUntil:authorityPlan.quoteValidUntil,openingBooks:clone(activity.plan.openingBooks),orders:[...clone(evidenceOrders),...futureOrders]};
  reconcileC1ActualAccountFills({plan,fills:activity.fills,observedAt});
  const nextActivity={...activity,plan:clone(plan),recordingEvidence:clone(plan)};
  return {activity:nextActivity,plan};
}

export function planC1ContinuedAccountOpening({adoption,sessions,historySessions,records,cashReconciliations,opening,observedAt,completionPolicy}={}) {
  adoption=withC1HistoricalPriceEvidence(adoption,historySessions||sessions);
  const continued=continueC1ActualAccount({adoption,sessions,historySessions:historySessions||sessions,records,cashReconciliations,observedAt});
  return planFromHistory({adoption,baseline:sessions.at(-1),opening,observedAt,books:continued.books,sessions,replay:continued.replay,accountCompletionRules:c1CompletionRules([...records,{date:opening.date,completionPolicy}],adoption.sourceSessionDate)});
}
