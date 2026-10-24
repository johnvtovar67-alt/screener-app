import {marketExecutionState,latestCompletedMarketSessionDay} from './marketSession';
import {c1ManualReviewCurrent,buildC1ManualRecommendations} from './c1ManualRecommendations';

// Observe only already-computed server responses. No acquisition, persistence,
// quantity generation, screen override, or new execution gate lives here.
export function c1AccountOperationalStatus(view,{operation,now=new Date(),requestId,commit}={}){
 const decision=view?.decision,execution=view?.executionDecision||decision;
 const report={contract:'c1-account-operational-status-v1',boundary:'ACCOUNT_RESPONSE',
  operation:operation==='refresh-analysis'?'ANALYSIS':operation==='prepare-execution'?'OPENING_REVIEW':'OTHER',
  requestId:/^[a-f0-9-]{36}$/.test(requestId||'')?requestId:null,
  commit:/^[a-f0-9]{7,40}$/.test(commit||'')?commit:'local',
  sourceSessionDate:/^\d{4}-\d{2}-\d{2}$/.test(decision?.sourceSessionDate||'')?decision.sourceSessionDate:null,
  executable:false,screenComposition:'NOT_VERIFIED',privateAccountParity:'NOT_VERIFIED'};
 const result=code=>({...report,code});
 if(decision?.contract!=='c1-account-decision-v1'||!Array.isArray(decision.positions)||
  !decision.decisionId||!Number.isSafeInteger(decision.revision))return result('ACCOUNT_RESPONSE_INCOMPLETE');
 if(decision.current!==true||decision.sourceSessionDate!==latestCompletedMarketSessionDay(now))return result('ACCOUNT_SESSION_NOT_CURRENT');
 if(view.holdingReviewError)return result('HOLDING_VERIFICATION_INCOMPLETE');
 if(!marketExecutionState(now).isOpen)return result('MARKET_CLOSED');
 // A GET analysis does not request opening authority. Do not falsely log an
 // expected null openingPlan as a provider failure on every normal refresh.
 if(operation==='refresh-analysis')return result('ACCOUNT_ANALYSIS_ONLY');
 if(operation!=='prepare-execution')return result('BOUNDARY_NOT_ASSESSED');
 if(view.pendingSession)return result('ACCOUNT_ACTIVITY_PENDING');
 if(view.openingError)return result('OPENING_VERIFICATION_INCOMPLETE');
 const plan=view.openingPlan,review=view.manualRecommendations;
 // Reuse the existing validator of supplied opening orders. It does not
 // project or generate quantities, fetch data, or change the returned view.
 const checked=buildC1ManualRecommendations({decision:execution,openingPlan:plan,now});
 const sameSource=execution?.sourceSessionDate===decision.sourceSessionDate&&execution?.revision===decision.revision&&
  String(execution?.decisionId).split(':')[0]===String(decision.decisionId).split(':')[0];
 if(!sameSource||checked.status!=='ready'||!Array.isArray(review?.orders)||
  JSON.stringify(checked.orders)!==JSON.stringify(review.orders)||!c1ManualReviewCurrent(review,execution,now))
  return result('OPENING_REVIEW_NOT_CURRENT');
 const buyOrderCount=review.orders.filter(order=>order.side==='buy'&&!order.condition).length;
 const sellOrderCount=review.orders.filter(order=>order.side==='sell'&&!order.condition).length;
 // This is account-boundary state, not a claim that screen/browser gates or
 // broker execution passed. A conditional replacement is not a checked buy.
 return {...result(buyOrderCount?'CHECKED_BUY_ORDERS_PRESENT':'CHECKED_ZERO_UNCONDITIONAL_BUY_ORDERS'),buyOrderCount,sellOrderCount};
}

export function logC1AccountOperationalStatus(view,context,emit=(...args)=>console.info(...args)){
 try{emit('C1_ACCOUNT_OPERATIONAL',JSON.stringify(c1AccountOperationalStatus(view,context)));}
 catch{/* Diagnostics must never alter an API response or trigger a retry. */}
}
