import {appendC1NonCashAdoption} from '../../lib/c1NonCashAdoption';
import {reviewC1NonCashAdoption,verifyC1NonCashReceipts} from '../../lib/c1NonCashAdoptionReview';
import {createHash,randomUUID} from 'node:crypto';
import {c1AccountApiFailure,c1AccountDependency} from '../../lib/c1ApiErrors';
import {logC1AccountOperationalStatus} from '../../lib/c1AccountOperationalStatus';
import {c1AccountOperationalStatus} from '../../lib/c1AccountOperationalStatus';
import {signC1JourneyObservation} from '../../lib/c1JourneyObservation';
import {rejectUnauthorizedC1Owner} from '../../lib/c1OwnerAccess';
import {get,put} from '@vercel/blob';
import {readStoredC1DatedBook} from '../../lib/c1DatedBookStore';
import {saveC1AccountUpdate} from '../../lib/c1AccountSave';
import {collectC1HeldRankReviews} from '../../lib/c1HeldRankProvider';
import {c1AccountReviewBook} from '../../lib/c1HeldRankReview';
import {buildC1ManualRecommendations} from '../../lib/c1ManualRecommendations';
import {c1AccountBook} from '../../lib/c1AccountInput';
import {collectC1HoldingCoverage,missingC1HoldingPrices} from '../../lib/c1HoldingCoverage';
import {collectC1AccountOpening} from '../../lib/c1AccountOpeningProvider';
import {prepareC1AccountExecution} from '../../lib/c1AccountExecutionView';
import {deriveC1CompletedAccount,deriveC1AccountAnalysis,importC1PositionContext,correctC1AccountOpenedAt,reconcileC1BrokerCash,updateC1BrokerageCash,adoptC1Account,evaluateC1Account,appendC1AccountSession} from '../../lib/c1AccountService';
import {correctC1IntradayTradeTime,correctC1IntradayTradeDetails} from '../../lib/c1IntradayActivity';
import {reviewC1SaleAttribution,correctC1SaleAttribution} from '../../lib/c1SaleAttributionRecovery';
import {applyC1SaleAttributionHold,assertC1SaleAttributionHold} from '../../lib/c1SaleAttributionHold';
import {applyC1ApprovedAccountRepair} from '../../lib/c1ApprovedAccountRepair';
import {reviewC1BrokerCashCorrection,confirmC1BrokerCashCorrection} from '../../lib/c1BrokerCashReviewService';
import {c1BrokerCashJournalStatus} from '../../lib/c1BrokerCashJournal';
import {c1AccountCashAvailability} from '../../lib/c1BrokerageCash';
import {recordC1CompletedAddRecovery,recordC1IssuedBuy,c1CompletedAddRecordingSession} from '../../lib/c1CompletedAddRecovery';
import {retainC1IssuedEntries,c1RetainedEntrySession,c1SessionWithIssuedTrades,c1RetainedTradeSessions} from '../../lib/c1IssuedTradeLog';
import {easternMarketClock,marketSessionCloseMinutes} from '../../lib/marketSession';
import {c1CoreCashChangeTimes} from '../../lib/c1AccountPortfolio';

export const config={api:{bodyParser:{sizeLimit:'1mb'}},maxDuration:90};
// Conditional writes require the strong ETag of the identity representation.
const storage={
 async read(path){const r=await get(path,{access:'private',useCache:false,headers:{'accept-encoding':'identity'}});if(!r)return null;if(r.statusCode!==200||!r.blob?.etag)throw new Error('Account storage unavailable');return {record:JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};},
 async write(path,record,etag){return put(path,JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:0});}
};

// Read the existing authorized portfolio; adoption never writes this object.
async function readAdoptionPortfolio(key){
 const path=`portfolio-sync/${createHash('sha256').update(key).digest('hex')}.json`;
 const r=await get(path,{access:'private',useCache:false,headers:{'accept-encoding':'identity'}});
 if(!r||r.statusCode!==200||!r.blob?.etag)throw new Error('Saved portfolio identity unavailable');
 return {...JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};
}

