import {readC1CurrentEventEvidence} from './c1CurrentEventEvidence';
import {reviewC1OpeningPriceRevisions,verifiedC1OpeningPriceBasis} from './c1OpeningPriceReview';
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
import {withC1RecentMomentumIntradayAdvisories,readC1VerifiedIntradayQuote} from './c1RecentMomentumLivePolicy';
import {buildC1PurchaseDiagnostics,unavailableC1PurchaseDiagnostics} from './c1PurchaseDiagnostics';

// Current events withdraw only unfilled capital authority. Evidence stays on
// the transient opening response and is never copied into accounting records.
function currentEventCapitalReview({plan,opening,now}){
 if(!plan||!opening)return plan;
 const risks=Array.isArray(opening.currentEventEvidence)?opening.currentEventEvidence:[];
 const state=symbol=>{const found=risks.filter(r=>r?.symbol===symbol);return readC1CurrentEventEvidence(found.length===1?found[0]:null,now);};
 const blocked=(plan.orders||[]).filter(order=>order.side==='buy'&&state(order.symbol)!=='VERIFIED_CLEAR');
 if(!blocked.length)return plan;
 return {...plan,orders:plan.orders.filter(order=>!blocked.includes(order)),projectedBooks:null,
  entryReviews:[...(plan.entryReviews||[]),...blocked.map(order=>({sleeve:order.sleeve,symbol:order.symbol,
   reason:state(order.symbol)==='VERIFIED_BLOCKED'?'current-material-event-block':'event-verification-unavailable',source:'current-event-verification'}))]};
}

// Current risk can withdraw future capital without replaying a hypothetical
// current price as an opening fill. Standing stops retain their original
// conditional identity, and unexecuted sales never supply cash or position slots.
function currentStopCapitalReview({decision,plan,opening,now}){
 if(!plan||!opening)return {plan,blockedSymbols:new Set()};
 plan=currentEventCapitalReview({plan,opening,now});
 const priceBasisVerified=verifiedC1OpeningPriceBasis(plan.sourceReceipt),stops=new Map();
 const add=(symbol,price)=>{
  if(typeof price!=='number'||!Number.isFinite(price)||price<=0)return;
  if(!stops.has(symbol))stops.set(symbol,[]);
  stops.get(symbol).push(price);
 };
 for(const position of decision.positions||[])for(const stop of position.stops||[])add(position.symbol,stop.price);
 for(const order of plan.orders||[])if(order.side==='sell'&&order.condition==='stop-triggered')add(order.symbol,order.estimatedPrice);
 const blockedSymbols=new Set();
 for(const [symbol,levels] of stops){
  const quote=readC1VerifiedIntradayQuote({opening:{...opening,receipt:plan.sourceReceipt},symbol,
   sourceSessionDate:decision.sourceSessionDate,current:decision.current===true,now,priceBasisVerified});
  if(quote&&levels.some(stop=>quote.price<=stop))blockedSymbols.add(symbol);
 }
 const blocked=(plan.orders||[]).filter(order=>order.side==='buy'&&blockedSymbols.has(order.symbol));
 if(!blocked.length)return {plan,blockedSymbols};
 // capC1ExecutionCash reconstructs projected ownership from these permitted
 // orders. Clearing only the disposable projection avoids retaining a removed
 // hypothetical purchase; actual opening books and saved activity are intact.
 return {blockedSymbols,plan:{...plan,orders:plan.orders.filter(order=>order.side!=='buy'||!blockedSymbols.has(order.symbol)),
  projectedBooks:null,entryReviews:[...(plan.entryReviews||[]),...blocked.map(order=>({sleeve:order.sleeve,
   symbol:order.symbol,reason:'existing-stop-or-exit',source:'verified-intraday-stop'}))]}};
}

