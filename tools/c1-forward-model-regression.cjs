const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {advanceC1ForwardModel,C1_FORWARD_CONTRACT}=loader.load('lib/c1ForwardModel.js');
const {latestCompletedMarketSessionDay}=loader.load('lib/marketSession.js');
assert.equal(createHash('sha256').update(fs.readFileSync('lib/c1FrozenSimulator.js','utf8').replace('    pendingDecisions: config.liquidateAtEnd ? [] : JSON.parse(JSON.stringify(pending)),\n','')).digest('hex'),
 'bcf3cc3e89ac499319a2cbfab76e42fda3bda5ef72d2d45777959e73e6ad9e7d','Live paper service must use the historical simulator unchanged');
const opts=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
for(const universe of ['nasdaq','sp500']){
 const fixture=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(`tools/fixtures/c1-${universe}-accounting.json.gz.base64`,'utf8'),'base64')));
 for(const run of fixture)assert.equal(JSON.stringify(opts[run.id]),JSON.stringify(run.options),'Frozen options must match both historical fixtures');
}
const session=date=>({date,decisionAt:date+'T20:00:00Z',universeSymbols:[],signals:[],prices:[{symbol:'SPY',open:100,close:100},{symbol:'QQQ',open:100,close:100}]});
// Reproduce the actual production baseline captured after September 10 opened.
for(const [time,expected] of [['2026-09-10T13:29:59Z','2026-09-10'],['2026-09-10T13:30:00Z','2026-09-11'],['2026-09-10T15:59:42.924Z','2026-09-11']]) {
 const record=advanceC1ForwardModel(null,[session('2026-09-09')],new Date(time));
 assert.equal(record.firstDecisionSession,expected);
 assert.equal(record.pendingDecisionStatus.earliestExecutionSession,expected);
 assert.equal(record.summary.observedForwardSessions,0);
}
const invalidBaseline=advanceC1ForwardModel(null,[session('2026-09-09')],new Date('2026-09-10T15:59:42.924Z'));
invalidBaseline.firstDecisionSession='2026-09-10';
const originalBaseline=JSON.stringify(invalidBaseline);
assert.throws(()=>advanceC1ForwardModel(invalidBaseline,[session('2026-09-09'),session('2026-09-10')],new Date('2026-09-10T21:00:00Z')),/predates observation/);
assert.equal(JSON.stringify(invalidBaseline),originalBaseline,'An invalid historical baseline must not be silently reset');
const baseline=session('2026-09-09'),firstNow=new Date('2026-09-09T21:00:00Z');
const first=advanceC1ForwardModel(null,[baseline],firstNow);
assert.equal(first.pendingDecisionStatus.executable,false);assert.equal(first.pendingDecisionStatus.earliestExecutionSession,'2026-09-10');
assert.equal(first.paperExecutionStatus.status,'unchanged');assert.equal(first.paperExecution.cash,100000);
assert.equal(first.summary.paperExecution.executable,false);
assert.equal(first.summary.observedForwardSessions,0);assert.equal(first.summary.cash,100000);
assert.equal(first.summary.executable,false);assert.equal(first.firstDecisionSession,'2026-09-10');
const provisional=advanceC1ForwardModel(null,[{...baseline,universeSymbols:null}],firstNow);
assert.equal(provisional.summary.pointInTimeMembershipAvailable,false);
assert.equal(provisional.summary.eligibleForAlphaClaim,false,'Current-cohort paper records cannot be relabeled point-in-time evidence');
assert.equal(advanceC1ForwardModel(first,[baseline],firstNow),first,'Refresh retry cannot advance time');
const corruptCash=JSON.parse(JSON.stringify(first));corruptCash.paperExecution.cash+=1;
const rejectedCash=advanceC1ForwardModel(corruptCash,[session('2026-09-09')],firstNow);
assert.equal(rejectedCash.paperExecutionStatus.status,'blocked','Same-session service retry must validate cached execution cash');
assert.equal(corruptCash.paperExecution.cash,100001,'Do not silently repair a conflicting balance');
const legacy=JSON.parse(JSON.stringify(first));delete legacy.paperExecution;delete legacy.paperExecutionStatus;
const migrated=advanceC1ForwardModel(legacy,[session('2026-09-09')],firstNow);assert.equal(migrated.paperExecution.cash,100000);assert.equal(migrated.summary.observedForwardSessions,0);
const next=session('2026-09-10'),nextNow=new Date('2026-09-10T21:00:00Z');
const second=advanceC1ForwardModel(first,[baseline,next],nextNow);
assert.equal(second.summary.observedForwardSessions,1);assert.equal(first.sessions.length,1);
baseline.prices[0].close=101;
assert.throws(()=>advanceC1ForwardModel(first,[baseline,next],nextNow),/input changed/);
assert.throws(()=>advanceC1ForwardModel(first,[baseline,next],nextNow),error=>{
 assert.equal(error.inputRevision.date,'2026-09-09');
 assert.equal(JSON.stringify(error.inputRevision.changedFields),JSON.stringify(['prices']));
 assert.equal(error.inputRevision.originalPreserved,true);
 assert.equal(error.inputRevision.validationEligible,false);
 return true;
});
assert.equal(first.sessions[0].prices[0].close,100,'Rejected revisions must leave the original price untouched');
assert.throws(()=>advanceC1ForwardModel(first,[session('2026-09-11')],new Date('2026-09-11T21:00:00Z')),/Missing/);
assert.throws(()=>advanceC1ForwardModel(first,[next],firstNow),/future|not current/);
assert.equal(advanceC1ForwardModel(null,[session('2026-09-04')],new Date('2026-09-07T21:00:00Z')).firstDecisionSession,'2026-09-08');

