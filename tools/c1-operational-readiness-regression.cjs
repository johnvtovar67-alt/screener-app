const assert=require('node:assert/strict');
const {createOperationalModuleLoader}=require('./fixtures/c1-operational-modules.cjs');
const l=createOperationalModuleLoader(process.cwd());
const {buildC1OperationalReadiness:build,c1OperationalReadinessView:view}=l.load('lib/c1OperationalReadiness.js');
const {probeC1Readiness:probe,observeC1ScheduledReadiness:observe}=l.load('lib/c1ReadinessProbe.js');
const {publishC1Readiness:publish,readC1Readiness:read}=l.load('lib/c1ReadinessStore.js');
const {createC1ReadinessHandler:handler}=l.load('pages/api/c1-readiness.js');
const fs=require('node:fs'),vm=require('node:vm'),{timingSafeEqual}=require('node:crypto');
const clone=x=>JSON.parse(JSON.stringify(x)),commit='a'.repeat(40),now=new Date('2026-11-02T15:00:00Z');
const full={sourceSessionDate:'2026-10-30',observedAt:now,commit,expectedCount:4,quoteCount:4,regularQuoteCount:4,eventCount:4};
function memory(){let serial=0;const map=new Map(),calls=[];let fail='',lost='';return {map,calls,
 setFailure:x=>fail=x,setLost:x=>lost=x,
 async read(path){calls.push(['read',path]);return map.has(path)?clone(map.get(path)):null;},
 async write(path,record,etag){calls.push(['write',path]);if(fail&&path.includes(fail))throw Error('PRIVATE_STORE_SENTINEL');
  if(map.has(path)&&(!etag||map.get(path).etag!==etag))throw Error('Conflict');
  map.set(path,{record:clone(record),etag:'v'+(++serial)});if(lost&&path.includes(lost))throw Error('PRIVATE_LOST_ACK');}
 };}
function risk(symbol,at,{blocked=false,complete=true}={}){return {symbol,status:blocked?'Blocked':'Clear',blockNewCapital:blocked,
 checkComplete:complete,eventRiskVerified:complete,earningsCheckComplete:complete,mergerCheckComplete:complete,newsCheckComplete:complete,
 eventVerification:{contract:'c1-current-event-evidence-v1',state:complete?(blocked?'VERIFIED_BLOCKED':'VERIFIED_CLEAR'):'UNVERIFIED',provider:'FMP',
 observedAt:at.toISOString(),expiresAt:new Date(at.getTime()+300000).toISOString(),sources:[['EARNINGS','earnings-calendar',900000],['MERGERS','mergers-acquisitions-latest',3600000],['NEWS','news/stock',300000]].map(([kind,endpoint,ttl])=>({kind,endpoint,complete,reason:complete?'OK':'UNAVAILABLE',fetchedAt:at.toISOString(),expiresAt:new Date(at.getTime()+ttl).toISOString()}))}};}