export function pendingC1AccountSession({account,book,now=new Date()}={}) {
 book=c1AccountReviewBook(c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),account.holdingRankReviews);
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 const all=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate),index=all.findIndex(s=>s.date===through);
 if(index<0||index===all.length-1)return null;
 assertC1AccountRevisionCoverage(book,account,all[index+1].date);
 const openingObservedAt=book.captures.find(c=>c.sessionDate===all[index+1].date)?.observedAt;
 const adoption=withC1HistoricalPriceEvidence(account.adoption,book.model.sessions,{historicalAdoption:true}),sessions=all.slice(0,index+1),opening={...all[index+1],...(account.intradayActivity?.plan.entryRecheck?{entryRecheck:account.intradayActivity.plan.entryRecheck}:{})};
 const continued=continueC1ActualAccount({adoption,sessions,historySessions:book.model.sessions,records:account.records,cashReconciliations:account.cashReconciliations,observedAt:now});
 const plan=projectC1AccountSession({adoption,baseline:sessions.at(-1),opening,observedAt:openingObservedAt,books:continued.books,sessions,historySessions:book.model.sessions,replay:continued.replay,accountCompletionRules:c1CompletionRules([...account.records,{date:opening.date,completionPolicy:c1CompletionPolicy(account.positionContext)}],adoption.sourceSessionDate),
  purchaseFundingIndependent:account.records.some(record=>record.executionEvidence?.purchaseFundingPolicy==='brokerage-cash-only-v1')});
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
export async function prepareC1AccountExecution({account,book,now=new Date(),collectOpening,recordTicket,expectedRevision,includePurchaseDiagnostics=false,diagnosticCommit}={}){
 const savedAccount=account,marketClock=easternMarketClock(now);
 let analysis=deriveC1AccountAnalysis({account,book,now}),openingPlan=null,openingError=null,intradaySession=null,verifiedIntradayOpening=null;
 // Response-only evidence: retain what this request already uses. Never attach
 // it to an account, plan, activity or recording path, or run another review.
 const diagnosticContext=includePurchaseDiagnostics&&!recordTicket?{
  baseline:book.model.sessions.find(session=>session.date===analysis.decision.sourceSessionDate)||null,
  sourceBasis:'ACCEPTED_INDEX',sourceCapture:book.captures.find(capture=>capture.sessionDate===analysis.decision.sourceSessionDate)||null,
  decision:analysis.decision,requestedSymbols:null,collectionStatus:'NOT_ATTEMPTED',collectedOpening:null,
  requestObservedAt:now.toISOString()
 }:null;
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
   if(diagnosticContext){diagnosticContext.baseline=baseline;diagnosticContext.sourceBasis='REQUEST_ACCOUNT_BASELINE';}
   const continuation={adoption:account.adoption,sessions,historySessions,records:account.records,cashReconciliations:account.cashReconciliations,completionPolicy:c1CompletionPolicy(account.positionContext),purchaseFundingIndependent:true,additionalSwingCapacity:true};
   let opening=null,openingReady=false;
   try{
    if(diagnosticContext){diagnosticContext.requestedSymbols=[...analysis.decision.requiredOpeningSymbols];diagnosticContext.collectionStatus='REQUESTED';}
    const collected=await collectOpening({baseline,symbols:analysis.decision.requiredOpeningSymbols,now,allowPriceRevisionReview:true});
    if(diagnosticContext){diagnosticContext.collectedOpening=collected;diagnosticContext.collectionStatus=collected?'RETURNED':'NO_OBSERVATION';}
    // Collection stamps its validated server completion time, which can be
    // later than the request clock. Provider timestamps never advance this
    // clock; retain the collector's existing bounded regular-session window.
    const completedAt=Date.parse(collected?.receipt?.observedAt),completedClock=easternMarketClock(new Date(completedAt));
    if(Number.isFinite(completedAt)&&completedAt>now.getTime()&&completedAt-now.getTime()<=120000&&
     completedClock?.key===easternMarketClock(now)?.key&&marketExecutionState(new Date(completedAt)).isOpen)now=new Date(completedAt);
    opening=collected?c1IntradayEntryRecheck({account,opening:{...collected,currentEventEvidence:Array.isArray(collected.currentEventEvidence)?collected.currentEventEvidence:[]},baseline,now}):null;
    if(opening){
     openingReady=true;
     openingPlan=planC1ContinuedAccountOpening({...continuation,opening,observedAt:opening.receipt.observedAt});
     openingPlan={...openingPlan,providerVerified:true,sourceReceipt:opening.receipt,quoteValidUntil:new Date(Math.min(...opening.prices.map(p=>Date.parse(p.observedAt)+C1_MANUAL_RECOMMENDATION_VALIDITY_MS))).toISOString()};
     openingPlan=reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan:openingPlan,now});
     verifiedIntradayOpening={...opening,receipt:openingPlan.sourceReceipt};
     openingPlan=currentStopCapitalReview({decision:analysis.decision,plan:openingPlan,opening:verifiedIntradayOpening,now}).plan;
     if(account.intradayActivity?.plan.recordingOnly)account={...account,intradayActivity:rebaseC1RecordedExitActivity({activity:account.intradayActivity,plan:openingPlan,now})};
     if(account.intradayActivity)account={...account,intradayActivity:rebaseC1UnfilledEntryPlan({activity:account.intradayActivity,plan:openingPlan,now})};
     const replan=()=>{
      if(!account.intradayActivity?.tickets.some(t=>t.recordingReason==='owner-discretionary-exit'))return;
      const next=replanC1IntradayAccountOpening({...continuation,opening,observedAt:opening.receipt.observedAt,activity:account.intradayActivity,authorityPlan:openingPlan});
      account={...account,intradayActivity:next.activity};
      openingPlan=currentStopCapitalReview({decision:analysis.decision,plan:next.plan,opening:verifiedIntradayOpening,now}).plan;
     };
     replan();
     if(recordTicket){
      const duplicate=account.intradayActivity?.tickets?.some(ticket=>ticket.id===recordTicket.id&&JSON.stringify(ticket)===JSON.stringify(recordTicket));
      if(recordTicket.side==='buy'&&!duplicate){
       const current=verifiedIntradayOpening.currentEventEvidence.filter(risk=>risk?.symbol===recordTicket.symbol);
       if(readC1CurrentEventEvidence(current.length===1?current[0]:null,now)!=='VERIFIED_CLEAR')
        throw new Error('Current corporate-event verification does not authorize a new purchase or addition.');
      }
      if(recordTicket.side==='buy'&&!duplicate&&currentStopCapitalReview({decision:analysis.decision,plan:openingPlan,opening:verifiedIntradayOpening,now}).blockedSymbols.has(recordTicket.symbol))
       throw new Error('A verified current price is at or below the existing C1 stop; no new purchase or addition is authorized.');
      account=recordC1IntradayActivity({account,plan:openingPlan,ticket:recordTicket,expectedRevision,now});replan();
     }
     analysis=deriveC1AccountAnalysis({account,book,now});
     intradaySession=intradayView(account,openingPlan);
     if(account.intradayActivity)openingPlan=c1IntradayRemainingPlan({plan:openingPlan,activity:account.intradayActivity,opening,baseline,decision:analysis.decision,now});
     openingPlan=currentStopCapitalReview({decision:analysis.decision,plan:openingPlan,opening:verifiedIntradayOpening,now}).plan;
    }
   }catch(error){
    if(recordTicket&&openingReady)throw error;
    if(diagnosticContext?.collectionStatus==='REQUESTED')diagnosticContext.collectionStatus='FAILED';
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
 const decision=verifiedIntradayOpening?withC1RecentMomentumIntradayAdvisories(analysis.decision,verifiedIntradayOpening,now,
  {priceBasisVerified:verifiedC1OpeningPriceBasis(verifiedIntradayOpening.receipt)}):analysis.decision;
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
 const eventExpiries=(openingPlan?.orders||[]).filter(order=>order.side==='buy').map(order=>{
  const risk=verifiedIntradayOpening?.currentEventEvidence?.find(row=>row.symbol===order.symbol);
  return readC1CurrentEventEvidence(risk,now)==='VERIFIED_CLEAR'?Date.parse(risk.eventVerification.expiresAt):NaN;
 });
 const eventValidUntil=eventExpiries.length&&eventExpiries.every(Number.isFinite)?new Date(Math.min(...eventExpiries)).toISOString():undefined;
 const manualRecommendations=buildC1ManualRecommendations({decision:executionDecision,pendingSession:decision.current?null:pendingSession,openingPlan,openingError,eventValidUntil,now});
 const view={account,decision,executionDecision,pendingSession,pendingSessions,intradaySession,openingPlan,openingError,manualRecommendations};
 if(diagnosticContext){
  const identity={requestObservedAt:diagnosticContext.requestObservedAt,observedAt:now.toISOString(),commit:diagnosticCommit,sourceSessionDate:diagnosticContext.decision.sourceSessionDate};
  try{view.purchaseDiagnostics=buildC1PurchaseDiagnostics({...diagnosticContext,...identity,plan:openingPlan,openingError,manualRecommendations,reconciliations:book.reconciliations});}
  catch{view.purchaseDiagnostics=unavailableC1PurchaseDiagnostics(identity);}
 }
 return view;
}
