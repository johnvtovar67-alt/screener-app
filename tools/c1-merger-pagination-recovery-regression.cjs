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
  const url=new URL(raw),endpoint=url.pathname.split('/stable/')[1],page=Number(url.searchParams.get('page')||0);
  assert.equal(url.searchParams.get('apikey'),secret);calls.push({endpoint,page});
  const value=endpoint==='mergers-acquisitions-latest'?await handler({page,calls:calls.filter(x=>x.endpoint===endpoint),advance:delta=>{ms+=delta;}}):endpoint==='news/stock'?news:[];
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
 const repaired=harness({mergers:overlap});assert.equal(repaired.state(await repaired.run()),'UNVERIFIED');assert.equal(mergerCalls(repaired).length,4);
 repaired.set(({page})=>page===0?base:[]);const recovered=await repaired.run();assert.equal(repaired.state(recovered),'VERIFIED_CLEAR');assert.equal(mergerCalls(repaired).length,6,'Verified next refresh reacquires both pages instead of borrowing the failed cache');
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
  for(const row of h.logs){assert.equal(row[0],'C1_EVENT_PAGINATION');const parsed=JSON.parse(row[1]);assert.equal(parsed.kind,'MERGERS');assert(['REPEATED_PAGE','PAGINATION_OVERLAP'].includes(parsed.reason));}
 }
 for(const mergers of [()=>[],({page})=>!page?base:[],()=>[target],()=>new Error(bodySecret)]){
  const before=harness({before:true,mergers}),after=harness({mergers});assert.deepEqual(await after.run(),await before.run(),'Healthy and unrelated failed responses retain full serialized parity');assert.deepEqual(after.calls,before.calls);assert.deepEqual(after.logs,before.logs);
 }
 const newsPage=Array.from({length:500},(_,i)=>({symbol:'CRWD',publishedDate:'2026-10-30',title:'Routine update',url:'https://fixture.invalid/'+i}));
 const unchangedNews=harness({news:newsPage}),newsResult=await unchangedNews.run();assert.equal(unchangedNews.state(newsResult),'UNVERIFIED');assert(newsResult.eventVerification.reasons.includes('NEWS_REPEATED_PAGE'));assert.equal(unchangedNews.calls.filter(x=>x.endpoint==='news/stock').length,2,'No unrelated retry or pagination relaxation');
 console.log('PASS: pre-repair one-hour poisoned-cache reproduction; immediate full-feed retry/next-refresh recovery; unchanged deadline, success/call parity, provider failures, permanent overlap/repeats, adverse target preservation and bounded private-safe diagnostics.');
})().catch(error=>{console.error(error);process.exitCode=1;});
