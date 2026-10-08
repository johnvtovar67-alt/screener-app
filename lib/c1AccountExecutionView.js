import {reviewC1OpeningPriceRevisions} from './c1OpeningPriceReview';
import {c1IntradayEntryRecheck,rebaseC1UnfilledEntryPlan,recordC1IntradayActivity,c1IntradayRemainingPlan,c1RecordedExitPlan,rebaseC1RecordedExitActivity} from './c1IntradayActivity';
import {buildC1ManualRecommendations,C1_MANUAL_RECOMMENDATION_VALIDITY_MS} from './c1ManualRecommendations';
import {applyC1OpeningPlan} from './c1AccountDecision';
import {c1AccountBook,assertC1AccountRevisionCoverage} from './c1AccountInput';
import {c1AccountReviewBook} from './c1HeldRankReview';
import {continueC1ActualAccount,reconcileC1ActualAccountFills,c1CompletionPolicy,c1CompletionRules} from './c1AccountLedger';
import {capC1ExecutionCash,c1ExecutionRecordingPlan} from './c1ExecutionCashAuthority';
import {planC1ContinuedAccountOpening,replanC1IntradayAccountOpening} from './c1AccountExecution';
import {projectC1AccountSession} from './c1AccountProjection';
import {withC1HistoricalPriceEvidence} from './c1AccountSeed';
import {deriveC1CompletedAccount,deriveC1AccountAnalysis} from './c1AccountService';
import {easternMarketClock,marketExecutionState,marketSessionCloseMinutes,latestCompletedMarketSessionDay} from './marketSession';

export function pendingC1AccountSession({account,book,now=new Date()}={}) {
 book=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 const all=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate),index=all.findIndex(s=>s.date===through);
 if(index<0||index===all.length-1)return null;
 assertC1AccountRevisionCoverage(book,account,all[index+1].date);
 const openingObservedAt=book.captures.find(c=>c.sessionDate===all[index+1].date)?.observedAt;
 const adoption=withC1HistoricalPriceEvidence(account.adoption,book.model.sessions),sessions=all.slice(0,index+1),opening={...all[index+1],...(account.intradayActivity?.plan.entryRecheck?{entryRecheck:account.intradayActivity.plan.entryRecheck}:{})};
 const continued=continueC1ActualAccount({adoption,sessions,historySessions:book.model.sessions,records:account.records,cashReconciliations:account.cashReconciliations,observedAt:now});
 const plan=projectC1AccountSession({adoption,baseline:sessions.at(-1),opening,observedAt:openingObservedAt,books:continued.books,sessions,replay:continued.replay,accountCompletionRules:c1CompletionRules([...account.records,{date:opening.date,completionPolicy:c1CompletionPolicy(account.positionContext)}],adoption.sourceSessionDate)});
 return {date:all[index+1].date,openingObservedAt,plan,revision:account.revision};
}

// Recover a replacement that was computed after an owner-recorded exit but
// was not durably attached to an older accounting-only activity record. This
// is retrospective only: the accepted completed-session opening reconstructs
// the same dated queue, and a later broker ticket must still report a fill
// executed during that regular session. No current recommendation is created.
export function recoverC1CompletedOwnerExitActivity({account,book,now=new Date()}={}) {
 const activity=account?.intradayActivity;
 if(!activity?.tickets?.some(t=>t.recordingReason==='owner-discretionary-exit')||activity.fills?.some(f=>f.side==='buy')||activity.plan?.orders?.some(o=>o.side==='buy'&&o.postExitReplacement===true))return null;
 if(activity.date!==latestCompletedMarketSessionDay(now))return null;
 const pending=pendingC1AccountSession({account,book,now});
 if(!pending||pending.date!==activity.date||pending.plan.sourceSessionDate!==activity.plan.sourceSessionDate)return null;
 const input=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
 const sessions=input.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate&&s.date<activity.date),opening=input.model.sessions.find(s=>s.date===activity.date);
 if(!opening||sessions.at(-1)?.date!==activity.plan.sourceSessionDate)return null;
 const capture=book.captures.find(c=>c.sessionDate===activity.date);
 if(!capture?.hash||capture.observedAt!==pending.openingObservedAt)return null;
 const observedAt=new Date(Math.max(Date.parse(activity.openingObservedAt||activity.plan.observedAt),...activity.fills.map(fill=>Date.parse(fill.executedAt)))).toISOString();
 const authorityPlan={...pending.plan,observedAt,providerVerified:true,recoveryOnly:true,sourceReceipt:{contract:'c1-completed-session-opening-recovery-v1',sourceSessionDate:activity.plan.sourceSessionDate,date:activity.date,observedAt,completedInputObservedAt:capture.observedAt,sourceHash:capture.hash,completedSession:true,executable:false}};
 const recovered=replanC1IntradayAccountOpening({adoption:account.adoption,sessions,historySessions:input.model.sessions,records:account.records,cashReconciliations:account.cashReconciliations,opening,observedAt,completionPolicy:c1CompletionPolicy(account.positionContext),activity,authorityPlan}).activity;
 if(!recovered.plan.orders.some(o=>o.side==='buy'&&o.postExitReplacement===true))return null;
 return recovered;
}

