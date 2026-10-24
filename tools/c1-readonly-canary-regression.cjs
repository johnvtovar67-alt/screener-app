// Synthetic captures through real account execution + screen response functions.
// No network, Blob, live account or historical thesis experiment is permitted.
const assert=require('node:assert/strict');
const {assessC1Capture}=require('./c1-readonly-canary.cjs');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const originalFetch=global.fetch;
global.fetch=async()=>{throw Error('No network allowed in read-only canary');};
async function main(){
 const f=createWorkflowFixture('buy');f.setCash(20000);
 const before=JSON.stringify({account:f.account,book:f.book,portfolio:f.portfolio});
 const prepared=await f.prepare();
 const {account:ignored,...body}=prepared;
 const rows=f.screenRows(),events=currentEventEvidenceFor(rows.map(row=>row.symbol),f.now);
 rows.forEach(row=>{row.eventRisk=events.find(event=>event.symbol===row.symbol);});
 const base={contract:'c1-readonly-canary-capture-v1',observedAt:f.now.toISOString(),
  account:{status:200,body},screen:{status:200,body:{stocks:rows,meta:{quoteFeedStatus:'live',fundamentalFeedStatus:'healthy'}}},portfolio:clone(f.portfolio)};
 const check=input=>assessC1Capture(input,{now:f.now});
 const retained=f.loader.load('lib/c1ScreenEvidence.js').resolveC1ScreenEvidence({decision:body.decision,rows,current:true,reviewCurrent:true});
 const good=check(base);assert.equal(good.status,'CHECKED_BUY_ORDERS_PRESENT',JSON.stringify(good));
 assert(good.counts.checkedBuyOrders>0);
 assert.equal(good.productionAcceptance,'NOT_ESTABLISHED');assert.equal(good.privateAccountParity,'NOT_VERIFIED');
 assert.equal(good.browserRendering,'NOT_VERIFIED');assert.equal(good.executable,false);
 const verify=(mutate,status,reason)=>{const input=clone(base);mutate(input);const prior=JSON.stringify(input),result=check(input);
  assert.equal(result.status,status,JSON.stringify(result));if(reason)assert(result.reasonCodes.includes(reason),JSON.stringify(result));
  assert.equal(JSON.stringify(input),prior,'Diagnostic cannot mutate capture');return result;};
 verify(c=>c.account.status=503,'ACCOUNT_UNAVAILABLE','ACCOUNT_RESPONSE_UNAVAILABLE');
 verify(c=>c.screen.status=503,'SYSTEM_VERIFICATION_INCOMPLETE','SCREEN_RESPONSE_UNAVAILABLE');
 verify(c=>c.screen.body.stocks=[],'SYSTEM_VERIFICATION_INCOMPLETE','MISSING_REQUIRED_ROWS');
 verify(c=>c.screen.body.stocks.push(clone(c.screen.body.stocks[0])),'SYSTEM_VERIFICATION_INCOMPLETE','DUPLICATE_REQUIRED_ROWS');
 verify(c=>c.screen.body.meta.quoteFeedStatus='stale-verified','SYSTEM_VERIFICATION_INCOMPLETE','SCREEN_FEED_NOT_HEALTHY');
 verify(c=>delete c.screen.body.meta.fundamentalFeedStatus,'SYSTEM_VERIFICATION_INCOMPLETE','SCREEN_FEED_NOT_HEALTHY');
 verify(c=>c.screen.body.stocks[0].clientSnapshotFallback=true,'SYSTEM_VERIFICATION_INCOMPLETE','FALLBACK_OR_STALE_ROWS');
 verify(c=>c.screen.body.stocks[0].timestamp=f.now.getTime()/1000-3600,'SYSTEM_VERIFICATION_INCOMPLETE','QUOTE_VERIFICATION_INCOMPLETE');
 verify(c=>c.screen.body.stocks[0].timestamp=f.now.getTime()/1000+60,'SYSTEM_VERIFICATION_INCOMPLETE','QUOTE_VERIFICATION_INCOMPLETE');
 verify(c=>c.screen.body.stocks[0].recommendation.expertDecision.metrics.quoteFreshnessPass=false,'SYSTEM_VERIFICATION_INCOMPLETE','QUOTE_VERIFICATION_INCOMPLETE');
 verify(c=>c.screen.body.stocks[0].price=0,'SYSTEM_VERIFICATION_INCOMPLETE','PRICE_UNAVAILABLE');
 verify(c=>delete c.screen.body.stocks[0].eventRisk.eventVerification,'SYSTEM_VERIFICATION_INCOMPLETE','EVENT_VERIFICATION_INCOMPLETE');
 verify(c=>c.screen.body.stocks[0].eventRisk.eventVerification.expiresAt=f.now.toISOString(),'SYSTEM_VERIFICATION_INCOMPLETE','EVENT_VERIFICATION_INCOMPLETE');
 verify(c=>delete c.account.body.decision.stockScreen.candidates[0].recentMomentumGate,'SYSTEM_VERIFICATION_INCOMPLETE','RECENT_MOMENTUM_EVIDENCE_INCOMPLETE');
 verify(c=>delete c.account.body.decision.stockScreen.candidates[0].recentMomentumGate.entryAllowed,'SYSTEM_VERIFICATION_INCOMPLETE','RECENT_MOMENTUM_EVIDENCE_INCOMPLETE');
 verify(c=>delete c.account.body.decision.stockScreen.candidates[0].sourceTiming.liquidityPass,'SYSTEM_VERIFICATION_INCOMPLETE','SOURCE_CANDIDATE_EVIDENCE_INCOMPLETE');
 verify(c=>delete c.account.body.decision.stockScreen.candidates[0].issuer,'SYSTEM_VERIFICATION_INCOMPLETE','SOURCE_CANDIDATE_EVIDENCE_INCOMPLETE');
 verify(c=>c.account.body.decision.stockScreen.sourceSessionDate='2026-10-13','SYSTEM_VERIFICATION_INCOMPLETE','SOURCE_SCREEN_IDENTITY');
 verify(c=>c.account.body.decision.current=false,'ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT_SESSION_NOT_CURRENT');
 verify(c=>delete c.portfolio,'ACCOUNT_VERIFICATION_INCOMPLETE','PORTFOLIO_NOT_CAPTURED');
 verify(c=>c.portfolio[0].shares++,'ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT_PORTFOLIO_MISMATCH');
 verify(c=>c.account.body.openingError='PRIVATE_PROVIDER_URL_SECRET','ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT_OPENING_REVIEW_UNAVAILABLE');
 verify(c=>c.account.body.manualRecommendations.validUntil=f.now.toISOString(),'ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT_OPENING_REVIEW_UNAVAILABLE');
 verify(c=>c.account.body.manualRecommendations.orders=[],'ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT_OPENING_REVIEW_UNAVAILABLE');
 verify(c=>{c.previousEvidence=retained;c.screen.body.stocks[0].price=104;c.account.body.manualRecommendations.validUntil=f.now.toISOString();},
  'ACCOUNT_VERIFICATION_INCOMPLETE','SELECTION_REVIEW_PENDING');
 verify(c=>c.account.body.executionDecision={...c.account.body.decision,sourceSessionDate:'2026-10-13'},'ACCOUNT_VERIFICATION_INCOMPLETE','ACCOUNT_OPENING_REVIEW_UNAVAILABLE');
 const blocked=verify(c=>{
  c.screen.body.stocks.forEach(row=>{row.eventRisk=currentEventEvidenceFor([row.symbol],f.now,{[row.symbol]:{state:'VERIFIED_BLOCKED'}})[0];});
 },'VERIFIED_SYMBOL_BLOCKS');
 assert.equal(blocked.scope,'SYMBOL');assert.equal(blocked.counts.qualifiedRatings,0);
 const policy=verify(c=>c.screen.body.stocks.forEach(row=>row.price*=1.1),'VALID_ZERO_QUALIFIED_RATINGS');
 assert.equal(policy.scope,'POLICY');
 const noQuantity=verify(c=>{c.account.body.openingPlan.orders=[];c.account.body.manualRecommendations.orders=[];},'VALID_ZERO_CHECKED_BUY_ORDERS');
 assert(noQuantity.counts.qualifiedRatings>0);
 verify(c=>c.observedAt='2026-10-15T16:00:00Z','EVIDENCE_UNAVAILABLE','CAPTURE_IDENTITY_OR_AGE');
 verify(c=>c.observedAt='2026-10-15T18:00:00Z','EVIDENCE_UNAVAILABLE','CAPTURE_IDENTITY_OR_AGE');
 for(const input of [null,{},[],{...base,portfolio:[null]},{...base,screen:{status:200,body:{stocks:[null],meta:{}}}}]){
  assert.doesNotThrow(()=>check(input));assert(!check(input).status.startsWith('VALID_ZERO'));
 }
 const shuffled=clone(base);shuffled.screen.body.stocks.reverse();
 assert.deepEqual(check(shuffled),good,'Provider row order cannot change the diagnostic');
 const closed=clone(base);
 // Outside the session, an expired opening plan is expected, not an outage.
 const market=f.loader.load('lib/marketSession.js');
 const beforeOpen=new Date('2026-10-15T13:00:00Z');closed.observedAt=beforeOpen.toISOString();
 closed.screen.body.stocks.forEach(row=>row.timestamp=new Date('2026-10-14T20:00:00Z').getTime()/1000);
 assert.equal(market.latestCompletedMarketSessionDay(beforeOpen),body.decision.sourceSessionDate);
 assert.equal(assessC1Capture(closed,{now:beforeOpen}).status,'MARKET_CLOSED');
 const sensitive=clone(base);sensitive.account.body.openingError='PRIVATE_PROVIDER_URL_SECRET';sensitive.account.body.decision.privateKey='PRIVATE_SYNC_KEY';
 const output=JSON.stringify(check(sensitive));assert(!/PRIVATE_|LLL|MRNA|20000|estimatedPrice|shares|decisionId/.test(output));
 const {spawnSync}=require('node:child_process');
 const invalid=spawnSync(process.execPath,[require.resolve('./c1-readonly-canary.cjs'),'/PRIVATE_SYNC_KEY_DO_NOT_LOG'],{encoding:'utf8'});
 assert.equal(invalid.status,2);assert(!/PRIVATE_SYNC_KEY/.test(invalid.stderr+invalid.stdout));
 assert.equal(JSON.stringify({account:f.account,book:f.book,portfolio:f.portfolio}),before);
 assert.equal(f.writes,0);console.log('PASS: read-only captured-response canary distinguishes policy/symbol/account/system/session outcomes, rejects missing/stale/contradictory evidence, reuses real C1 functions and emits no account facts.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;});
