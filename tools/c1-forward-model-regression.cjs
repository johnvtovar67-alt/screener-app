const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto'),{gunzipSync}=require('node:zlib');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {advanceC1ForwardModel,C1_FORWARD_CONTRACT}=loader.load('lib/c1ForwardModel.js');
const {latestCompletedMarketSessionDay}=loader.load('lib/marketSession.js');
assert.equal(createHash('sha256').update(fs.readFileSync('lib/c1FrozenSimulator.js')).digest('hex'),
 'bcf3cc3e89ac499319a2cbfab76e42fda3bda5ef72d2d45777959e73e6ad9e7d','Live paper service must use the historical simulator unchanged');
const opts=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
for(const universe of ['nasdaq','sp500']){
 const fixture=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(`tools/fixtures/c1-${universe}-accounting.json.gz.base64`,'utf8'),'base64')));
 for(const run of fixture)assert.equal(JSON.stringify(opts[run.id]),JSON.stringify(run.options),'Frozen options must match both historical fixtures');
}
const session=date=>({date,decisionAt:date+'T20:00:00Z',universeSymbols:[],signals:[],prices:[{symbol:'SPY',open:100,close:100},{symbol:'QQQ',open:100,close:100}]});
const baseline=session('2026-09-09'),firstNow=new Date('2026-09-10T15:00:00Z');
const first=advanceC1ForwardModel(null,[baseline],firstNow);
assert.equal(first.paperExecutionStatus.status,'unchanged');assert.equal(first.paperExecution.cash,100000);
assert.equal(first.summary.paperExecution.executable,false);
assert.equal(first.summary.observedForwardSessions,0);assert.equal(first.summary.cash,100000);
assert.equal(first.summary.executable,false);assert.equal(first.firstDecisionSession,'2026-09-10');
const provisional=advanceC1ForwardModel(null,[{...baseline,universeSymbols:null}],firstNow);
assert.equal(provisional.summary.pointInTimeMembershipAvailable,false);
assert.equal(provisional.summary.eligibleForAlphaClaim,false,'Current-cohort paper records cannot be relabeled point-in-time evidence');
assert.equal(advanceC1ForwardModel(first,[baseline],firstNow),first,'Refresh retry cannot advance time');
const legacy=JSON.parse(JSON.stringify(first));delete legacy.paperExecution;delete legacy.paperExecutionStatus;
const migrated=advanceC1ForwardModel(legacy,[session('2026-09-09')],firstNow);assert.equal(migrated.paperExecution.cash,100000);assert.equal(migrated.summary.observedForwardSessions,0);
const next=session('2026-09-10'),nextNow=new Date('2026-09-10T21:00:00Z');
const second=advanceC1ForwardModel(first,[baseline,next],nextNow);
assert.equal(second.summary.observedForwardSessions,1);assert.equal(first.sessions.length,1);
baseline.prices[0].close=101;
assert.throws(()=>advanceC1ForwardModel(first,[baseline,next],nextNow),/input changed/);
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
