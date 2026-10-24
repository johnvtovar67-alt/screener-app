// Diagnostic only: inspect previously captured responses. Never fetch, refresh,
// save, generate orders, or infer credentials/account identity from storage.
const path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');

function assessCapturedResponses(capture,{now=new Date()}={}){
 const report={contract:'c1-readonly-canary-report-v1',evidenceScope:'CAPTURED_RESPONSES',
  status:'EVIDENCE_UNAVAILABLE',scope:'SYSTEM',reasonCodes:[],
  executable:false,brokerageExecutionAuthorized:false,productionAcceptance:'NOT_ESTABLISHED',
  privateAccountParity:'NOT_VERIFIED',browserRendering:'NOT_VERIFIED'};
 const issues=new Set(),add=code=>issues.add(code);
 const accountCodes=new Set(['ACCOUNT_SESSION_NOT_CURRENT','PORTFOLIO_NOT_CAPTURED','ACCOUNT_PORTFOLIO_MISMATCH','SELECTION_REVIEW_PENDING']);
 const finish=(status,scope)=>({...report,status,scope,reasonCodes:[...issues].sort()});
 const loader=createResearchModuleLoader(path.resolve(__dirname,'..'));
 const market=loader.load('lib/marketSession.js');
 const manual=loader.load('lib/c1ManualRecommendations.js');
 const at=new Date(now),stamp=Date.parse(capture?.observedAt);
 if(capture?.contract!=='c1-readonly-canary-capture-v1'||!Number.isFinite(at.getTime())||
  !Number.isFinite(stamp)||stamp>at.getTime()||at.getTime()-stamp>=manual.C1_MANUAL_RECOMMENDATION_VALIDITY_MS){
  add('CAPTURE_IDENTITY_OR_AGE');return finish('EVIDENCE_UNAVAILABLE','SYSTEM');
 }
 const open=market.marketExecutionState(at).isOpen;
 report.marketOpen=open;
 report.expectedCompletedSessionDate=market.latestCompletedMarketSessionDay(at);
 if(capture.account?.status!==200){add('ACCOUNT_RESPONSE_UNAVAILABLE');return finish('ACCOUNT_UNAVAILABLE','ACCOUNT');}
 const account=capture.account.body,decision=account?.decision;
 if(decision?.contract!=='c1-account-decision-v1'||!Array.isArray(decision.positions)||
  !decision.decisionId||!Number.isSafeInteger(decision.revision)){
  add('ACCOUNT_RESPONSE_INVALID');return finish('ACCOUNT_UNAVAILABLE','ACCOUNT');
 }
 if(!decision.current||decision.sourceSessionDate!==report.expectedCompletedSessionDate)add('ACCOUNT_SESSION_NOT_CURRENT');
 if(!Array.isArray(capture.portfolio)){add('PORTFOLIO_NOT_CAPTURED');}
 else if(!loader.load('lib/c1AccountDecision.js').c1AccountMatchesPortfolio(decision,capture.portfolio))add('ACCOUNT_PORTFOLIO_MISMATCH');
 const snapshot=decision.stockScreen,candidates=snapshot?.candidates;
 if(snapshot?.contract!=='c1-stock-screen-v1'||snapshot.sourceSessionDate!==decision.sourceSessionDate||
  !Array.isArray(candidates)||!candidates.length||candidates.some(c=>typeof c?.symbol!=='string'||!c.symbol)||
  new Set(candidates.map(c=>c.symbol)).size!==candidates.length){
  add('SOURCE_SCREEN_IDENTITY');return finish('SYSTEM_VERIFICATION_INCOMPLETE','SYSTEM');
 }
 let screen;
 try{screen=loader.load('lib/top5Response.js').parseTop5Response(JSON.stringify(capture.screen?.body),
  {ok:capture.screen?.status===200,status:capture.screen?.status});}
 catch{add('SCREEN_RESPONSE_UNAVAILABLE');return finish('SYSTEM_VERIFICATION_INCOMPLETE','SYSTEM');}
 const meta=screen.meta;
 // Explicit metadata is required for a diagnostic PASS; absent metadata is not
 // silently treated as healthy. This does not change the application's gates.
 const healthy=meta.quoteFeedStatus==='live'&&meta.fundamentalFeedStatus==='healthy'&&!meta.clientSnapshotFallback;
 if(!healthy)add('SCREEN_FEED_NOT_HEALTHY');
 const symbolOf=row=>String(row?.symbol||row?.ticker||'').replace('-','.').toUpperCase().trim();
 const required=new Set(candidates.map(c=>c.symbol));
 const recent=loader.load('lib/c1RecentMomentumLivePolicy.js');
 for(const [index,candidate] of candidates.entries()){
  if(!Number.isFinite(candidate.momentumPercentile)||!Number.isFinite(candidate.sourcePrice)||candidate.sourcePrice<=0||
   candidate.researchRank!==index+1||typeof candidate.issuer!=='string'||!candidate.issuer||typeof candidate.sector!=='string'||!candidate.sector||
   candidate.sourceTiming?.available!==true||candidate.sourceTiming.asOf!==decision.sourceSessionDate||
   candidate.sourceTiming.liquidityPass!==true||!Number.isFinite(candidate.sourceTiming.averageDollarVolume20))add('SOURCE_CANDIDATE_EVIDENCE_INCOMPLETE');
  if(recent.c1RecentMomentumLiveApplies(decision.sourceSessionDate)&&
   (candidate.recentMomentumGate?.available!==true||typeof candidate.recentMomentumGate.entryAllowed!=='boolean'||candidate.recentMomentumGate.sourceSessionDate!==decision.sourceSessionDate))add('RECENT_MOMENTUM_EVIDENCE_INCOMPLETE');
 }
 const rows=screen.stocks.filter(row=>required.has(symbolOf(row)));
 if(new Set(rows.map(symbolOf)).size!==rows.length)add('DUPLICATE_REQUIRED_ROWS');
 if(required.size!==new Set(rows.map(symbolOf)).size)add('MISSING_REQUIRED_ROWS');
 const {readC1CurrentEventEvidence}=loader.load('lib/c1CurrentEventEvidence.js');
 const {quoteFreshness}=loader.load('lib/expertDecision.js');
 let eventBlocks=0;
 for(const row of rows){
  const expert=row.recommendation?.expertDecision||row.expertDecision||{};
  if(row.clientSnapshotFallback||row.dataFeedSnapshotStale)add('FALLBACK_OR_STALE_ROWS');
  if(!(Number(row.price??row.currentPrice??row.lastPrice??row.close)>0))add('PRICE_UNAVAILABLE');
  const timestamp=Number(row.timestamp),quoteMs=timestamp>1e12?timestamp:timestamp*1000;
  if(expert.metrics?.quoteFreshnessPass!==true||!quoteFreshness(row,at).pass||quoteMs>at.getTime())add('QUOTE_VERIFICATION_INCOMPLETE');
  if(open){
   const risk=row.eventRisk||row.preTradeCheck||row.recommendation?.eventRisk||row.recommendation?.preTradeCheck;
   const state=readC1CurrentEventEvidence(risk,at);
   if(state==='UNVERIFIED')add('EVENT_VERIFICATION_INCOMPLETE');
   if(state==='VERIFIED_BLOCKED')eventBlocks++;
  }
 }
 const executionDecision=account.executionDecision||decision;
 const canonicalReview=manual.buildC1ManualRecommendations({decision:executionDecision,
  openingPlan:account.openingPlan,pendingSession:account.pendingSession,openingError:account.openingError,now:at});
 const sameSource=executionDecision.sourceSessionDate===decision.sourceSessionDate&&executionDecision.revision===decision.revision&&
  String(executionDecision.decisionId).split(':')[0]===String(decision.decisionId).split(':')[0];
 const reviewed=sameSource&&canonicalReview.status==='ready'&&
  JSON.stringify(canonicalReview.orders)===JSON.stringify(account.manualRecommendations?.orders)&&
  manual.c1ManualReviewCurrent(account.manualRecommendations,executionDecision,at);
 // Use the exact existing screen resolver; retained browser state is optional
 // diagnostic input and never an independent source of buy authority.
 const evidence=loader.load('lib/c1ScreenEvidence.js').resolveC1ScreenEvidence({decision,
  rows,current:healthy,previous:capture.previousEvidence||null,reviewCurrent:reviewed});
 if(evidence.pending&&decision.current)add([...issues].some(code=>!accountCodes.has(code))?'SCREEN_COMPOSITION_PENDING':'SELECTION_REVIEW_PENDING');
 report.counts={sourceCandidates:candidates.length,requiredRows:rows.length,
  verifiedEventBlocks:eventBlocks,qualifiedRatings:evidence.buySymbols.length};
 // Check all layers independently before selecting an overall classification.
 // Never label a zero count valid while upstream evidence is missing.
 const systemIssue=[...issues].some(code=>!accountCodes.has(code));
 if(systemIssue)return finish('SYSTEM_VERIFICATION_INCOMPLETE','SYSTEM');
 if(issues.size)return finish('ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT');
 if(!open)return finish('MARKET_CLOSED','SESSION');
 if(account.openingError||account.holdingReviewError||account.pendingSession||!reviewed){
  add('ACCOUNT_OPENING_REVIEW_UNAVAILABLE');return finish('ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT');
 }
 if(!evidence.buySymbols.length)return finish(eventBlocks?'VERIFIED_SYMBOL_BLOCKS':'VALID_ZERO_QUALIFIED_RATINGS',eventBlocks?'SYMBOL':'POLICY');
 // This counts checked server orders, not rendered actionable quantities. Held
 // position presentation may suppress an Add; browser parity is not asserted.
 const checked=manual.c1ManualOrdersForView({review:account.manualRecommendations,
  decision:executionDecision,openingPlan:account.openingPlan,view:'portfolio',now:at})
  .filter(order=>evidence.buySymbols.includes(order.symbol));
 report.counts.checkedBuyOrders=checked.length;
 return finish(checked.length?'CHECKED_BUY_ORDERS_PRESENT':'VALID_ZERO_CHECKED_BUY_ORDERS','ACCOUNT');
}

