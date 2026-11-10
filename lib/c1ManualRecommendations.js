import {verifiedC1OpeningPriceBasis} from './c1OpeningPriceReview';
import {marketExecutionState,easternMarketClock,marketSessionCloseMinutes} from './marketSession';
import {c1AccountPolicyActive,resolveC1AccountActions} from './c1AccountActions';

// Owner authorization restores manual review, not historical certification or
// brokerage execution. Only the authenticated account API grants this status.
export const C1_MANUAL_POLICY='c1-owner-authorized-manual-20260911';
// Opening-gap evidence is fixed at the session open. Keep the manually
// reviewed quantity available long enough to act, while still requiring the
// owner to confirm the current broker price and cash before submitting.
export const C1_MANUAL_RECOMMENDATION_VALIDITY_MS=10*60*1000;
export function buildC1ManualRecommendations({decision,openingPlan,pendingSession,openingError,eventValidUntil,now=new Date()}={}){
 const base={policy:C1_MANUAL_POLICY,enabled:true,status:'waiting',orders:[],brokerageExecutionAuthorized:false,independentlyValidated:false,
  limitations:'Historical sector provenance and strategy-selection uncertainty remain unresolved. Alpha is not certified.'};
 if(!decision?.current||pendingSession)return {...base,reason:decision?.updateReason||(pendingSession?'Confirm completed-session activity in Account settings.':'Market-data update pending. Reload after the update completes.')};
 if(openingError)return {...base,reason:'Opening checks did not pass: '+openingError};
 if(!marketExecutionState(now).isOpen)return {...base,reason:'Manual quantities become available during the regular session after opening checks pass.'};
 const plan=openingPlan,stamp=Date.parse(plan?.observedAt),receipt=plan?.sourceReceipt;
 if(plan?.policyPublicationStatus==='operational-risk-decision-pending')return {...base,policyVersion:plan.accountPolicy?.version,
  reason:'The operational portfolio-risk baseline requires the explicit owner decision. Fresh purchases remain paused; existing holding exits and recorded trades remain available.'};
 if(plan?.contract!=='c1-actual-account-opening-plan-v1'||plan.providerVerified!==true||plan.sourceSessionDate!==decision.sourceSessionDate||
  !receipt||receipt.observedAt!==plan.observedAt||receipt.membershipCheckedTwice!==true||!verifiedC1OpeningPriceBasis(receipt)||
  !Number.isFinite(Date.parse(plan.quoteValidUntil))||Date.parse(plan.quoteValidUntil)<=now.getTime()||!Number.isFinite(stamp)||stamp>now.getTime()||now.getTime()-stamp>=C1_MANUAL_RECOMMENDATION_VALIDITY_MS||plan.date!==easternMarketClock(now)?.key||!Array.isArray(plan.orders))
  return {...base,reason:'Refresh for verified account opening prices and membership.'};
 if(eventValidUntil!==undefined&&(!Number.isFinite(Date.parse(eventValidUntil))||Date.parse(eventValidUntil)<=now.getTime()))return {...base,reason:'Current event verification is incomplete; purchases remain paused.'};
 const ids=new Set();
 for(const o of plan.orders){
  if(ids.has(o.id)||!o.id||!['buy','sell'].includes(o.side)||!Number.isSafeInteger(o.shares)||o.shares<=0||!Number.isFinite(o.estimatedPrice)||o.estimatedPrice<=0||
   (o.side==='buy'&&['MSTR','SCHW'].includes(o.symbol)))return {...base,reason:'Account order checks did not pass.'};
  ids.add(o.id);
 }
 if(c1AccountPolicyActive(plan.accountPolicy)){
  const identity=decision.actionVersion||decision.decisionId;
  const resolved=resolveC1AccountActions({orders:plan.orders,positions:decision.positions,accountPolicy:plan.accountPolicy,decisionId:identity,activeExitSymbols:plan.activeExitSymbols});
  if(plan.actionVersion!==identity||resolved.blockedOrders.length||decision.accountPolicy?.identity!==plan.accountPolicy.identity)
   return {...base,reason:'Account action versions or stock-level restrictions do not match. Refresh the complete account review.'};
 }
 const clock=easternMarketClock(now),closeAt=now.getTime()+((marketSessionCloseMinutes(clock.key)-clock.minutes)*60-clock.second)*1000-now.getUTCMilliseconds();
 return {...base,status:'ready',decisionId:decision.decisionId,revision:decision.revision,sourceSessionDate:decision.sourceSessionDate,
  date:plan.date,observedAt:plan.observedAt,validUntil:new Date(Math.min(stamp+C1_MANUAL_RECOMMENDATION_VALIDITY_MS,Date.parse(plan.quoteValidUntil),closeAt,...(eventValidUntil?[Date.parse(eventValidUntil)]:[]))).toISOString(),orders:plan.orders,
  ...(c1AccountPolicyActive(plan.accountPolicy)?{actionVersion:plan.actionVersion,accountActions:plan.accountActions,policyVersion:plan.accountPolicy.version}:{}),
  reason:'Manual review enabled. Quantities use verified opening prices; confirm the current execution price and available cash before placing each order.'};
}
export function c1ManualReviewCurrent(review,decision,now=new Date()){
 return (!c1AccountPolicyActive(decision?.accountPolicy)||(review.actionVersion===(decision.actionVersion||decision.decisionId)&&review.policyVersion===decision.accountPolicy.version))&&review?.policy===C1_MANUAL_POLICY&&review.status==='ready'&&decision?.current===true&&review.decisionId===decision.decisionId&&review.revision===decision.revision&&
  review.sourceSessionDate===decision.sourceSessionDate&&marketExecutionState(now).isOpen&&review.date===easternMarketClock(now)?.key&&
  Date.parse(review.observedAt)<=now.getTime()&&now.getTime()<Date.parse(review.validUntil);
}

// Portfolio shows only checked, unconditional buys. Candidate discovery stays on Opportunities.
export function c1ManualOrdersForView({review,decision,openingPlan,view,now=new Date()}){
 if(!openingPlan||!c1ManualReviewCurrent(review,decision,now))return [];
 return (review.orders||[]).filter(order=>view!=='portfolio'||(order.side==='buy'&&!order.condition));
}
