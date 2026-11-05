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
function identical(h){assert.equal(JSON.stringify(h.record()),JSON.stringify(expected),'Complete persisted cash, quantities, positions, queues, fills, summaries and accepted identities match uninterrupted execution');assert.equal(JSON.stringify(seed),seedBytes,'Original accepted record remains immutable');}
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

 // Successive provider vintages traverse the real immutable archive, strict
 // reconciliation and conditional store together. CVX has no candidate signal
 // or exposure; AAA is actually held before its material correction is tested.
 const revisionDays=['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'];
 function revisionInput(day,previous,corrections={}){
  const value=input(day,previous);value.sourceReceipt.provider='FMP';
  value.session.universeSymbols=[...value.session.universeSymbols,'CVX'];
  value.session.prices.push({symbol:'CVX',open:100,close:100,high:101,low:99,volume:10000000,adjusted:true});
  value.priorSessionPrices.closes.CVX=100;
  for(const [symbol,bar]of Object.entries(corrections))value.priorSessionPrices.closes[symbol]=bar.close;
  value.priceEvidence={contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',
   rows:[...value.session.prices.map(price=>({price,date:previous})),...value.session.prices.map(price=>({price,date:day}))].map(({price,date})=>{
    const bar=date===previous?{...price,...corrections[price.symbol]}:price;
    return {symbol:price.symbol,date,adjOpen:bar.open,adjHigh:bar.high,adjLow:bar.low,adjClose:bar.close,volume:bar.volume};
   })};return value;
 }
 function at(value,time){const next=clone(value);next.observedAt=next.session.decisionAt=value.sourceSessionDate+'T'+time+'.000Z';
  for(const row of next.session.signals)row.timestamp=Date.parse(next.observedAt)/1000;return next;}
 const cleanRevisionInputs=revisionDays.map((day,index)=>revisionInput(day,index?revisionDays[index-1]:'2026-10-30'));
 const revisionSeed=book.acceptC1DatedInput(null,cleanRevisionInputs[0],new Date(cleanRevisionInputs[0].observedAt));
 const revisionSeedBytes=JSON.stringify(revisionSeed),vintages=harness({initial:revisionSeed,now:'2026-11-06T22:30:00Z'});
 const benign1=revisionInput(revisionDays[1],revisionDays[0],{CVX:{close:99.9}});
 const benign2=revisionInput(revisionDays[2],revisionDays[1],{CVX:{close:99.8}});
 const material=revisionInput(revisionDays[3],revisionDays[2],{AAA:{open:1,high:1.01,low:.99,close:1}});
 const nextVintage=revisionInput(revisionDays[4],revisionDays[3],{CVX:{close:99.6}});
 for(const value of [benign1,benign2,material,nextVintage])await populate(vintages,[at(value,'21:00:00'),value]);
 await assert.rejects(()=>vintages.run(),error=>{
  assert.equal(error.providerRevisionDiagnostic.stage,'model-parity');
  assert(error.providerRevisionDiagnostic.modelParity.changedPathCount>0,'Material revision produces a demonstrated complete-state difference');
  assert(error.providerRevisionDiagnostic.modelParity.comparedFields.some(field=>field.field==='ledger'&&field.changedPathCount>0));
  assert.deepEqual(Array.from(error.indexRecovery.recoveredSessionDates),revisionDays.slice(1,3));return true;
 });
 const checkpoint=clone(vintages.record());assert.equal(checkpoint.captures.at(-1).sessionDate,revisionDays[2]);
 assert.equal(checkpoint.reconciliations.length,2);
 for(let index=0;index<2;index++){
  const audit=checkpoint.reconciliations[index];assert.equal(audit.contract,'c1-provider-revision-reconciliation-v1');
  assert.equal(audit.confirmationCount,1);assert.equal(audit.observations.length,2);assert.equal(audit.identicalModelEconomics,true);
  assert.equal(audit.mismatches[0].symbol,'CVX');assert.equal(audit.mismatches[0].revised.close,[99.9,99.8][index]);
 }
 assert(checkpoint.model.ledger.fills.some(fill=>fill.symbol==='AAA'),'Material rejection concerns actual modeled exposure');
 assert(!checkpoint.model.ledger.fills.some(fill=>fill.symbol==='CVX'),'Harmless correction is independently unexposed');
 assert.equal(vintages.writeDates.includes(revisionDays[3]),false,'An economically material vintage never becomes accepted history');
 assert.equal(JSON.stringify(revisionSeed),revisionSeedBytes);
 assert.equal(JSON.stringify(checkpoint.model.sessions.slice(0,1)),JSON.stringify(revisionSeed.model.sessions));
 assert.equal(JSON.stringify(checkpoint.captures.slice(0,1)),JSON.stringify(revisionSeed.captures));

 // A later independently confirmed observation restores AAA's original basis
 // while retaining another harmless revision. The rejected records remain
 // archived; acceptance resumes from the last completed durable checkpoint.
 const repairedVintage=revisionInput(revisionDays[3],revisionDays[2],{CVX:{close:99.7}});
 const repairedLatest=at(repairedVintage,'22:15:00');await populate(vintages,[at(repairedVintage,'22:05:00'),repairedLatest]);
 await vintages.run();const finished=vintages.record();
 assert.equal((await vintages.read(revisionDays[3],{now:new Date('2026-11-06T22:30:00Z')})).length,4,'Rejected and corrected vintages are both immutable evidence');
 assert.equal(finished.reconciliations.length,4);assert.equal(finished.captures.at(-1).sessionDate,revisionDays.at(-1));
 assert.equal(JSON.stringify(finished.captures.slice(0,checkpoint.captures.length)),JSON.stringify(checkpoint.captures));
 assert.equal(JSON.stringify(finished.model.sessions.slice(0,checkpoint.model.sessions.length)),JSON.stringify(checkpoint.model.sessions));
 assert.equal(JSON.stringify(finished.reconciliations.slice(0,2)),JSON.stringify(checkpoint.reconciliations));
 assert.equal(JSON.stringify(finished.model.ledger.fills.slice(0,checkpoint.model.ledger.fills.length)),JSON.stringify(checkpoint.model.ledger.fills));
 cleanRevisionInputs[3]=at(cleanRevisionInputs[3],'22:15:00');let revisionExpected=revisionSeed;
 for(const value of cleanRevisionInputs.slice(1))revisionExpected=book.acceptC1DatedInput(revisionExpected,value,new Date(value.observedAt));
 assert.equal(JSON.stringify(finished.model),JSON.stringify(revisionExpected.model),'All persisted fills, cash, quantities, positions, summaries, pending orders and metadata equal uninterrupted original-basis execution');
 assert.equal(JSON.stringify(finished.captures),JSON.stringify(revisionExpected.captures),'Revision evidence never rewrites accepted session identities');
 for(const day of revisionDays.slice(1))assert.equal(vintages.writeDates.filter(value=>value===day).length,1);
 const completedWrites=vintages.writes();assert.equal((await vintages.run()).status,'already-current');assert.equal(vintages.writes(),completedWrites);

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

 console.log('PASS: real immutable archive → strict accepted book → frozen accounting sequences; provider outage, duplicate retry, interrupted writes, restart, concurrent workers, successive confirmed revisions, material rejection then corrected recovery, missing/corrupt evidence, bounded backlog and fresh acquisition');
})().catch(error=>{console.error(error);process.exitCode=1;});