// A Core editor snapshot is a freshness signal, never a fabricated cash flow.
// Its timestamp is request-local so older, actually completed fills still use
// the brokerage evidence that was valid at their own execution time.
async function withCoreCashFreshness({account,key,readPortfolio}){
 if(!Array.isArray(account?.cashAccountingCorrections)||!account.cashAccountingCorrections.length)return account;
 const portfolioRecord=await c1AccountDependency(async()=>{
  const record=await readPortfolio(key);
  if(!Array.isArray(record?.portfolio))throw new Error('Saved portfolio identity unavailable');
  return record;
 },'portfolio');
 const changes=c1CoreCashChangeTimes(portfolioRecord);
 return changes.length?{...account,coreCashObservationRequired:changes}:withoutCoreCashFreshness(account);
}
function withoutCoreCashFreshness(account,original){
 if(!Object.hasOwn(account,'coreCashObservationRequired'))return account;
 const {coreCashObservationRequired,...record}=account;
 if(original&&Object.keys(record).length===Object.keys(original).length&&Object.keys(record).every(key=>record[key]===original[key]))return original;
 return record;
}
function withCoreCashDecision(decision,account,now){
 if(!account.coreCashObservationRequired)return decision;
 const {brokerageCashCurrent,executableCash,brokerageCashStatus,brokerageCashReason}=c1AccountCashAvailability({account,strategyCash:decision.strategyCash,now});
 if(brokerageCashStatus!=='Core-activity-review')return decision;
 return {...decision,brokerageCashCurrent,executableCash,brokerageCashStatus,brokerageCashReason};
}

function completedAnalysisView({account,book,now,holdingReviewError=null}){
 const analysis=deriveC1AccountAnalysis({account,book,now}),decision=withCoreCashDecision(analysis.decision,account,now);
 const activity=account.intradayActivity,clock=easternMarketClock(now);
 const intradaySession=activity?.date===clock?.key?{date:activity.date,revision:account.revision,plan:activity.plan,fills:activity.fills||[],tickets:activity.tickets||[],...(activity.plan.recordingOnly?{sellOnly:true}:{}),...(clock.minutes>=marketSessionCloseMinutes(clock.key)?{afterClose:true}:{})}:null;
 const available=intradaySession||(clock?.key>='2026-11-16'?c1CompletedAddRecordingSession({account,book,now}):null);
 const recording=account.issuedC1Entries?.length?c1SessionWithIssuedTrades(available||c1RetainedEntrySession({account,now}),account):available;
 const attributionReview=recording?reviewC1SaleAttribution({account,now}):null;
 if(attributionReview)recording.saleAttributionReview=attributionReview;
 return applyC1SaleAttributionHold({account,now,view:{decision,pendingSession:null,pendingSessions:[],intradaySession:recording,...(account.cashAccountingCorrections?{cashAccountingStatus:c1BrokerCashJournalStatus(account)}:{}),...(account.issuedC1Entries?.length?{retainedTradeSessions:c1RetainedTradeSessions({account,now})}:{}),openingPlan:null,openingError:null,manualRecommendations:buildC1ManualRecommendations({decision,now}),holdingReviewError}});
}

// Missing daily holding prices must be verified before they can be displayed
// as a completed close. Display reads derive these supplements in memory.
async function verifyAccountHoldingPrices({account,book,now,collectHoldings}){
 const previous=evaluateC1Account({account,book,now});
 for(const next of book.model.sessions.filter(s=>s.date>previous.sourceSessionDate)){
  if(!missingC1HoldingPrices(previous.positions.map(p=>({...p,role:'Swing'})),next).length)continue;
  const existing=account.holdingCoverages||[account.holdingCoverage].filter(Boolean);
  if(existing.some(c=>c.sourceSessionDate===next.date))continue;
  const supplement=await collectHoldings({portfolio:previous.positions.map(p=>({...p,role:'Swing'})),baseline:next,now});
  if(supplement.rows.some(r=>r.status!=='verified'))throw new Error('Next-session holding prices or classifications unavailable');
  account={...account,holdingCoverages:[...existing,supplement]};
  c1AccountBook(book,account.holdingCoverages);
 }
 return account;
}

