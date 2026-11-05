const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),clone=value=>JSON.parse(JSON.stringify(value));
const market=loader.load('lib/marketSession.js');
const imports={createHash,...market,...loader.load('lib/c1ForwardModel.js'),...loader.load('lib/c1DecisionSnapshot.js'),
 ...loader.load('lib/c1HoldingsComparison.js'),...loader.load('lib/c1LiveInput.js'),...loader.load('lib/c1BaselineReconciliation.js')};
const source=file=>fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
function load(file,bindings,names){const box={Date,process,...bindings};vm.createContext(box);vm.runInContext(source(file)+'\nglobalThis.api={'+names+'};',box);return box.api;}
const book=load('lib/c1DatedBook.js',imports,'acceptC1DatedInput,c1DatedBookView');
const stored=load('lib/c1DatedBookStore.js',book,'connectStoredC1DatedInput,prepareStoredC1DatedBook');
const archive=load('lib/c1IndexObservationStore.js',{...imports,c1DatedBookPath:()=> 'fixture/book.json.gz'},'archiveC1IndexObservation,readC1IndexObservations');
const symbols=['AAA','BBB','CCC','DDD'];
function input(date,previous){const observedAt=date+'T22:00:00.000Z';return {
 contract:'c1-dated-index-input-v1',universe:'sp500',sourceSessionDate:date,observedAt,metadata:{sectorBasis:'current'},
 sourceReceipt:{membershipCheckedTwice:true},priorSessionPrices:{date:previous,closes:Object.fromEntries([...symbols,'SPY','QQQ'].map(s=>[s,100]))},
 session:{date,decisionAt:observedAt,universeSymbols:symbols,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,close:100,high:101,low:99,volume:10000000,adjusted:true})),
 signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i,price:100,timestamp:Date.parse(observedAt)/1000,
 researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},
 entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))}};}