function assessC1Capture(capture,options){
 try{return assessCapturedResponses(capture,options);}
 catch{return {contract:'c1-readonly-canary-report-v1',evidenceScope:'CAPTURED_RESPONSES',
  status:'EVIDENCE_UNAVAILABLE',scope:'SYSTEM',reasonCodes:['CAPTURE_SHAPE_INVALID'],executable:false,
  brokerageExecutionAuthorized:false,productionAcceptance:'NOT_ESTABLISHED',privateAccountParity:'NOT_VERIFIED',browserRendering:'NOT_VERIFIED'};}
}
module.exports={assessC1Capture};
if(require.main===module){
 // File contents and exception details may contain private data: never echo
 // either. No report file is written and no input path is logged.
 try{
  const fs=require('node:fs'),file=process.argv[2];
  if(process.argv.length!==3||!file||!fs.statSync(file).isFile()||fs.statSync(file).size>8*1024*1024)throw Error();
  const report=assessC1Capture(JSON.parse(fs.readFileSync(file,'utf8')));
  console.log(JSON.stringify(report,null,2));
  if(/UNAVAILABLE|INCOMPLETE/.test(report.status))process.exitCode=2;
 }catch{console.error('Canary input could not be verified. No data were fetched or changed.');process.exitCode=2;}
}
