// Real production event module, virtual provider/clock. No network or account I/O.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const inverse=require('./c1-merger-recovery-seams.cjs').restore;
const NativeDate=Date,epoch=Date.parse('2026-10-30T18:56:00.000Z'),plain=x=>JSON.parse(JSON.stringify(x));
const base=Array.from({length:1000},(_,i)=>({symbol:'A'+i,targetedSymbol:'T'+i,transactionDate:'2026-10-29'}));
const target={symbol:'ACQ',targetedSymbol:'CRWD',transactionDate:'2026-10-29'};
const secret='OFFLINE_PROVIDER_SECRET',bodySecret='OFFLINE_PRIVATE_BODY';
function harness({before=false,mergers=({page})=>page===0?base:[],news=[],deadline=30000}={}){
 let ms=epoch,handler=mergers;const calls=[],logs=[];
 class Clock extends NativeDate{constructor(...args){super(...(args.length?args:[ms]));}static now(){return ms;}}
 const fetcher=async raw=>{
  const url=new URL(raw),endpoint=url.pathname.split('/stable/')[1],page=Number(url.searchParams.get('page')||0),limit=Number(url.searchParams.get('limit')||1000);
  assert.equal(url.searchParams.get('apikey'),secret);calls.push({endpoint,page,limit});
  const value=endpoint==='mergers-acquisitions-latest'?await handler({page,limit,calls:calls.filter(x=>x.endpoint===endpoint),advance:delta=>{ms+=delta;}}):endpoint==='news/stock'?news:[];
  if(value instanceof Error)throw value;
  return new Response(JSON.stringify(value));
 };
 const oldRead=fs.readFileSync,oldDate=global.Date,oldConsole=global.console;
 let provider,reader;
 try{
  if(before)fs.readFileSync=(file,...args)=>String(file)===path.resolve('lib/eventRisk.js')?inverse(oldRead(file,...args)):oldRead(file,...args);
  global.Date=Clock;global.console={...console,info:(...args)=>logs.push(args)};
  const loader=createResearchModuleLoader(process.cwd());provider=loader.load('lib/eventRisk.js');reader=loader.load('lib/c1CurrentEventEvidence.js').readC1CurrentEventEvidence;
 }finally{fs.readFileSync=oldRead;global.Date=oldDate;global.console=oldConsole;}
 return {calls,logs,set(fn){handler=fn;},advance(delta){ms+=delta;},now:()=>new Clock(),async run(){return plain((await provider.fetchEventRiskMap(['CRWD','AMD'],{apiKey:secret,fetcher,deadlineMs:ms+deadline})).get('CRWD'));},state:risk=>reader(risk,new Clock())};
}
const source=risk=>risk.eventVerification.sources.find(x=>x.kind==='MERGERS'),mergerCalls=h=>h.calls.filter(x=>x.endpoint==='mergers-acquisitions-latest');
const overlap=({page})=>page===0?base:[base[999]];
(async()=>{
 const old=harness({before:true,mergers:overlap});assert.equal(old.state(await old.run()),'UNVERIFIED');old.set(({page})=>page===0?base:[]);
 assert.equal(old.state(await old.run()),'UNVERIFIED');assert.equal(mergerCalls(old).length,2,'Pre-repair cache pins the failed feed for one hour');
 const repaired=harness({mergers:overlap});assert.equal(repaired.state(await repaired.run()),'UNVERIFIED');assert.equal(mergerCalls(repaired).length,7);
 repaired.set(({page})=>page===0?base:[]);const recovered=await repaired.run();assert.equal(repaired.state(recovered),'VERIFIED_CLEAR');assert.equal(mergerCalls(repaired).length,9,'Verified next refresh reacquires both pages instead of borrowing the failed cache');
 for(const endpoint of ['earnings-calendar','news/stock'])assert.equal(repaired.calls.filter(x=>x.endpoint===endpoint).length,1,'Unrelated successful feeds keep their exact cache reuse');
 const onePass=harness({mergers:({page,calls})=>page===0?base:calls.length===2?[base[999]]:[]});
 const retryResult=await onePass.run();assert.equal(onePass.state(retryResult),'VERIFIED_CLEAR');assert.deepEqual(source(retryResult).paginationRecovery,{method:'fresh-full-pagination',initialReason:'PAGINATION_OVERLAP',recovered:true});assert.equal(mergerCalls(onePass).length,4);
 const permanentRepeat=harness({mergers:()=>base});assert.equal(permanentRepeat.state(await permanentRepeat.run()),'UNVERIFIED');assert.equal(mergerCalls(permanentRepeat).length,4,'Exactly one full retry; repeated pages never establish clearance');
 const timeout=harness({mergers:({page,advance})=>{if(!page)return base;advance(30001);return[base[999]];}});
 assert.equal(timeout.state(await timeout.run()),'UNVERIFIED');assert.equal(mergerCalls(timeout).length,2,'Expired acquisition cannot retry');
 const duringRetry=harness({mergers:({page,calls,advance})=>{if(calls.length===3)advance(30001);return !page?base:[base[999]];}});
 assert.equal(duringRetry.state(await duringRetry.run()),'UNVERIFIED');assert.equal(mergerCalls(duringRetry).length,3,'Retry retains original deadline, not a new budget');
 const adverse=harness({mergers:({page,calls})=>!page?(calls.length===1?[target,...base.slice(1)]:base):calls.length===2?[base[999]]:[]});
 const adverseResult=await adverse.run();assert.equal(adverse.state(adverseResult),'VERIFIED_BLOCKED');assert.equal(adverseResult.mergerEvent.target,'CRWD','A target observed before snapshot replacement cannot disappear from the risk review');
 const failedRetry=harness({mergers:({page,calls})=>calls.length===3?new Error(bodySecret):!page?base:[base[999]]});
 assert.equal(failedRetry.state(await failedRetry.run()),'UNVERIFIED');assert.equal(mergerCalls(failedRetry).length,3);
 for(const h of [repaired,onePass,permanentRepeat,timeout,duringRetry,adverse,failedRetry]){
  assert.doesNotMatch(JSON.stringify(h.logs),new RegExp(secret+'|'+bodySecret+'|CRWD|ACQ|financialmodelingprep|T999'));
  for(const row of h.logs){assert(['C1_EVENT_PAGINATION','C1_EVENT_BOUNDARY_PROOF'].includes(row[0]));const parsed=JSON.parse(row[1]);if(row[0]==='C1_EVENT_PAGINATION'){assert.equal(parsed.kind,'MERGERS');assert(['REPEATED_PAGE','PAGINATION_OVERLAP'].includes(parsed.reason));}}
 }
 for(const mergers of [()=>[],({page})=>!page?base:[],()=>[target],()=>new Error(bodySecret)]){
  const before=harness({before:true,mergers}),after=harness({mergers});assert.deepEqual(await after.run(),await before.run(),'Healthy and unrelated failed responses retain full serialized parity');assert.deepEqual(after.calls,before.calls);assert.deepEqual(after.logs,before.logs);
 }
 const newsPage=Array.from({length:500},(_,i)=>({symbol:'CRWD',publishedDate:'2026-10-30',title:'Routine update',url:'https://fixture.invalid/'+i}));
 const unchangedNews=harness({news:newsPage}),newsResult=await unchangedNews.run();assert.equal(unchangedNews.state(newsResult),'UNVERIFIED');assert(newsResult.eventVerification.reasons.includes('NEWS_REPEATED_PAGE'));assert.equal(unchangedNews.calls.filter(x=>x.endpoint==='news/stock').length,2,'No unrelated retry or pagination relaxation');
 // Observed live shape: exactly one prior last/current first row, including
 // after a fresh full retry. Only two complete independent partitions can
 // establish that this is a harmless inclusive boundary rather than missing data.
 const dataset=Array.from({length:2200},(_,i)=>({symbol:'A'+i,targetedSymbol:'T'+i,transactionDate:'2026-10-29'}));
 const inclusive=(data,page,limit)=>data.slice(page*(limit-1),page*(limit-1)+limit);
 const boundaryBefore=harness({before:true,mergers:({page,limit})=>inclusive(dataset,page,limit)});
 assert.equal(boundaryBefore.state(await boundaryBefore.run()),'UNVERIFIED');
 const boundary=harness({mergers:({page,limit})=>inclusive(dataset,page,limit)}),verifiedBoundary=await boundary.run();
 assert.equal(boundary.state(verifiedBoundary),'VERIFIED_CLEAR');
 const proof=source(verifiedBoundary).boundaryCoverage;assert.equal(proof.contract,'c1-merger-boundary-coverage-v1');assert.equal(proof.matched,true);assert.equal(proof.comparison,'BOUNDARY_ANCHORS_ONLY');assert.equal(proof.rowCount,2200);assert.match(proof.digest,/^[a-f0-9]{64}$/);
 assert.deepEqual(proof.pageSizes,[1000,997]);assert.equal(proof.partitions.length,2);
 for(const partition of proof.partitions)assert.deepEqual({...partition,pageSize:0},{pageSize:0,pageCount:3,boundaryCount:2,rawRowCount:2202,rowCount:2200});
 assert.equal(mergerCalls(boundary).length,10,'Two strict attempts plus two complete, independently partitioned scans');
 // Exact live count/shape: a physical duplicate at positions999/1000,
 // split by the1000 grid and wholly inside the997 grid. No row is dropped
 // from the raw comparison; complete record multiplicities must match.
 const physical=Array.from({length:4878},(_,i)=>({symbol:'A'+i,targetedSymbol:'T'+i,transactionDate:'2026-10-29'}));physical.splice(1000,0,{...physical[999]});
 for(const adverse of [false,true]){
  const data=physical.map((row,i)=>adverse&&[999,1000].includes(i)?target:row),h=harness({mergers:({page,limit})=>data.slice(page*limit,page*limit+limit)}),risk=await h.run();
  assert.equal(h.state(risk),adverse?'VERIFIED_BLOCKED':'VERIFIED_CLEAR');
  const proof=source(risk).boundaryCoverage;assert.equal(proof.matched,true);assert.equal(proof.comparison,'EXACT_RAW_MULTISET');assert.equal(proof.rowCount,4879);
  assert.deepEqual(proof.partitions,[{pageSize:1000,pageCount:5,boundaryCount:1,rawRowCount:4879,rowCount:4878},{pageSize:997,pageCount:5,boundaryCount:0,rawRowCount:4879,rowCount:4879}]);
 }
 for(const index of [0,996,999,1000,1998,2199]){
  const adverseData=dataset.map((row,i)=>i===index?target:row),h=harness({mergers:({page,limit})=>inclusive(adverseData,page,limit)});
  const risk=await h.run();assert.equal(h.state(risk),'VERIFIED_BLOCKED','Every validated target survives either partition and every boundary');
 }
 const mismatchCases=[
  data=>data.slice(1),data=>data.slice(0,-1),data=>[...data,{symbol:'NEW',targetedSymbol:'NEW',transactionDate:'2026-10-29'}],
  data=>data.map((row,i)=>i===1200?{...row,targetedSymbol:'CHANGED'}:row)
 ];
 for(const change of mismatchCases){
  const h=harness({mergers:({page,limit})=>inclusive(limit===997?change(dataset):dataset,page,limit)}),risk=await h.run();
  assert.equal(h.state(risk),'UNVERIFIED');assert.equal(source(risk).boundaryCoverage.matched,false,'Changed complete record sets never clear a boundary conflict');
 }
 for(const mode of ['overlap','repeated','over-cap','unavailable','malformed','deadline','stale','no-terminal']){
  const endless=Array.from({length:11000},(_,i)=>({symbol:'Q'+i,targetedSymbol:'R'+i,transactionDate:'2026-10-29'}));
  const h=harness({mergers:({page,limit,calls,advance})=>{
   if(mode==='no-terminal')return inclusive(endless,page,limit);
   if(limit!==997)return inclusive(dataset,page,limit);
   if(mode==='over-cap')return dataset.slice(0,1000);
   if(mode==='deadline'){advance(30001);return inclusive(dataset,page,limit);}
   if(mode==='stale'&&page===1)advance(3600001);
   if(page===1){
    if(mode==='overlap')return [dataset[995],...inclusive(dataset,page,limit).slice(1)];
    if(mode==='repeated')return inclusive(dataset,0,limit);
    if(mode==='unavailable')return new Error(bodySecret);
    if(mode==='malformed')return {error:bodySecret};
   }
   return inclusive(dataset,page,limit);
  }}),risk=await h.run();assert.equal(h.state(risk),'UNVERIFIED',mode+' must not establish boundary coverage');
  assert(mergerCalls(h).length<=24,'Both independent ten-page caps and original deadline remain bounded');
  assert.doesNotMatch(JSON.stringify(h.logs),new RegExp(secret+'|'+bodySecret+'|financialmodelingprep'));
 }
 // A target first observed in the second strict attempt also remains adverse,
 // even if both later complete partitions no longer contain that record.
 const secondAttempt=harness({mergers:({page,limit,calls})=>{
  const current=calls.length===3?[target,...dataset.slice(1)]:dataset;return inclusive(current,page,limit);
 }}),secondAttemptRisk=await secondAttempt.run();assert.equal(secondAttempt.state(secondAttemptRisk),'VERIFIED_BLOCKED');
 console.log('PASS: exact pre-repair cache/boundary failures; fresh retry/refresh recovery; two complete independent coverage partitions; six adverse target positions, four record-set mismatches, eight coverage failures; original deadlines/caps/healthy parity and private-safe diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
