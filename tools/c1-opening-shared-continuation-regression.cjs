// Real client -> localhost HTTP -> real account handler -> real opening provider.
// Provider HTTP, private progress storage and account storage are synthetic only.
// No production request, account write, trade, or investment-performance claim.
const assert=require('node:assert/strict'),http=require('node:http');
const {createOperationalModuleLoader}=require('./fixtures/c1-operational-modules.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const root=process.cwd(),NativeDate=Date,commit='a'.repeat(40);
let clock=NativeDate.parse('2026-11-11T15:00:00Z');
global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const copy=value=>JSON.parse(JSON.stringify(value));
async function captureScanBatches(run,rows){
 const info=console.info;
 console.info=(label,value,...rest)=>{if(label==='C1_OPENING_SCAN')rows.push(JSON.parse(value));info(label,value,...rest);};
 try{return await run();}finally{console.info=info;}
}
function memory(){
 const records=new Map(),operations=[];let version=0,conflicts=0,unavailable=false;
 return {records,operations,get conflicts(){return conflicts;},set unavailable(value){unavailable=value;},
  async read(path){operations.push({method:'read',path});if(unavailable)throw Error('Synthetic storage unavailable');return records.has(path)?copy(records.get(path)):null;},
  async write(path,record,expected){
   operations.push({method:'write',path});if(unavailable)throw Error('Synthetic storage unavailable');
   if((records.get(path)?.etag||null)!==(expected||null)){conflicts++;const error=Error('Synthetic conditional conflict');error.status=412;throw error;}
   const etag='"progress-'+ ++version+'"';records.set(path,{record:copy(record),etag});return {etag};
  }
 };
}
function factory(store,options={}){
 return createOperationalModuleLoader(root).load('lib/c1OpeningAnchorStore.js').createC1OpeningAnchorStore({store,environment:'production',commit,...options});
}
const bar=(date='2026-11-10',close=100)=>({date,open:close,high:close+1,low:close-1,close,volume:1e7,adjusted:true});
const context=(extra={})=>({sourceIdentity:'1'.repeat(64),sourceSessionDate:'2026-11-10',allowedSymbols:['AAA','BBB','CCC','SPY','QQQ'],now:new NativeDate(clock),...extra});
async function storeCases(){
 const storage=memory(),a=factory(storage),b=factory(storage),c=context();
 assert.equal((await a.read(c)).size,0);
 const receipts=await Promise.all([
  a.write({...c,anchors:new Map([['AAA',{anchor:bar()}]])}),
  b.write({...c,anchors:new Map([['BBB',{anchor:bar()}]])})
 ]);
 assert(storage.conflicts>=1,'Independent writers genuinely race through the conditional write boundary');
 assert.equal((await factory(storage).read(c)).size,2,'A fresh worker reads the union without losing the winning batch');
 assert.equal(Math.max(...receipts.map(value=>value.size)),2,'The conflict loser returns merged progress, not its local batch alone');
 assert(storage.operations.every(row=>row.path.startsWith('operations/c1-opening-anchors-v1/production/'+commit+'/2026-11-10/')),'Only the separate dated market-progress namespace is used');
 const [path,saved]=[...storage.records][0],original=copy(saved);
 assert.equal(saved.record.sourceIdentity,c.sourceIdentity);assert.equal(saved.record.sourceSessionDate,c.sourceSessionDate);
 assert.equal(saved.record.commit,commit);assert.equal(saved.record.environment,'production');
 assert.equal(saved.record.expiresAt-saved.record.updatedAt,300000);
 assert(!/brokerageCash|currentEventEvidence|quote|orders|fills|holdings/.test(JSON.stringify(saved.record)),'No execution or account evidence enters the cache');
 await assert.rejects(a.write({...c,anchors:new Map([['AAA',{anchor:bar('2026-11-10',101)}]])}),/changed|invalid/i,'Conflicting same-name anchors cannot silently overwrite evidence');
 await assert.rejects(a.write({...c,anchors:new Map([['OTHER',{anchor:bar()}]])}),/symbol|source/i);
 await assert.rejects(a.write({...c,anchors:new Map([['CCC',{anchor:bar('2026-11-09')}]] )}),/anchor|invalid/i);
 await assert.rejects(a.write({...c,anchors:new Map([['CCC',{anchor:bar(),quote:{price:1}}]])}),/schema|invalid/i);
 await assert.rejects(a.write({...c,anchors:new Map([['CCC',{anchor:{...bar(),close:NaN}}]])}),/anchor|invalid/i);
 await a.write({...c,anchors:new Map([['CCC',{unverified:true}]])});
 assert.deepEqual(copy((await a.read(c)).get('CCC')),{unverified:true},'Unavailable anchors remain unavailable rather than fabricated prices');
 assert.equal((await a.read({...c,now:new NativeDate(clock+300001)})).size,0,'Expired progress cannot establish completion');
 storage.records.set(path,copy(original));
 for(const [field,value]of [['contract','unknown'],['sourceIdentity','2'.repeat(64)],['sourceSessionDate','2026-11-09'],['commit','b'.repeat(40)],['environment','preview'],['updatedAt',clock+1],['expiresAt',clock+300001]]){
  const corrupted=copy(original);corrupted.record[field]=value;storage.records.set(path,corrupted);
  await assert.rejects(a.read(c),/invalid|evidence|identity/i,'Stored '+field+' mismatch cannot establish accepted progress');
 }
 for(const anchors of [[['OTHER',{anchor:bar()}]],[['AAA',{anchor:bar()}],['AAA',{anchor:bar()}]],[["AAA",{anchor:bar(),brokerageCash:100}]]]){
  const corrupted=copy(original);corrupted.record.anchors=anchors;storage.records.set(path,corrupted);
  await assert.rejects(a.read(c),/symbol|schema|invalid/i);
 }
 storage.records.set(path,copy(original));
 assert.equal((await factory(storage,{commit:'b'.repeat(40)}).read(c)).size,0,'A new deployment cannot reuse the earlier deployment cache');
 assert.equal((await factory(storage,{environment:'preview'}).read(c)).size,0,'Preview cannot reuse production progress');
 assert.equal((await a.read({...c,sourceIdentity:'2'.repeat(64)})).size,0,'A changed source has independent progress');
 const initialClock=clock;
 const duringRead=()=>{clock=initialClock+1;const winner=copy(original);winner.record.updatedAt=clock;winner.record.expiresAt=clock+300000;return winner;};
 const readRace=factory({read:async()=>duringRead(),write:async()=>{throw Error('Read cannot write');}});
 assert.equal((await readRace.read(c)).size,2,'A valid concurrent publication during awaited I/O is current at response receipt');
 clock=initialClock;let wroteAfterRead=false;
 const writeRace=factory({read:async()=>duringRead(),write:async()=>{wroteAfterRead=true;return {etag:'"new"'};}});
 assert.equal((await writeRace.write({...c,anchors:new Map([['CCC',{anchor:bar()}]])})).size,3,'Write refreshes its clock after the initial awaited read');
 assert(wroteAfterRead);clock=initialClock;
 const ttlMemory=memory(),ttl=factory(ttlMemory),one={...c,anchors:new Map([['AAA',{anchor:bar()}]])};
 await ttl.write(one);const expiry=[...ttlMemory.records.values()][0].record.expiresAt;
 clock=initialClock+240000;await ttl.write({...one,now:new NativeDate(clock)});
 assert.equal([...ttlMemory.records.values()][0].record.expiresAt,expiry,'An identical completed-cache publication cannot renew old anchor evidence');
 clock=initialClock+300001;assert.equal((await ttl.read({...c,now:new NativeDate(clock)})).size,0,'Frequent completed-cache reads/no-op writes do not prevent required expiry');
 clock=initialClock;
 storage.unavailable=true;
 await assert.rejects(a.read(c),/unavailable/i);
 await assert.rejects(a.write({...c,anchors:new Map([['AAA',{anchor:bar()}]])}),/unavailable/i);
 let racing=copy(original),attempts=0;
 const churn=factory({read:async()=>copy(racing),write:async()=>{
  racing.etag='"winner-'+ ++attempts+'"';const error=Error('Synthetic continuing writer');error.status=412;throw error;
 }});
 await assert.rejects(churn.write({...c,anchors:new Map([['CCC',{anchor:bar()}]])}),/concurrent|incomplete/i,'Continued contention is bounded rather than an infinite retry');
 assert.equal(attempts,3);
 console.log('PASS: shared-anchor conditional union, cold-worker reads, source/deployment isolation, TTL, schema, conflicting anchors and unavailable storage.');
}
async function httpCase(){
 const storage=memory(),calls=[],requests=[],steps=[],batches=[],workerIds=[];let api,mode='healthy',worker=0;
 const provider=async(raw)=>{
  const url=new URL(raw),endpoint=url.pathname.split('/').at(-1),baseline=api.fixture.book.model.sessions.at(-1);
  calls.push({endpoint,symbol:url.searchParams.get('symbol'),worker});let body;
  if(endpoint==='sp500-constituent'){
   body=[...baseline.signals.map(row=>({symbol:row.symbol,sector:row.sector})),...Array.from({length:500-baseline.signals.length},(_,index)=>({symbol:'Z'+String(index).padStart(3,'0'),sector:'Extra'}))];
  }else if(endpoint==='batch-quote'){
   body=url.searchParams.get('symbols').split(',').filter(symbol=>mode!=='missing-essential'||symbol!=='SPY').map(symbol=>{
    const price=baseline.prices.find(row=>row.symbol===symbol).close;
    return {symbol,price,open:price,timestamp:(clock-(mode==='expired-quotes'?121000:0))/1000};
   });
  }else if(endpoint==='dividend-adjusted'){
   const saved=baseline.prices.find(row=>row.symbol===url.searchParams.get('symbol'));
   assert(saved,'Historical request belongs to the accepted source');
   body=[{date:baseline.date,adjOpen:saved.close,adjHigh:saved.close*1.001,adjLow:saved.close*.999,adjClose:saved.close,volume:1e7}];
  }else throw Error('Unexpected external route: '+endpoint);
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 const collectOpening=async input=>{
  clock=+input.now;workerIds.push(++worker);
  // New module globals for EVERY HTTP call; only the injected private market
  // progress adapter is shared. No warm-worker affinity is available.
  const modules=createResearchModuleLoader(root);
  const anchorStore=modules.load('lib/c1OpeningAnchorStore.js').createC1OpeningAnchorStore({store:storage,environment:'production',commit});
  try{
   const result=await captureScanBatches(()=>modules.load('lib/c1AccountOpeningProvider.js').collectC1AccountOpening({...input,anchorStore,fetcher:provider,apiKey:'synthetic-only',
    collectEvents:async symbols=>{calls.push({endpoint:'current-events',worker});return new Map(currentEventEvidenceFor(symbols,input.now,mode==='blocked-event'?{X12:{state:'VERIFIED_BLOCKED'}}:{}).map(row=>[row.symbol,row]));}}),batches);
   steps.push(copy(result.scan));return result;
  }catch(error){if(error.code==='C1_SCAN_INCOMPLETE')steps.push(copy(error.scan));throw error;}
 };
 api=createWorkflowApi('buy',{baselineDate:'2026-11-10',now:new NativeDate(clock),portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],collectOpening,
  moduleOverrides:require('./fixtures/c1-account-policy-risk.cjs').approvedOperationalRiskModules(root)});
 applyAccountPolicyUniverseFixture(api.fixture,{count:100});api.fixture.setCash(100000);
 api.fixture.advance=()=>{api.fixture.now=new NativeDate(+api.fixture.now+1000);};
 const financialBefore=JSON.stringify(api.fixture.account);
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');let raw='';for await(const part of req)raw+=part;
   requests.push({method:req.method,path:url.pathname,review:url.searchParams.get('review'),body:raw?JSON.parse(raw):null});
   const response=await api.request(req.method,raw?JSON.parse(raw):undefined,true,Object.fromEntries(url.searchParams));
   res.writeHead(response.status,{'content-type':'application/json',...response.headers});res.end(JSON.stringify(response.body));
  }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const {readC1OpeningReview}=createOperationalModuleLoader(root).load('lib/c1OpeningReviewRead.js');
  const read=()=>readC1OpeningReview('offline_workflow_fixture_key_000001',()=>true,(url,options)=>fetch(origin+url,options));
  const result=await read();
  assert.equal(result.response.status,200);
  assert.equal(steps.length,1,'Fast bounded batches finish in one account-handler request: '+JSON.stringify({steps,error:result.execution.openingError,calls}));
  assert(steps[0].total>64);assert.deepEqual(batches.map(scan=>scan.completed),[64,78]);
  assert.equal(batches[0].complete,false);assert.equal(batches.at(-1).complete,true);
  assert.equal(storage.operations.filter(row=>row.method==='write').length,2,'Both bounded batches publish their own recoverable progress');
  assert.equal(new Set(steps.map(scan=>scan.sourceIdentity)).size,1);
  assert.equal(steps.at(-1).completed,steps.at(-1).total);assert.equal(steps.at(-1).complete,true);
  assert.equal(result.execution.openingError,null,'Full cross-worker scan reaches the actual planner rather than returning the incomplete message');
  assert(result.execution.openingPlan?.providerVerified,'The real account handler returns its verified opening plan');
  assert.equal(requests[0].method,'POST');assert.equal(requests[0].body.operation,'prepare-execution');
  assert.equal(requests.length,1,'No additional HTTP account replay is needed for a fast complete source');
  assert(requests.slice(1).every(row=>row.method==='GET'&&row.review==='opening'&&row.body===null),'Continuation uses read-only GET, never repeats the POST');
  assert.equal(new Set(workerIds).size,requests.length,'Each request used newly created provider/store module globals');
  assert.equal(calls.filter(row=>row.endpoint==='dividend-adjusted').length,steps.at(-1).total,'Immutable anchors are acquired once across independent workers');
  assert.equal(calls.filter(row=>row.endpoint==='sp500-constituent').length,requests.length+1,'Membership is checked anew per batch and twice on completion');
  assert(calls.filter(row=>row.endpoint==='batch-quote').length>=requests.length,'Each request acquires current quotes rather than caching them');
  assert.equal(calls.filter(row=>row.endpoint==='current-events').length,1,'Completed scan obtains current corporate-event evidence');
  const completeRequests=requests.length;
  mode='missing-essential';const missing=await read();
  assert(!missing.execution.openingPlan);assert.match(missing.execution.openingError,/Fresh opening quote missing for SPY/,'Shared dated anchors cannot replace a missing essential quote');
  mode='expired-quotes';const expired=await read();
  assert(!expired.execution.openingPlan);assert.match(expired.execution.openingError,/Fresh opening quote missing/,'Shared dated anchors cannot authorize expired current quotes');
  mode='blocked-event';const blocked=await read();
  assert.equal(blocked.execution.openingError,null);assert(blocked.execution.openingPlan?.providerVerified);
  assert(!blocked.execution.openingPlan.orders.some(order=>order.side==='buy'&&order.symbol==='X12'),'Fresh corporate-event block still excludes the stock after anchor-cache completion');
  assert.equal(JSON.stringify(api.fixture.account),financialBefore);assert.equal(api.fixture.writes,0);
  assert(storage.operations.every(row=>row.path.startsWith('operations/c1-opening-anchors-v1/')),'Only synthetic market-progress cache writes occur');
  console.log('PASS: real opening-read HTTP account path completes '+steps[0].total+' anchors in '+completeRequests+' POST with separate 64-name progress commits, fresh execution checks and zero account writes.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
async function largeUniverseCase({slow=false}={}){
 const storage=memory(),members=Array.from({length:500},(_,index)=>({symbol:'U'+String(index).padStart(3,'0'),sector:'Sector'+index%8}));
 const symbols=members.slice(0,205).map(row=>row.symbol);
 const baseline={date:'2026-11-10',universeSymbols:members.map(row=>row.symbol),prices:members.map(row=>({symbol:row.symbol,close:100})),signals:members.map(row=>({...row,price:100}))};
 const requests=[],batches=[],history=[],quoteBatches=[];let eventChecks=0;
 const fetcher=async raw=>{
  const url=new URL(raw),endpoint=url.pathname.split('/').at(-1);let body;
  if(endpoint==='sp500-constituent')body=members;
  else if(endpoint==='batch-quote'){
   const batch=url.searchParams.get('symbols').split(',');quoteBatches.push(batch);
   body=batch.map(symbol=>({symbol,price:100,open:100,timestamp:clock/1000}));
  }else if(endpoint==='dividend-adjusted'){
   if(slow)clock+=350; // Synthetic budget clock only; no sleep or performance claim.
   history.push(url.searchParams.get('symbol'));body=[{date:baseline.date,adjOpen:100,adjHigh:101,adjLow:99,adjClose:100,volume:1e7}];
  }else throw Error('External route forbidden');
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
 };
 const {readC1OpeningReview}=createOperationalModuleLoader(root).load('lib/c1OpeningReviewRead.js');
 const result=await readC1OpeningReview('synthetic-only',()=>true,async(_url,options)=>{
  clock+=1000;const now=new NativeDate(clock),modules=createResearchModuleLoader(root);
  const anchorStore=modules.load('lib/c1OpeningAnchorStore.js').createC1OpeningAnchorStore({store:storage,environment:'production',commit});
  let scan,openingError=null;
  try{
   scan=(await captureScanBatches(()=>modules.load('lib/c1AccountOpeningProvider.js').collectC1AccountOpening({baseline,symbols,essentialSymbols:[symbols[0]],now,anchorStore,fetcher,apiKey:'synthetic-only',
    collectEvents:async names=>{eventChecks++;return new Map(currentEventEvidenceFor(names,new NativeDate(clock)).map(row=>[row.symbol,row]));}}),batches)).scan;
  }catch(error){assert.equal(error.code,'C1_SCAN_INCOMPLETE');scan=error.scan;openingError=error.message;}
  requests.push({method:options.method,scan:copy(scan)});
  return new Response(JSON.stringify({decision:{contract:'c1-account-decision-v1',decisionId:'synthetic-large-source',revision:1,positions:[],scan},openingError}));
 });
 assert.deepEqual(requests.map(row=>row.method),slow?['POST','GET','GET','GET']:['POST']);
 assert.deepEqual(requests.map(row=>row.scan.completed),slow?[64,128,192,205]:[205],slow?'A slow source retains safe GET continuation across four cold workers':'A fast source avoids all three repeat account replays');
 assert.deepEqual(batches.map(row=>row.completed),[64,128,192,205]);
 assert(batches.every((row,index)=>row.completed-(batches[index-1]?.completed||0)<=64),'The fusion changes no 64-name provider batch bound');
 assert.equal(storage.operations.filter(row=>row.method==='write').length,4,'Every completed batch remains independently recoverable');
 assert.equal(new Set(requests.map(row=>row.scan.sourceIdentity)).size,1);assert.equal(result.execution.decision.scan.complete,true);assert.equal(result.execution.openingError,null);
 assert.equal(history.length,205);assert.equal(new Set(history).size,205,'All original 205 anchors are collected exactly once');
 assert.equal(quoteBatches.length,slow?12:3);assert(quoteBatches.every(batch=>batch.length<=100),'Every request independently obtains bounded current quotes');
 assert.equal(eventChecks,1);
 console.log('PASS: real 205-name collector/client '+(slow?'retains four cold-worker requests under a synthetic 350ms-per-anchor budget clock':'finishes all four 64-name batches in one POST')+'; no quote or event cache.');
}
(async()=>{await storeCases();await httpCase();await largeUniverseCase();await largeUniverseCase({slow:true});})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.Date=NativeDate;});