async function main(){
 const ready=build(full);assert.equal(ready.code,'CHECK_PASSED');assert.equal(view(ready,{now,commit}).severity,'healthy');
 assert.equal(build({...full,eventBlockedCount:2}).severity,'healthy','Verified issuer events are legitimate blocks, not a service outage');
 for(const [patch,code] of [[{quoteCount:3,regularQuoteCount:3},'QUOTE_VERIFICATION_INCOMPLETE'],[{eventCount:3},'EVENT_VERIFICATION_INCOMPLETE'],[{expectedCount:0},'PROBE_SCOPE_INVALID'],[{probeFailed:true},'PROBE_UNAVAILABLE'],[{indexFailed:true},'INDEX_UPDATE_FAILED'],[{sourceSessionDate:'2026-10-29'},'SOURCE_NOT_CURRENT']])assert.equal(build({...full,...patch}).code,code);
 assert.equal(build({...full,observedAt:'2026-11-02T14:30:01Z',regularQuoteCount:0}).code,'WAITING_OPEN_QUOTES');
 assert.equal(build({...full,observedAt:'2026-11-02T14:33:00Z',regularQuoteCount:0}).code,'QUOTE_VERIFICATION_INCOMPLETE');
 const friday=build({...full,observedAt:'2026-10-30T20:15:00Z',sourceSessionDate:'2026-10-29',indexFailed:true});
 assert.equal(friday.code,'CLOSING_UPDATE_PENDING');
 assert.equal(build({...full,observedAt:'2026-10-30T20:35:00Z',sourceSessionDate:'2026-10-29',indexFailed:true}).code,'INDEX_UPDATE_FAILED');
 for(const at of ['2026-11-01T18:00:00Z','2026-11-02T14:29:59Z'])assert.equal(build({...full,observedAt:at,regularQuoteCount:0}).code,'WAITING_REGULAR_SESSION');
 assert.equal(build({...full,observedAt:'2026-11-02T21:00:00Z'}).code,'CLOSING_UPDATE_PENDING');
 assert.equal(view(null,{now,commit}).code,'NOT_OBSERVED');
 assert.equal(view(ready,{now,commit:'b'.repeat(40)}).code,'DEPLOYMENT_NOT_CHECKED');
 assert.equal(view(ready,{now:new Date(now.getTime()+1200001),commit}).code,'CHECK_EXPIRED');
 for(const patch of [{observedAt:'future'},{observedAt:new Date(now.getTime()+1).toISOString()},{eventCount:99},{quoteCount:-1},{severity:'error'},{sourceSessionDate:'2026-10-29'}])assert.equal(view({...ready,...patch},{now,commit}).code,'RECEIPT_INVALID');
 assert(!JSON.stringify(view({...ready,privateKey:'PRIVATE_SENTINEL',orders:[{symbol:'AAA',shares:99}]},{now,commit})).includes('PRIVATE_SENTINEL'));
 const prefix='operations/c1-readiness-v1/synthetic',store=memory();
 const before=JSON.stringify(ready);await publish(ready,{store,prefix});assert.deepEqual(clone(await read({store,prefix})),clone(ready));assert.equal(JSON.stringify(ready),before);
 assert.equal(store.calls.filter(c=>c[0]==='write').length,2);
 const newer=build({...full,observedAt:new Date(now.getTime()+1000)});await publish(newer,{store,prefix});
 assert.equal((await publish(ready,{store,prefix})).status,'superseded');assert.deepEqual(clone(await read({store,prefix})),clone(newer));
 const lost=memory();lost.setLost('/receipts/');await publish(ready,{store:lost,prefix});assert.equal(lost.calls.filter(c=>c[0]==='write').length,2,'A lost acknowledgement is verified by read without a second PUT');
 const failed=memory();failed.setFailure('/receipts/');await assert.rejects(publish(ready,{store:failed,prefix}));assert(!failed.map.has(prefix+'/head.json'));
 const corrupt=memory();await publish(ready,{store:corrupt,prefix});const head=corrupt.map.get(prefix+'/head.json').record;corrupt.map.get(head.path).record.code='PROBE_UNAVAILABLE';await assert.rejects(read({store:corrupt,prefix}),/integrity/);
 const index={sourceSessionDate:full.sourceSessionDate,decisionSnapshot:{contract:'c1-shared-model-decision-v1',status:'diagnostic-only',requiredSessionDate:full.sourceSessionDate,sourceSessionDate:full.sourceSessionDate,symbols:[{symbol:'AAA'},{symbol:'BBB'}]}};
 const calls=[],quotes=async(url)=>{calls.push(url);return new Response(JSON.stringify(['AAA','BBB','SPY','QQQ'].map(symbol=>({symbol,price:100,timestamp:now.getTime()/1000}))),{status:200});};
 const events=async symbols=>new Map(symbols.map(symbol=>[symbol,risk(symbol,now,{blocked:symbol==='BBB'})]));
 const options={index,now:()=>now,commit,apiKey:'PRIVATE_PROVIDER_KEY',fetcher:quotes,events};
 const probeResult=await probe(options);assert.equal(probeResult.code,'CHECK_PASSED');assert.equal(probeResult.eventBlockedCount,1);assert.equal(calls.length,1);
 assert.doesNotMatch(JSON.stringify(probeResult),/AAA|BBB|PRIVATE_|price|shares|orders|cash/);
 assert.equal((await probe({...options,events:async symbols=>new Map(symbols.map(symbol=>[symbol,risk(symbol,now,{complete:symbol!=='AAA'})]))})).code,'EVENT_VERIFICATION_INCOMPLETE');
 assert.equal((await probe({...options,fetcher:async()=>new Response('PRIVATE_PROVIDER_BODY',{status:503})})).code,'PROBE_UNAVAILABLE');
 assert.equal((await probe({...options,index:{sourceSessionDate:full.sourceSessionDate}})).code,'PROBE_SCOPE_INVALID');
 assert.equal((await probe({...options,index:{...index,decisionSnapshot:{...index.decisionSnapshot,status:'unavailable'}}})).code,'PROBE_SCOPE_INVALID','HTTP success and benchmark quotes cannot hide an unusable model decision');
 const wide={...index,decisionSnapshot:{...index.decisionSnapshot,symbols:Array.from({length:27},(_,i)=>({symbol:'NAME'+i}))}};
 const wideResult=await probe({...options,index:wide,fetcher:async()=>new Response(JSON.stringify([...wide.decisionSnapshot.symbols.map(r=>r.symbol),'SPY','QQQ'].map(symbol=>({symbol,price:100,timestamp:now.getTime()/1000}))))});
 assert.equal(wideResult.code,'CHECK_PASSED');assert.equal(wideResult.expectedCount,29,'Diagnostic scope covers the real three-sleeve union, without a smaller invented limit');
 let excessCalls=0;assert.equal((await probe({...options,index:{...index,decisionSnapshot:{...index.decisionSnapshot,symbols:Array.from({length:40},(_,i)=>({symbol:'NAME'+i}))}},fetcher:async()=>{excessCalls++;}})).code,'PROBE_SCOPE_INVALID');assert.equal(excessCalls,0,'Malformed excess scope never starts provider acquisition');
 assert.equal((await probe({...options,deadlineMs:Date.now()+5,fetcher:()=>new Promise(()=>{}),events:()=>new Promise(()=>{})})).code,'PROBE_UNAVAILABLE','An uncooperative body cannot exceed the diagnostic deadline');
 let writes=0;const logged=[];await observe(options,{probe:async()=>probeResult,publish:async()=>writes++,emit:(...args)=>logged.push(args)});assert.equal(writes,1);assert.equal(logged[0][0],'C1_READINESS_OPERATIONAL');
 await observe(options,{probe:async()=>{throw Error('PRIVATE_SENTINEL');},emit:(...args)=>logged.push(args)});assert.doesNotMatch(JSON.stringify(logged),/PRIVATE_/);
 await observe(options,{probe:async()=>probeResult,publish:async()=>{},emit:()=>{throw Error('logger');}});
 const bounded=Date.now();assert.equal(await observe({deadlineMs:Date.now()+5},{probe:async()=>probeResult,publish:()=>new Promise(()=>{}),emit(){}}),null);assert(Date.now()-bounded<1000,'Unresponsive diagnostic storage cannot hold up the normal cron response');
 let reads=0,body,status;const api=handler({read:async()=>{reads++;return ready;},clock:()=>now,commit});
 const res={setHeader(){},status(code){status=code;return this;},json(value){body=value;return value;}};
 await api({method:'GET'},res);assert.equal(status,200);assert.equal(body.code,'CHECK_PASSED');assert.equal(reads,1);
 await api({method:'POST'},res);assert.equal(status,405);assert.equal(reads,1,'The public status route cannot acquire or mutate anything');
 // Real scheduled route: operational observation cannot change original auth,
 // successful payload or collection failure. No protected endpoint is invoked.
 const routeSource=fs.readFileSync('pages/api/cron/c1-index.js','utf8').replace(/^import .*;\n/gm,'').replace(/export const /g,'const ').replace('export default async function handler','async function handler');
 for(const mode of ['success','failure','expired','unauthorized','wrong-method']){
  let collected=0,observed=0,elapsed=0;class Clock extends Date{static now(){return 1000000+elapsed;}}
  const box={Date:Clock,Math,Buffer,timingSafeEqual,process:{env:{CRON_SECRET:'offline-only'}},console:{info(){},error(){}},
   refreshC1Index:async()=>{collected++;if(mode==='expired')elapsed=281000;if(mode==='failure')throw Error('Index observation archive unavailable');return {...index,status:'advanced',universe:'sp500',sourceHash:'original-source',recordHash:'original-record',decisionSnapshot:{...index.decisionSnapshot,decisionId:'original-decision'}};},
   observeC1ScheduledReadiness:async options=>{observed++;assert(options.deadlineMs<=1290000);return observe(options,{probe:async()=>probeResult,publish:async()=>{throw Error('DIAGNOSTIC_STORAGE_ONLY');},emit(){}});}};
  vm.createContext(box);vm.runInContext(routeSource+';this.handler=handler;',box);let status,body;
  await box.handler({method:mode==='wrong-method'?'POST':'GET',headers:{authorization:mode==='unauthorized'?'Bearer wrong':'Bearer offline-only'}},{setHeader(){},status(s){status=s;return this;},json(b){body=b;return this;}});
  assert.equal(status,mode==='failure'?503:mode==='unauthorized'?401:mode==='wrong-method'?405:200);
  assert.equal(collected,['unauthorized','wrong-method'].includes(mode)?0:1);assert.equal(observed,['success','failure'].includes(mode)?1:0);
  if(status===200){assert.equal(body.recordHash,'original-record');assert.equal(body.decisionId,'original-decision');assert.equal(body.executable,false);}
 }
 console.log('PASS: market-aware operational checks, verified event/quote adapters, bounded deadlines, issuer blocks, private immutable receipt publication, lost-ack read recovery, unknown/expired/deployment state, sanitized read-only API; zero account/performance/trade calls.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