function intradayView(account,plan,extra={}){
 const activity=account.intradayActivity;
 return {date:plan.date,revision:account.revision,plan:activity?.plan||plan,fills:activity?.fills||[],tickets:activity?.tickets||[],...extra};
}

// Historical entry evidence belongs to the explicit execution/recording path.
// Display analysis derives ownership without constructing these opening plans.
function completedTradeSessions({account,book,now}){
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 return book.model.sessions.filter(s=>s.date>through&&s.date<=latestCompletedMarketSessionDay(now)&&s.date!==account.intradayActivity?.date).map(session=>{
  const prior=deriveC1CompletedAccount({account,book,now,beforeDate:session.date});
  return pendingC1AccountSession({account:prior,book,now});
 }).filter(Boolean);
}

// This is downstream of completed-session Account Decision. It verifies an
// opening only when explicitly requested, never writes storage, and keeps its
// action overlay separate from the authoritative ownership analysis.
export async function prepareC1AccountExecution({account,book,now=new Date(),collectOpening,recordTicket,expectedRevision}={}){
 const savedAccount=account,marketClock=easternMarketClock(now);
 let analysis=deriveC1AccountAnalysis({account,book,now}),openingPlan=null,openingError=null,intradaySession=null;
 const afterClose=account.intradayActivity?.date===marketClock?.key&&marketClock.minutes>=marketSessionCloseMinutes(marketClock.key);
 if(afterClose){
  let activity=account.intradayActivity;
  try{activity=recoverC1CompletedOwnerExitActivity({account,book,now})||activity;}
  catch(error){if(recordTicket)throw error;openingError=String(error?.message||'Completed execution evidence unavailable').slice(0,200);}
  account={...account,intradayActivity:activity};
  if(recordTicket)account=recordC1IntradayActivity({account,plan:activity.plan,ticket:recordTicket,expectedRevision,now});
  intradaySession=intradayView(account,activity.plan,{afterClose:true});
  analysis=deriveC1AccountAnalysis({account,book,now});
 }else{
  account=analysis.account;
  if(analysis.decision.current&&marketExecutionState(now).isOpen){
   const input=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
   const historySessions=input.model.sessions,sessions=historySessions.filter(s=>s.date>=account.adoption.sourceSessionDate&&s.date<=analysis.decision.sourceSessionDate),baseline=sessions.at(-1);
   const continuation={adoption:account.adoption,sessions,historySessions,records:account.records,cashReconciliations:account.cashReconciliations,completionPolicy:c1CompletionPolicy(account.positionContext)};
   let opening=null,openingReady=false;
   try{
    const collected=await collectOpening({baseline,symbols:analysis.decision.requiredOpeningSymbols,now,allowPriceRevisionReview:true});
    opening=collected?c1IntradayEntryRecheck({account,opening:collected,baseline,now}):null;
    if(opening){
     openingReady=true;
     openingPlan=planC1ContinuedAccountOpening({...continuation,opening,observedAt:opening.receipt.observedAt});
     openingPlan={...openingPlan,providerVerified:true,sourceReceipt:opening.receipt,quoteValidUntil:new Date(Math.min(...opening.prices.map(p=>Date.parse(p.observedAt)+C1_MANUAL_RECOMMENDATION_VALIDITY_MS))).toISOString()};
     openingPlan=reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan:openingPlan,now});
     if(account.intradayActivity?.plan.recordingOnly)account={...account,intradayActivity:rebaseC1RecordedExitActivity({activity:account.intradayActivity,plan:openingPlan,now})};
     if(account.intradayActivity)account={...account,intradayActivity:rebaseC1UnfilledEntryPlan({activity:account.intradayActivity,plan:openingPlan,now})};
     const replan=()=>{
      if(!account.intradayActivity?.tickets.some(t=>t.recordingReason==='owner-discretionary-exit'))return;
      const next=replanC1IntradayAccountOpening({...continuation,opening,observedAt:opening.receipt.observedAt,activity:account.intradayActivity,authorityPlan:openingPlan});
      account={...account,intradayActivity:next.activity};openingPlan=next.plan;
     };
     replan();
     if(recordTicket){account=recordC1IntradayActivity({account,plan:openingPlan,ticket:recordTicket,expectedRevision,now});replan();}
     analysis=deriveC1AccountAnalysis({account,book,now});
     intradaySession=intradayView(account,openingPlan);
     if(account.intradayActivity)openingPlan=c1IntradayRemainingPlan({plan:openingPlan,activity:account.intradayActivity,opening,baseline,decision:analysis.decision,now});
    }
   }catch(error){
    if(recordTicket&&openingReady)throw error;
    openingPlan=null;openingError=String(error?.message||'Opening plan unavailable').slice(0,200);
    console.warn('C1_OPENING_UNAVAILABLE',JSON.stringify({reason:openingError}));
   }
   if(!intradaySession){
    const continued=continueC1ActualAccount({...continuation,observedAt:now});
    const recordingPlan=account.intradayActivity?.plan||c1RecordedExitPlan({continued,now});
    if(recordingPlan){
     if(recordTicket){
      if(recordTicket.side!=='sell')throw new Error('New purchases require the current opening checks. A completed pending exit can still be recorded.');
      account=recordC1IntradayActivity({account,plan:recordingPlan,ticket:recordTicket,expectedRevision,now});
      analysis=deriveC1AccountAnalysis({account,book,now});
     }
     intradaySession=intradayView(account,recordingPlan,{sellOnly:true});
    }
   }
  }
 }
 if(recordTicket&&!intradaySession)throw new Error('Current-session prices are unavailable; the trade has not been saved. Retry during the regular session.');
 let pendingSessions=[];
 try{pendingSessions=completedTradeSessions({account:savedAccount,book,now});}
 catch(error){if(recordTicket)throw error;openingError=String(error?.message||'Historical execution plan unavailable').slice(0,200);}
 const pendingSession=pendingSessions.at(-1)||null;
 const decision=analysis.decision;
 if(openingPlan)openingPlan=capC1ExecutionCash({plan:openingPlan,account,strategyCash:decision.strategyCash??decision.actualCash,now});
 if(intradaySession){
  const activity=account.intradayActivity;
  if(activity){
   const actual=reconcileC1ActualAccountFills({plan:activity.plan,fills:activity.fills,observedAt:now.toISOString()});
   const authorityPlan=openingPlan||capC1ExecutionCash({plan:{...activity.plan,openingBooks:actual.books,orders:actual.outstanding},account,strategyCash:actual.actualCash,now});
   intradaySession={...intradaySession,plan:c1ExecutionRecordingPlan({plan:activity.plan,authorityPlan,activity})};
  }else if(openingPlan)intradaySession={...intradaySession,plan:openingPlan};
 }
 const executionDecision=openingPlan?applyC1OpeningPlan(decision,openingPlan):decision;
 const manualRecommendations=buildC1ManualRecommendations({decision:executionDecision,pendingSession:decision.current?null:pendingSession,openingPlan,openingError,now});
 return {account,decision,executionDecision,pendingSession,pendingSessions,intradaySession,openingPlan,openingError,manualRecommendations};
}