// This explicit input refresh persists verified private prices and ranks.
async function refreshAccountInputs({account,book,now,collectHoldings,collectRanks}){
 account=await verifyAccountHoldingPrices({account,book,now,collectHoldings});
 return reviewAccountHoldings({account,book,now,collectRanks});
}

async function reviewAccountHoldings({account,book,now,collectRanks}){
 const {decision}=deriveC1AccountAnalysis({account,book,now}),through=decision.sourceSessionDate;
 const input=c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),baseline=input.model.sessions.find(s=>s.date===through);
 const reviews=account.holdingRankReviews||[],existing=reviews.find(r=>r.sourceSessionDate===through);
 const symbols=decision.positions.filter(p=>p.inheritedRiskOnly&&!existing?.rows.some(r=>r.symbol===p.symbol)).map(p=>p.symbol);
 let holdingReviewError=null;
 if(symbols.length&&through===book.model.sessions.at(-1).date){
  try{
   const review=await collectRanks({baseline,sourceHash:book.captures.find(c=>c.sessionDate===through)?.hash,symbols,now});
   if(review.rows.length){
    const combined={...review,rows:[...(existing?.rows||[]),...review.rows]};
    account={...account,revision:account.revision+1,holdingRankReviews:[...reviews.filter(r=>r.sourceSessionDate!==through),combined]};
    c1AccountReviewBook(input,account.holdingRankReviews);
   }
   if(review.unavailable.length)holdingReviewError=review.unavailable.map(r=>r.symbol+': '+r.reason).join(' ');
  }catch(error){
   const code=error?.message==='Holding momentum data provider is not configured'?'PROVIDER_NOT_CONFIGURED':error?.message==='Current bounded holding review required'?'REVIEW_SESSION_MISMATCH':'ACCOUNT_REVIEW_FAILURE';
   console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify({code,stage:'account-review'}));
   holdingReviewError='Holding momentum history is unavailable; recorded prices and stops remain under review.';
  }
 }else if(symbols.length)console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify({code:'ACCOUNT_SESSION_BEHIND',stage:'account-review'}));
 return {account,holdingReviewError};
}