// Execute the production storage coordinator with fake storage, not a second
// implementation of its conditional-write behavior.
const source=fs.readFileSync('lib/c1ForwardStore.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const box={advanceC1ForwardModel,C1_FORWARD_CONTRACT,latestCompletedMarketSessionDay,process,Buffer,Response};
vm.createContext(box);vm.runInContext(source+'\nglobalThis.api={advanceStoredC1ForwardModel,c1ForwardSummary,c1ForwardStorePath};',box);
const {advanceStoredC1ForwardModel:advanceStore,c1ForwardSummary,c1ForwardStorePath}=box.api;
assert.notEqual(c1ForwardStorePath('production'),c1ForwardStorePath('preview','a'.repeat(40)));
assert.equal(c1ForwardSummary(first,nextNow).status,'stale');
(async()=>{
 const snapshotSource=fs.readFileSync('lib/v11ProductionSnapshot.js','utf8')
  .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];/g,'').replace(/export /g,'');
 let snapshotWrites=0;
 const snapshotBox={process:{env:{VERCEL_ENV:'preview'}},
  put:async()=>{snapshotWrites++;},latestCompletedMarketSessionDay,
  marketSessionDistance:loader.load('lib/marketSession.js').marketSessionDistance,
  V11_PRODUCTION_POLICY_ID:'test',V11_PRODUCTION_MAX_SNAPSHOT_AGE_SESSIONS:0};
 vm.createContext(snapshotBox);vm.runInContext(snapshotSource+'\nglobalThis.testApi={persistSnapshot,assessSnapshot};',snapshotBox);
 await snapshotBox.testApi.persistSnapshot({});assert.equal(snapshotWrites,0,'Preview must not overwrite the production snapshot');
 snapshotBox.process.env.VERCEL_ENV='production';
 await snapshotBox.testApi.persistSnapshot({});assert.equal(snapshotWrites,1);
 assert.equal(snapshotBox.testApi.assessSnapshot({forwardAccounting:{environment:'preview'}},firstNow).forwardAccounting,null,
  'Preview accounting cannot satisfy production initialization');
 let record=null,etag=null,writes=0;
 const store={read:async()=>record?{record,etag}:null,write:async(path,next,expected)=>{
  assert.equal(expected,etag??undefined);record=next;etag='revision-'+(++writes);
 }};
 await advanceStore([session('2026-09-09')],firstNow,store,'test');
 await advanceStore([session('2026-09-09')],firstNow,store,'test');assert.equal(writes,1);
 await advanceStore([session('2026-09-09'),next],nextNow,store,'test');assert.equal(writes,2);
 let competing=null,attempts=0;
 const race={read:async()=>competing?{record:competing,etag:'winner'}:null,write:async(path,value)=>{
  attempts++;competing=value;const e=new Error('Race');e.name='BlobPreconditionFailedError';throw e;
 }};
 const recovered=await advanceStore([session('2026-09-09')],firstNow,race,'test');
 assert.equal(attempts,1);assert.equal(recovered.observedForwardSessions,0);
 console.log('PASS: unchanged simulator/options, forward-only clock, immutable inputs, gap detection, idempotence, conditional writes and preview isolation.');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Multi-session fills must append chronologically across all three sleeves.
{
 const symbols=Array.from({length:10},(_,i)=>'S'+i);
 const active=(date,price=100)=>({date,decisionAt:date+'T20:00:00Z',universeSymbols:symbols,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:price,close:price,high:price,low:price,volume:10000000})),
 signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%5,price,researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
 let r=null,previous=null;
 for(const [date,price] of [['2026-09-01',100],['2026-09-02',100],['2026-09-03',100],['2026-09-04',80]]){
  previous=r;r=advanceC1ForwardModel(r,[active(date,price)],new Date(date+'T21:00:00Z'));
  if(previous)assert.equal(JSON.stringify(r.ledger.fills.slice(0,previous.ledger.fills.length)),JSON.stringify(previous.ledger.fills),'New sleeve fills cannot reorder recorded history');
  assert.notEqual(r.paperExecutionStatus.status,'blocked',r.paperExecutionStatus.reason);
 }
 assert.ok(previous.ledger.fills.some(f=>f.side==='buy'));
 assert.ok(r.ledger.fills.some(f=>f.side==='sell'));
 assert.equal(r.summary.executable,false);
}
