import {appendC1NonCashAdoption} from '../../lib/c1NonCashAdoption';
import {reviewC1NonCashAdoption,verifyC1NonCashReceipts} from '../../lib/c1NonCashAdoptionReview';
import {createHash,randomUUID} from 'node:crypto';
import {c1AccountApiFailure,c1AccountDependency} from '../../lib/c1ApiErrors';
import {logC1AccountOperationalStatus} from '../../lib/c1AccountOperationalStatus';
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
import {easternMarketClock,marketSessionCloseMinutes} from '../../lib/marketSession';

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

function completedAnalysisView({account,book,now,holdingReviewError=null}){
 const {decision}=deriveC1AccountAnalysis({account,book,now});
 const activity=account.intradayActivity,clock=easternMarketClock(now);
 const intradaySession=activity?.date===clock?.key?{date:activity.date,revision:account.revision,plan:activity.plan,fills:activity.fills||[],tickets:activity.tickets||[],...(activity.plan.recordingOnly?{sellOnly:true}:{}),...(clock.minutes>=marketSessionCloseMinutes(clock.key)?{afterClose:true}:{})}:null;
 return {decision,pendingSession:null,pendingSessions:[],intradaySession,openingPlan:null,openingError:null,manualRecommendations:buildC1ManualRecommendations({decision,now}),holdingReviewError};
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

export function createC1AccountHandler({store=storage,readPortfolio=readAdoptionPortfolio,readBook=readStoredC1DatedBook,clock=()=>new Date(),collectOpening=collectC1AccountOpening,collectHoldings=collectC1HoldingCoverage,collectRanks=collectC1HeldRankReviews,environment=process.env.VERCEL_ENV||'local',commit=process.env.VERCEL_GIT_COMMIT_SHA||'local'}={}){
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
  const requestId=randomUUID(),body=req.body||{},operation=req.method==='GET'?'refresh-analysis':body.operation;
  let stage='account-read',sourceSessionDate=null;
  res.setHeader('X-C1-Request-Id',requestId);
  try{
   const now=clock(),saved=await checkedStore.read(path);
   if(environment==='production'&&operation==='adopt'&&!saved)return res.status(403).json({error:'New production accounts are disabled. Connect the existing saved account.'});
   if(operation!=='adopt'&&!saved)return res.status(404).json({error:'No C1 account has been initialized.'});
   // The stored daily dataset is authoritative; this cannot initialize it.
   stage='accepted-input-read';
   const {record:book}=await c1AccountDependency(()=>readBook('sp500',{now}),'input');
   sourceSessionDate=book?.model?.sessions?.at(-1)?.date||null;
   stage='account-analysis';
   let account=saved?.record,holdingReviewError=null;
   if(account?.adoption?.nonCashHoldings?.length)verifyC1NonCashReceipts(account);
   if(operation==='refresh-analysis'){
    account=await verifyAccountHoldingPrices({account,book,now,collectHoldings:checkedHoldings});
    const view=completedAnalysisView({account,book,now});
    try{logC1AccountOperationalStatus(view,{operation,now,requestId,commit});}catch{}
    return res.status(200).json(view);
   }
   if(operation==='prepare-execution'||operation==='record-intraday'){
    account=await verifyAccountHoldingPrices({account,book,now,collectHoldings:checkedHoldings});
    const prepared=await prepareC1AccountExecution({account,book,now,collectOpening,...(operation==='record-intraday'?{recordTicket:body.ticket,expectedRevision:body.expectedRevision}:{includePurchaseDiagnostics:true,diagnosticCommit:commit})});
    if(operation==='record-intraday'){stage='account-save';await saveC1AccountUpdate({store:checkedStore,path,saved,account:prepared.account,operation,book,now});}
    const {account:preparedAccount,...view}=prepared;
    if(operation==='prepare-execution')try{logC1AccountOperationalStatus({...view,holdingReviewError},{operation,now,requestId,commit});}catch{}
    return res.status(200).json({...view,holdingReviewError});
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
   const {status,...failure}=c1AccountApiFailure(error);
   // Bounded structured fields only: no key, request body, holdings, prices,
   // account path, raw provider error or stack enters an operational log.
   console.warn('C1_ACCOUNT_API_FAILURE',JSON.stringify({requestId,code:failure.code,status,stage,
    method:req.method,sourceSessionDate:/^\d{4}-\d{2}-\d{2}$/.test(sourceSessionDate||'')?sourceSessionDate:null,
    commit:/^[a-f0-9]{7,40}$/.test(commit)?commit:'local'}));
   return res.status(status).json({...failure,requestId,executable:false});
  }
 };
}
export default createC1AccountHandler();
