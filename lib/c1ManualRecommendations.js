import {marketExecutionState,easternMarketClock,marketSessionDistance} from './marketSession';

// Owner authorization restores manual review, not historical certification or
// brokerage execution. Only the authenticated account API grants this status.
export const C1_MANUAL_POLICY='c1-owner-authorized-manual-20260911';
export function buildC1ManualRecommendations({decision,openingPlan,pendingSession,openingError,now=new Date()}={}){
 const base={policy:C1_MANUAL_POLICY,enabled:true,status:'waiting',orders:[],brokerageExecutionAuthorized:false,independentlyValidated:false,
  limitations:'Historical sector provenance and strategy-selection uncertainty remain unresolved. Alpha is not certified.'};
 if(!decision?.current||pendingSession)return {...base,reason:'Record outstanding account activity and refresh.'};
 if(openingError)return {...base,reason:'Opening checks did not pass: '+openingError};
 if(!marketExecutionState(now).isOpen)return {...base,reason:'Manual quantities become available during the regular session after opening checks pass.'};
 const plan=openingPlan,stamp=Date.parse(plan?.observedAt),receipt=plan?.sourceReceipt;
 if(plan?.contract!=='c1-actual-account-opening-plan-v1'||plan.providerVerified!==true||plan.sourceSessionDate!==decision.sourceSessionDate||
  plan.pilot?.contract!=='c1-account-limited-pilot-v1'||plan.pilot.enforced!==true||plan.pilot.maxNames!==3||plan.pilot.maxPositionPct!==.01||plan.pilot.confirmationSessions!==2||
  !receipt||receipt.observedAt!==plan.observedAt||receipt.membershipCheckedTwice!==true||receipt.previousAdjustedClosesUnchanged!==true||
  !Number.isFinite(Date.parse(plan.quoteValidUntil))||Date.parse(plan.quoteValidUntil)<=now.getTime()||!Number.isFinite(stamp)||stamp>now.getTime()||now.getTime()-stamp>=120000||plan.date!==easternMarketClock(now)?.key||!Array.isArray(plan.orders))
  return {...base,reason:'Refresh for verified account opening prices and membership.'};
 const ids=new Set();
 const holdings=new Map(),books=plan.openingBooks;
 if(!books||!['base','cooldown15','sector40'].every(id=>books[id]&&Number.isFinite(books[id].cash)&&books[id].cash>=0&&books[id].positions&&typeof books[id].positions==='object'))return {...base,reason:'Account pilot checks did not pass.'};
 for(const book of Object.values(books))for(const [symbol,position] of Object.entries(book.positions)){
  if(!Number.isSafeInteger(position?.shares)||position.shares<0)return {...base,reason:'Account pilot checks did not pass.'};
  holdings.set(symbol,(holdings.get(symbol)||0)+position.shares);
 }
 for(const o of plan.orders){
  if(ids.has(o.id)||!o.id||!['buy','sell'].includes(o.side)||!Number.isSafeInteger(o.shares)||o.shares<=0||!Number.isFinite(o.estimatedPrice)||o.estimatedPrice<=0||
   (o.side==='buy'&&['MSTR','SCHW'].includes(o.symbol)))return {...base,reason:'Account order checks did not pass.'};
  ids.add(o.id);
  if(o.condition)continue;
  const before=holdings.get(o.symbol)||0;
  if(o.side==='sell'){
   if(o.shares>before)return {...base,reason:'Account pilot checks did not pass.'};
   if(o.shares===before)holdings.delete(o.symbol);else holdings.set(o.symbol,before-o.shares);
   continue;
  }
  const dates=o.pilot?.confirmedSessionDates;
  const maxShares=Math.floor(plan.pilot.openingEquity*plan.pilot.maxPositionPct/o.estimatedPrice+1e-9);
  if(o.pilot?.contract!==plan.pilot.contract||!Array.isArray(dates)||dates.length!==2||dates[1]!==decision.sourceSessionDate||marketSessionDistance(dates[0],dates[1])!==1||
   o.pilot.positionSharesBefore!==before||o.pilot.maxPositionShares!==maxShares||before+o.shares>maxShares||(!before&&holdings.size>=plan.pilot.maxNames))return {...base,reason:'Account pilot checks did not pass.'};
  holdings.set(o.symbol,before+o.shares);
 }
 const clock=easternMarketClock(now),closeAt=now.getTime()+((960-clock.minutes)*60-clock.second)*1000-now.getUTCMilliseconds();
 return {...base,status:'ready',decisionId:decision.decisionId,revision:decision.revision,sourceSessionDate:decision.sourceSessionDate,
  date:plan.date,observedAt:plan.observedAt,validUntil:new Date(Math.min(stamp+120000,Date.parse(plan.quoteValidUntil),closeAt)).toISOString(),orders:plan.orders,
  pilot:{...plan.pilot},reason:'Limited manual pilot enabled. New positions require two completed-session confirmation, no more than three names, and at most 1% of opening Swing equity per name. Confirm the current execution price and available cash before placing each order.'};
}
export function c1ManualReviewCurrent(review,decision,now=new Date()){
 return review?.policy===C1_MANUAL_POLICY&&review.status==='ready'&&decision?.current===true&&review.decisionId===decision.decisionId&&review.revision===decision.revision&&
  review.sourceSessionDate===decision.sourceSessionDate&&marketExecutionState(now).isOpen&&review.date===easternMarketClock(now)?.key&&
  Date.parse(review.observedAt)<=now.getTime()&&now.getTime()<Date.parse(review.validUntil);
}

// Portfolio shows only checked, unconditional buys. Candidate discovery stays on Opportunities.
export function c1ManualOrdersForView({review,decision,openingPlan,view,now=new Date()}){
 if(!openingPlan||!c1ManualReviewCurrent(review,decision,now))return [];
 return (review.orders||[]).filter(order=>view!=='portfolio'||(order.side==='buy'&&!order.condition));
}