export function createC1AccountHandler({store=storage,readPortfolio=readAdoptionPortfolio,readBook=readStoredC1DatedBook,clock=()=>new Date(),collectOpening=collectC1AccountOpening,collectHoldings=collectC1HoldingCoverage,collectRanks=collectC1HeldRankReviews,environment=process.env.VERCEL_ENV||'local',commit=process.env.VERCEL_GIT_COMMIT_SHA||'local',approvedRepairConfiguration=process.env.C1_OWNER_APPROVED_ACCOUNT_REPAIR_V1}={}){
 const checkedStore={read:(...args)=>c1AccountDependency(()=>store.read(...args),'storage'),
  write:(...args)=>c1AccountDependency(()=>store.write(...args),'storage')};
 const checkedHoldings=(...args)=>c1AccountDependency(()=>collectHoldings(...args),'holdings');
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  const auth=String(req.headers.authorization||''),key=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))return res.status(401).json({error:'Your portfolio sync key is required.'});
  if(rejectUnauthorizedC1Owner(res,{key,environment,surface:'account'}))return;
  const scope=environment==='production'?'production':`preview-${commit}`;
  const path=`c1-accounts-v1/${scope}/${createHash('sha256').update(key).digest('hex')}.json`;
  const requestId=randomUUID(),body=req.body||{},operation=req.method==='GET'?(req.query?.review==='opening'?'prepare-execution':'refresh-analysis'):body.operation;
  let stage='account-read',sourceSessionDate=null;
  res.setHeader('X-C1-Request-Id',requestId);
  try{
   // A recovery draft identifies its intended account, never authenticates it.
   // Reject a mismatched/malformed optional binding before reading any saved
   // account, accepted market input or portfolio. Ordinary forms omit it.
   if(['review-broker-cash-history','confirm-broker-cash-history'].includes(operation)&&Object.hasOwn(body,'targetAccountHash')&&
    (typeof body.targetAccountHash!=='string'||!/^[a-f0-9]{64}$/.test(body.targetAccountHash)||
     body.targetAccountHash!==createHash('sha256').update(key).digest('hex')))
    throw new Error('This private recovery link belongs to a different C1 account.');
   const now=clock();let saved=await checkedStore.read(path);
   if(environment==='production'&&operation==='adopt'&&!saved)return res.status(403).json({error:'New production accounts are disabled. Connect the existing saved account.'});
   if(operation!=='adopt'&&!saved)return res.status(404).json({error:'No C1 account has been initialized.'});
   // The stored daily dataset is authoritative; this cannot initialize it.
   stage='accepted-input-read';
   const {record:book}=await c1AccountDependency(()=>readBook('sp500',{now}),'input');
   sourceSessionDate=book?.model?.sessions?.at(-1)?.date||null;
   stage='account-analysis';
   let account=saved?.record,holdingReviewError=null;
   if(account?.adoption?.nonCashHoldings?.length)verifyC1NonCashReceipts(account);
   let approvedAccountRepairReceipt=null,approvedRepairView=null;
   if(['refresh-analysis','prepare-execution'].includes(operation)&&environment==='production'&&approvedRepairConfiguration){
    stage='approved-account-repair';
    const repaired=await applyC1ApprovedAccountRepair({environment,key,saved,path,book,store:checkedStore,now,configuration:approvedRepairConfiguration,
     readPortfolio:()=>c1AccountDependency(()=>readPortfolio(key),'portfolio'),validateView:next=>completedAnalysisView({account:next,book,now})});
    saved=repaired.saved;account=saved.record;approvedAccountRepairReceipt=repaired.receipt;approvedRepairView=repaired.view||null;
    if(approvedAccountRepairReceipt)console.info('C1_APPROVED_ACCOUNT_REPAIR',JSON.stringify({code:repaired.appliedNow?'APPLIED_AND_READ_VERIFIED':'ALREADY_APPLIED_READ_VERIFIED',
     authorizationId:approvedAccountRepairReceipt.authorizationId,requestId,commit:/^[a-f0-9]{7,40}$/.test(commit)?commit:'local',revision:account.revision,
     realJournalVerified:true,originalRecordsPreserved:true}));
    stage='account-analysis';
   }
   if(operation==='refresh-analysis'){
    account=await verifyAccountHoldingPrices({account,book,now,collectHoldings:checkedHoldings});
    const view=approvedRepairView&&account===saved.record?approvedRepairView:completedAnalysisView({account,book,now});
    try{const completedAt=clock(),context={operation,now:completedAt,requestId,commit};logC1AccountOperationalStatus(view,context);
     const receipt=signC1JourneyObservation(c1AccountOperationalStatus(view,context),{now:completedAt});if(receipt)res.setHeader('X-C1-Operational-Receipt',receipt);}catch{}
    return res.status(200).json({...view,...(approvedAccountRepairReceipt?{approvedAccountRepairReceipt:{...approvedAccountRepairReceipt,revision:view.decision.revision}}:{})});
   }
   if(operation==='review-broker-cash-history'||operation==='confirm-broker-cash-history'){
    stage='broker-cash-portfolio-read';
    const portfolioRecord=await c1AccountDependency(()=>readPortfolio(key),'portfolio');
    const args={account,book,portfolioRecord,statementText:body.statementText,expectedRevision:body.expectedRevision,now};
    stage=operation==='review-broker-cash-history'?'broker-cash-review':'broker-cash-confirm';
    if(operation==='review-broker-cash-history')return res.status(200).json({cashReview:reviewC1BrokerCashCorrection(args)});
    const next=confirmC1BrokerCashCorrection({...args,reviewId:body.reviewId,confirmed:body.confirmed===true,attributionConfirmed:body.attributionConfirmed===true});
    stage='broker-cash-confirm-analysis';
    const view=completedAnalysisView({account:next,book,now});
    stage='account-save';
    account=await saveC1AccountUpdate({store:checkedStore,path,saved,account:next,operation,book,now});
    return res.status(200).json({...view,brokerCashCorrectionReceipt:{reviewId:body.reviewId,revision:account.revision}});
   }
   if(operation==='correct-sale-attribution'){
    if(reviewC1SaleAttribution({account,now})?.cashAccountingRequired)throw new Error('Review brokerage cash history before correcting the planned-sale allocations');
    const next=correctC1SaleAttribution({account,proposalId:body.proposalId,confirmed:body.confirmed===true,expectedRevision:body.expectedRevision,now});
    // Validate the corrected effective fills through the normal account replay
    // before the conditional financial write, including its response view.
    const view=completedAnalysisView({account:next,book,now});
    stage='account-save';
    account=await saveC1AccountUpdate({store:checkedStore,path,saved,account:next,operation,book,now});
    const receipt=account.saleAttributionCorrections?.find(row=>row.proposalId===body.proposalId);
    return res.status(200).json({...view,saleAttributionReceipt:receipt?{proposalId:receipt.proposalId,date:receipt.date}:null});
   }
   if(operation==='prepare-execution'||operation==='record-intraday'){
    if(operation==='record-intraday')assertC1SaleAttributionHold({account:saved.record,ticket:body.ticket,now});
    account=await withCoreCashFreshness({account,key,readPortfolio});
    account=await verifyAccountHoldingPrices({account,book,now,collectHoldings:checkedHoldings});
    if(operation==='record-intraday'&&['owner-confirmed-completed-add','recorded-issued-buy'].includes(body.ticket?.recordingReason)){
     const record=body.ticket.recordingReason==='recorded-issued-buy'?recordC1IssuedBuy:recordC1CompletedAddRecovery;
     const next=record({account,book,ticket:body.ticket,expectedRevision:body.expectedRevision,now});
     stage='account-save';
     account=await saveC1AccountUpdate({store:checkedStore,path,saved,account:withoutCoreCashFreshness(next,saved.record),operation,book,now});
     const current=next.coreCashObservationRequired?{...account,coreCashObservationRequired:next.coreCashObservationRequired}:account;
     return res.status(200).json({...completedAnalysisView({account:current,book,now}),savedTradeTicket:account.intradayActivity?.tickets.find(row=>row.id===body.ticket.id)});
    }
    let opening;
    const args={account,book,now,collectOpening:input=>(opening??=collectOpening(input)),...(operation==='record-intraday'?{recordTicket:body.ticket,expectedRevision:body.expectedRevision}:{includePurchaseDiagnostics:true,diagnosticCommit:commit})};
    let prepared=await prepareC1AccountExecution(args);
    if(operation==='prepare-execution'&&account.cashAccountingCorrections?.length&&prepared.manualRecommendations.orders.some(order=>order.side==='buy'&&!order.condition)){
     // Provider work can outlast a Core save on another device. Recheck the
     // private portfolio before issuing a buy. A new edit only blocks buying;
     // reuse this request's verified opening inputs to retain protective exits.
     const latest=await withCoreCashFreshness({account,key,readPortfolio});
     if(c1AccountCashAvailability({account:latest,now:clock()}).brokerageCashStatus==='Core-activity-review'){
      prepared=await prepareC1AccountExecution({...args,account:{...latest,coreCashObservationRequired:true}});
     }
    }
    prepared.decision=withCoreCashDecision(prepared.decision,prepared.account,now);
    if(operation==='prepare-execution'){
     const retained=prepared.manualRecommendations?.date>='2026-11-16'&&prepared.manualRecommendations.status==='ready'&&prepared.manualRecommendations.orders.some(order=>order.side==='buy'&&!order.condition)?retainC1IssuedEntries({account:prepared.account,view:prepared}):prepared.account;
     if(retained!==prepared.account){
      // Persist recommendation evidence before publishing a checked Buy. This
      // never saves derived carry records, observations, fills or a revision.
      stage='account-save';
      await saveC1AccountUpdate({store:checkedStore,path,saved,account:withoutCoreCashFreshness({...saved.record,issuedC1Entries:retained.issuedC1Entries},saved.record),operation:'retain-issued-entries',book,now});
     }
     if(retained.issuedC1Entries?.length)prepared.intradaySession=c1SessionWithIssuedTrades(prepared.intradaySession||c1RetainedEntrySession({account:retained,now}),retained);
    }
    if(operation==='record-intraday'&&prepared.account.issuedC1Entries?.length)prepared.intradaySession=c1SessionWithIssuedTrades(prepared.intradaySession,prepared.account);
    if(operation==='record-intraday'){stage='account-save';await saveC1AccountUpdate({store:checkedStore,path,saved,account:withoutCoreCashFreshness(prepared.account,saved.record),operation,book,now});}
    const {account:preparedAccount,...rawView}=prepared;
    let view=rawView;
    const attributionReview=view.intradaySession?reviewC1SaleAttribution({account:operation==='prepare-execution'?saved.record:withoutCoreCashFreshness(preparedAccount),now}):null;
    if(attributionReview)view.intradaySession.saleAttributionReview=attributionReview;
    if(preparedAccount.issuedC1Entries?.length)view.retainedTradeSessions=c1RetainedTradeSessions({account:preparedAccount,now});
    view=applyC1SaleAttributionHold({view,account:saved.record,now});
    if(operation==='prepare-execution')try{const completedAt=clock(),context={operation,now:completedAt,requestId,commit},observed={...view,holdingReviewError};logC1AccountOperationalStatus(observed,context);
     const receipt=signC1JourneyObservation(c1AccountOperationalStatus(observed,context),{now:completedAt});if(receipt)res.setHeader('X-C1-Operational-Receipt',receipt);}catch{}
    return res.status(200).json({...view,holdingReviewError,...(approvedAccountRepairReceipt?{approvedAccountRepairReceipt:{...approvedAccountRepairReceipt,revision:view.decision.revision}}:{})});
   }
   if(operation==='review-mrna-adoption'||operation==='confirm-mrna-adoption'){
    if(operation==='confirm-mrna-adoption'&&body.confirmed===true&&account.adoption.nonCashHoldings?.some(e=>e.id===body.reviewId))return res.status(200).json(completedAnalysisView({account,book,now}));
    const input=c1AccountBook(book,account.holdingCoverages||account.holdingCoverage);
    const completed=deriveC1CompletedAccount({account,book:input,now});
    const before=evaluateC1Account({account:completed,book:input,now});
    const review=reviewC1NonCashAdoption({account:completed,decision:before,book:input,portfolioRecord:await c1AccountDependency(()=>readPortfolio(key),'portfolio'),accountEtag:saved.etag,accountIdentity:createHash('sha256').update(path).digest('hex'),
      completedActivity:account.intradayActivity&&!completed.intradayActivity?account.intradayActivity:null,
      finalizedSessions:completed.records.slice(account.records.length).map(r=>r.date),expectedRevision:body.expectedRevision,now});
    if(operation==='review-mrna-adoption')return res.status(200).json({adoptionReview:review});
    const next=appendC1NonCashAdoption({account:completed,review,reviewId:body.reviewId,confirmed:body.confirmed===true,now});
    const after=evaluateC1Account({account:next,book:input,now}),held=after.positions.find(p=>p.symbol==='MRNA');
    if(!held||held.shares!==Number(review.original.shares)||Math.abs(held.avgCost-Number(review.original.avgCost))>1e-7||!Number.isFinite(held.totalCost)||Math.abs(held.totalCost-Number(review.original.shares)*Number(review.original.avgCost))>1e-6||held.openedAt!==String(review.original.openedAt).slice(0,10)||after.actualCash!==before.actualCash||JSON.stringify(next.brokerageCash)!==JSON.stringify(account.brokerageCash))throw new Error('Non-cash adoption failed ownership, basis, date or cash conservation');
    stage='account-save';
    account=await saveC1AccountUpdate({store:checkedStore,path,saved,account:next,operation,book:input,now});
    return res.status(200).json(completedAnalysisView({account,book:input,now}));
   }
   switch(operation){
    case 'adopt':{
     if(saved)return res.status(409).json({error:'The existing C1 account cannot be reset.'});
     const baseline=book.model.sessions.at(-1);
     let holdingCoverage;
     if(missingC1HoldingPrices(body.portfolio,baseline).length){
      holdingCoverage=await checkedHoldings({portfolio:body.portfolio,baseline,now});
      const unavailable=holdingCoverage.rows.filter(r=>r.status!=='verified').map(r=>r.symbol);
      if(unavailable.length)return res.status(503).json({holdingCoverage,executable:false,code:'HOLDING_VERIFICATION_UNAVAILABLE',retryable:true,requestId,error:'Dated adjusted holding prices or classifications unavailable: '+unavailable.join(', ')});
     }
     account=adoptC1Account({portfolio:body.portfolio,capitalRecord:body.capitalRecord,book,holdingCoverage,now,prospectiveLegacyAdoptionConfirmed:body.prospectiveLegacyAdoptionConfirmed===true});
     ({account,holdingReviewError}=await reviewAccountHoldings({account,book,now,collectRanks}));
     break;
    }
    case 'refresh-account-inputs':({account,holdingReviewError}=await refreshAccountInputs({account,book,now,collectHoldings:checkedHoldings,collectRanks}));break;
    case 'record-position-context':account=importC1PositionContext({account,context:body.context,expectedRevision:body.expectedRevision,book,now});break;
    case 'correct-opening-date':account=correctC1AccountOpenedAt({account,symbol:body.symbol,openedAt:body.openedAt,expectedRevision:body.expectedRevision,book,now});break;
    case 'correct-intraday-details':account=correctC1IntradayTradeDetails({account,ticketId:body.ticketId,price:body.price,fee:body.fee,executedAt:body.executedAt,expectedRevision:body.expectedRevision,now});break;
    case 'correct-intraday-time':account=correctC1IntradayTradeTime({account,ticketId:body.ticketId,executedAt:body.executedAt,expectedRevision:body.expectedRevision,now});break;
    case 'update-brokerage-cash':
     // This observation is execution metadata. Do not advance the account,
     // refresh position context, or reconcile the C1 strategy ledger here.
     account=updateC1BrokerageCash({account,brokerageCash:body.brokerageCash,expectedRevision:body.expectedRevision,now});break;
    case 'reconcile-cash':
     account=deriveC1CompletedAccount({account,book,now});
     account=reconcileC1BrokerCash({account,brokerCash:body.brokerCash,expectedRevision:body.expectedRevision,book,now});break;
    case 'record-session':{
     if(['entryRecheck','executionEvidence','recordingEvidence','entryPlanEvidence'].some(field=>body.record?.[field]))throw new Error('Execution evidence is generated by the server only');
     if(account.intradayActivity?.date===body.record?.date)throw new Error('Trades for this session are already saved intraday. Reload to reconcile them; do not replace them with another session record.');
     if(account.revision!==body.expectedRevision)throw new Error('Account changed; refresh before recording activity');
     const prior=deriveC1CompletedAccount({account,book,now,beforeDate:body.record?.date});
     account=appendC1AccountSession({account:prior,record:body.record,book,expectedRevision:body.expectedRevision,now});
     ({account,holdingReviewError}=await reviewAccountHoldings({account,book,now,collectRanks}));
     break;
    }
    default:return res.status(400).json({error:'Valid account operation required.'});
   }
   stage='account-save';
   account=await saveC1AccountUpdate({store:checkedStore,path,saved,account,operation,context:body.context,book,now});
   stage='saved-account-analysis';
   return res.status(200).json(completedAnalysisView({account,book,now,holdingReviewError}));
  }catch(error){
   const {status,...failure}=c1AccountApiFailure(error,{operation:stage==='approved-account-repair'?'approved-account-repair':operation,stage});
   // Bounded structured fields only: no key, request body, holdings, prices,
   // account path, raw provider error or stack enters an operational log.
   console.warn('C1_ACCOUNT_API_FAILURE',JSON.stringify({requestId,code:failure.code,status,stage,
    ...(['review-broker-cash-history','confirm-broker-cash-history'].includes(operation)?{operation}:{}),
    ...(failure.diagnostic?{reasonId:failure.diagnostic.reasonId,fingerprint:failure.diagnostic.fingerprint}:{}),
    method:req.method,sourceSessionDate:/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate||'')?sourceSessionDate:null,
    commit:/^[a-f0-9]{7,40}$/.test(commit)?commit:'local'}));
   return res.status(status).json({...failure,requestId,executable:false});
  }
 };
}
export default createC1AccountHandler();
