// Actual account handler + market calendar + signed journey status, isolated
// synthetic accepted sessions. A calendar transition never fabricates a fill.
const assert=require('node:assert/strict'),{createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const l=require('./fixtures/c1-operational-modules.cjs').createOperationalModuleLoader(process.cwd());
const verify=l.load('lib/c1JourneyObservation.js').verifyC1JourneyObservation;
const {buildC1OperationalReadiness:readiness}=l.load('lib/c1OperationalReadiness.js');
const market=l.load('lib/marketSession.js'),secret='offline-lifecycle-only',commit='a'.repeat(40);
(async()=>{
 const api=createWorkflowApi('buy',{baselineDate:'2026-10-29',now:'2026-10-30T19:00:00Z',commit,observationSecret:secret});api.fixture.setCash(100000);
 const before=JSON.stringify(api.fixture.account),phases=[
  ['2026-10-30T19:00:00Z',false,'2026-10-29','ACCOUNT_ANALYSIS_ONLY','CHECK_PASSED'],
  ['2026-10-30T20:05:00Z',false,'2026-10-29','ACCOUNT_SESSION_NOT_CURRENT','CLOSING_UPDATE_PENDING'],
  ['2026-10-30T20:20:00Z',true,'2026-10-30','MARKET_CLOSED','WAITING_REGULAR_SESSION'],
  ['2026-11-01T18:00:00Z',false,'2026-10-30','MARKET_CLOSED','WAITING_REGULAR_SESSION'],
  ['2026-11-02T14:20:00Z',false,'2026-10-30','MARKET_CLOSED','WAITING_REGULAR_SESSION'],
  ['2026-11-02T14:35:00Z',false,'2026-10-30','ACCOUNT_ANALYSIS_ONLY','CHECK_PASSED']];
 for(const [at,publish,date,code,readyCode]of phases){
  api.fixture.now=at;if(publish){const s=api.fixture.sessions[221];api.fixture.book.model.sessions.push(s);api.fixture.book.captures.push({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt});}
  const r=await api.request('GET');assert.equal(r.status,200);assert.equal(r.body.decision.sourceSessionDate,date);
  const receipt=verify(r.headers['X-C1-Operational-Receipt'],{now:api.fixture.now,secret,commit});assert(receipt);assert.equal(receipt.code,code);
  const operational=readiness({sourceSessionDate:date,observedAt:api.fixture.now,commit,expectedCount:4,quoteCount:4,regularQuoteCount:4,eventCount:4});assert.equal(operational.code,readyCode);
  assert.equal(operational.executable,false);assert.equal(JSON.stringify(api.fixture.account),before);
 }
 assert.equal(market.marketSessionDistance('2026-10-30','2026-11-02'),1);
 const monday=await api.request('POST',{operation:'prepare-execution'});assert.equal(monday.status,200);
 const pending=verify(monday.headers['X-C1-Operational-Receipt'],{now:api.fixture.now,secret,commit});assert.equal(pending.code,'ACCOUNT_ACTIVITY_PENDING','A real unrecorded completed session is a policy/account workflow state, not a quote outage');
 assert.equal(JSON.stringify(api.fixture.account),before);assert.equal(api.fixture.writes,0);
 assert.equal(market.marketExecutionState(new Date('2026-11-02T14:29:59Z')).isOpen,false);assert.equal(market.marketExecutionState(new Date('2026-11-02T14:30:00Z')).isOpen,true);
 assert.equal(market.latestCompletedMarketSessionDay(new Date('2026-11-02T20:59:59Z')),'2026-10-30');assert.equal(market.latestCompletedMarketSessionDay(new Date('2026-11-02T21:00:00Z')),'2026-11-02');
 console.log('PASS: actual Friday close/publication/weekend/Monday pre-open/open handler and signed observations across the clock change; legitimate pending activity distinguished; complete account history/cash identical, zero writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