const days=['2026-09-09','2026-09-10','2026-09-11','2026-09-14','2026-09-15'];
const inputs=days.map((day,i)=>input(day,i?days[i-1]:'2026-09-08'));
const seed=book.acceptC1DatedInput(null,inputs[0],new Date(inputs[0].observedAt)),seedBytes=JSON.stringify(seed);
let expected=seed;for(const value of inputs.slice(1))expected=book.acceptC1DatedInput(expected,value,new Date(value.observedAt));
function harness({now='2026-09-15T22:30:00.000Z',initial=seed}={}){
 let current={record:clone(initial),etag:'0'},writes=0,providerCalls=0,failSession,failCount=0,unacknowledged;
 const observations=new Map(),writeDates=[];
 const store={read:async()=>({record:clone(current.record),etag:current.etag}),write:async(path,record,etag)=>{
  const day=record.captures.at(-1).sessionDate;
  if(etag!==current.etag)throw Object.assign(Error('Conditional write conflict'),{name:'BlobPreconditionFailedError'});
  if(day===failSession&&failCount-->0)throw Error('Synthetic storage unavailable');
  current={record:clone(record),etag:String(++writes)};writeDates.push(day);
  if(day===unacknowledged){unacknowledged=null;throw Error('Synthetic interrupted write response');}
 }};
 const observationStore={write:async(path,record)=>{if(observations.has(path))throw Error('exists');observations.set(path,clone(record));},
  read:async path=>observations.has(path)?clone(observations.get(path)):null,
  list:async prefix=>[...observations.keys()].filter(path=>path.startsWith(prefix))};
 const save=value=>archive.archiveC1IndexObservation(value,{now:new Date(value.observedAt),store:observationStore,bookPath:'fixture/book.json.gz'});
 const read=(day,options)=>archive.readC1IndexObservations(day,{...options,store:observationStore,bookPath:'fixture/book.json.gz'});
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}
 // Optional source argument proves the same sequence fails against the deployed
 // predecessor. Normal CI always loads the application source at this commit.
 const lifecycle=load(process.argv[2]||'lib/c1IndexLifecycle.js',{...market,Date:Clock,
  C1_SESSION_REVISION_REVIEW:loader.load('lib/c1SessionRevisionReview.js').C1_SESSION_REVISION_REVIEW},'refreshC1Index');
 const dependencies={now:new Date(now),prepare:options=>stored.prepareStoredC1DatedBook({...options,store,path:'fixture/book.json.gz'}),
  connect:(value,options)=>stored.connectStoredC1DatedInput(value,{...options,store,path:'fixture/book.json.gz'}),
  readObservations:read,archive:(value,options)=>archive.archiveC1IndexObservation(value,{...options,store:observationStore,bookPath:'fixture/book.json.gz'}),
  collect:async()=>{providerCalls++;throw Error('Market data provider request failed or timed out');}};
 return {save,read,prepare:dependencies.prepare,connect:dependencies.connect,run:options=>lifecycle.refreshC1Index({...dependencies,...options}),
  record:()=>current.record,writes:()=>writes,providerCalls:()=>providerCalls,writeDates,observations,
  interrupt:day=>{unacknowledged=day;},fail:(day,count=2)=>{failSession=day;failCount=count;}};
}
async function populate(h,values=inputs.slice(1)){for(const value of values)await h.save(value);}
function identical(h){assert.equal(JSON.stringify(h.record()),JSON.stringify(expected),'Complete cash, quantities, stops, queues, fills, summaries and accepted identities match uninterrupted execution');assert.equal(JSON.stringify(seed),seedBytes,'Original accepted record remains immutable');}
(async()=>{
 const outage=harness();await populate(outage);
 const recovered=await outage.run();assert.equal(recovered.sourceSessionDate,days.at(-1));assert.equal(recovered.recovered.length,4);
 assert.equal(outage.providerCalls(),0,'Available immutable evidence recovers during a provider outage');identical(outage);
 assert.ok(outage.record().model.ledger.fills.length>0,'The sequence exercises actual frozen model accounting');
 const writes=outage.writes();assert.equal((await outage.run()).status,'already-current');assert.equal(outage.writes(),writes,'Duplicate retry has no financial effect');

 const unack=harness();await populate(unack);unack.interrupt('2026-09-10');await unack.run();identical(unack);
 assert.equal(unack.writeDates.filter(date=>date==='2026-09-10').length,1,'Committed-but-unacknowledged writes resolve through verified saved state');

 const interrupted=harness();await populate(interrupted,inputs.slice(1,-1));interrupted.fail('2026-09-11');
 await assert.rejects(()=>interrupted.run({collect:async()=>clone(inputs.at(-1))}),/Synthetic storage unavailable/);
 assert.equal(interrupted.record().captures.at(-1).sessionDate,'2026-09-10','The last complete session is a durable checkpoint');
 assert.equal((await interrupted.read(days.at(-1),{now:new Date('2026-09-15T22:30:00Z')})).length,1,'A blocked backlog still preserves today’s completed observation');
 await interrupted.run();identical(interrupted);
 assert.equal(interrupted.writeDates.filter(date=>date==='2026-09-10').length,1,'Restart resumes after the committed session');

 const concurrent=harness();await populate(concurrent);await Promise.all([concurrent.run(),concurrent.run()]);identical(concurrent);
 for(const day of days.slice(1))assert.equal(concurrent.writeDates.filter(date=>date===day).length,1,'Competing workers cannot duplicate '+day);
 // This worker began from the original seed before another completed the whole
 // sequence. Its unchanged captures must resolve against the newer winner.
 await concurrent.run({prepare:async()=>book.c1DatedBookView(seed,[],new Date('2026-09-15T22:30:00Z'))});identical(concurrent);
 assert.equal(concurrent.writes(),days.length-1,'A lagging worker cannot overwrite a newer accepted book');

 const missing=harness();await populate(missing,inputs.slice(2));const beforeMissing=JSON.stringify(missing.record());
 await assert.rejects(()=>missing.run({collect:async()=>clone(inputs.at(-1))}),/Missing archived index session: 2026-09-10/);
 assert.equal(JSON.stringify(missing.record()),beforeMissing,'An absent session is never fabricated');
 const damaged=harness();await populate(damaged);const first=[...damaged.observations.keys()].find(path=>path.includes('/2026-09-10/'));
 damaged.observations.get(first).payload.session.prices[0].close=99;
 await assert.rejects(()=>damaged.run({collect:async()=>clone(inputs.at(-1))}),/archive integrity/);assert.equal(damaged.writes(),0);

 const economic=harness();const changed=clone(inputs[1]);changed.priorSessionPrices.closes.AAA=50;await populate(economic,[changed,...inputs.slice(2)]);
 await assert.rejects(()=>economic.run({collect:async()=>clone(inputs.at(-1))}),/requires reconciliation/);assert.equal(economic.writes(),0,'Archive recovery never relaxes economic checks');
 const currentRejected=harness({now:'2026-09-10T22:30:00Z'});await populate(currentRejected,[changed]);
 await assert.rejects(()=>currentRejected.run(),error=>{
  assert.match(error.message,/requires reconciliation/);assert.equal(error.priceAnchorMismatch.mismatchCount,1);
  assert.equal(error.indexRecovery.state,'blocked');assert.equal(error.indexRecovery.sessionDate,'2026-09-10');
  assert.equal(error.indexRecovery.acquisition,'failed');return true;
 });assert.equal(currentRejected.writes(),0,'A provider timeout cannot erase the demonstrated economic rejection');

 const backlogOnly=harness();await populate(backlogOnly,inputs.slice(1,-1));
 await assert.rejects(()=>backlogOnly.run(),/provider request failed or timed out/);assert.equal(backlogOnly.record().captures.at(-1).sessionDate,'2026-09-14','Provider failure does not prevent valid historical progress');
 await backlogOnly.save(inputs.at(-1));await backlogOnly.run();identical(backlogOnly);

 const fresh=harness();await populate(fresh,inputs.slice(1,-1));await fresh.run({collect:async()=>clone(inputs.at(-1))});identical(fresh);
 for(const calendar of [
  ['2026-10-29','2026-10-30','2026-11-02','2026-11-03','2026-11-04'],
  ['2026-11-25','2026-11-27','2026-11-30','2026-12-01'],
  ['2026-09-09','2026-09-10','2026-09-11','2026-09-14','2026-09-15','2026-09-16','2026-09-17']
 ]){
  const values=calendar.map((day,i)=>input(day,i?calendar[i-1]:market.previousMarketSessionDay(day)));
  const original=book.acceptC1DatedInput(null,values[0],new Date(values[0].observedAt));let uninterrupted=original;
  for(const value of values.slice(1))uninterrupted=book.acceptC1DatedInput(uninterrupted,value,new Date(value.observedAt));
  const h=harness({now:calendar.at(-1)+'T22:30:00Z',initial:original});await populate(h,values.slice(1));await h.run();
  assert.equal(JSON.stringify(h.record()),JSON.stringify(uninterrupted),'DST, weekend, holiday/early-close and maximum permitted backlog preserve complete accounting');
  assert.equal(h.providerCalls(),0);
 }
 const tooFar=harness({now:'2026-09-22T22:30:00Z'}),today=input('2026-09-22','2026-09-21');
 await assert.rejects(()=>tooFar.run({collect:async()=>today}),/five missing sessions/);assert.equal(tooFar.writes(),0,'Recovery remains bounded');
 assert.equal((await tooFar.read('2026-09-22',{now:new Date('2026-09-22T22:30:00Z')})).length,1);

 console.log('PASS: real immutable archive → strict accepted book → frozen accounting sequences; provider outage, duplicate retry, interrupted writes, restart, concurrent workers, missing/corrupt/economic evidence, bounded backlog and fresh acquisition');
})().catch(error=>{console.error(error);process.exitCode=1;});
