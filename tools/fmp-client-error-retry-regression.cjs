// Actual provider module, synthetic HTTP/storage only; no process credentials.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {restoreProviderTransport,installProviderTransport}=require('./c1-provider-transport-seams.cjs');
const original=fs.readFileSync('tools/fixtures/fmp-fundamentals-production-8b7b1c5.js','utf8');
const current=fs.readFileSync('lib/fmpFundamentals.js','utf8');
const hash=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
assert.equal(hash(original),'4b2bd3e61c91204df675f13ad985cd335113311c');
assert.equal(restoreProviderTransport('lib/fmpFundamentals.js',current).replace('    let nonRetryableResponse=false;\n','').replace('if(r.status<500){nonRetryableResponse=[400,401,404,405,410,422].includes(r.status);throw e;}','if(r.status<500)throw e;').replace('if(nonRetryableResponse||hardFeedError(e?.status))throw e;','if(hardFeedError(e?.status))throw e;'),original,'Exact reversal recovers complete original provider module');
function load(source,responses){
 const calls=[],timers=[],writes=[],logs=[];let index=0;
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-23T16:00:00Z']));}static now(){return Date.parse('2026-10-23T16:00:00Z');}}
 const sandbox={module:{exports:{}},process:{env:{FMP_API_KEY:'offline-fixture'}},Date:Clock,
  URL,URLSearchParams,Response,Map,Set,Math,Number,String,Object,Array,Boolean,AbortController,
  console:{warn:(...args)=>logs.push(args)},setTimeout(fn,ms){timers.push(ms);if(ms===450)queueMicrotask(fn);return timers.length;},clearTimeout(){},
  toFmpSymbol:s=>String(s||'').replace('.','-').toUpperCase().trim(),assertTop5Active(){},isTop5Deadline:e=>e?.code==='TOP5_TIMEOUT',
  top5Phase:(_name,task)=>task(),top5Count(){},
  list:async()=>({blobs:[]}),get:async()=>{throw Error('Unexpected storage get');},put:async(...args)=>{writes.push(args);return{};},
  top5Fetch:async(url,options)=>{calls.push({url,signal:options.signal});const row=responses[Math.min(index++,responses.length-1)];if(row.error)throw row.error;return {ok:row.status>=200&&row.status<300,status:row.status,headers:new Headers(row.headers||{}),json:async()=>{if(row.parseError)throw row.parseError;return structuredClone(row.body);},text:async()=>row.text||'offline response'};},
 };
 sandbox.Headers=Headers;
 const code=source.replace(/^import .*;\n/gm,'').replace(/export (async )?function /g,'$1function ')+'\nmodule.exports={fetchJson,fetchBulkJson,fetchFmpFundamentals,refreshAllFmpFundamentalsBulk};';
 installProviderTransport(sandbox);
 vm.runInNewContext(code,sandbox,{filename:'actual-fmpFundamentals.js'});
 return {...sandbox.module.exports,calls,timers,writes,logs,sandbox};
}
const json=x=>JSON.parse(JSON.stringify(x));
async function failed(module){try{await module.fetchJson('https://provider.invalid/offline');assert.fail('Expected failure');}catch(e){return e;}}
(async()=>{
 const old=load(original,[{status:404}]);assert.equal((await failed(old)).status,404);assert.equal(old.calls.length,2,'Frozen source reproduces duplicate permanent-failure request');assert.ok(old.timers.includes(450));
 for(const status of [400,401,404,405,410,422]){
  const before=load(original,[{status}]),after=load(current,[{status}]);
  assert.equal((await failed(after)).message,(await failed(before)).message);
  assert.equal(after.calls.length,1,'HTTP '+status+' must not be retried');assert.ok(!after.timers.includes(450));assert.equal(after.writes.length,0);
 }
 // Hard rate/subscription cooldowns, transient HTTP/network/parser failure and
 // deadline identity retain their precise prior behavior and call budgets.
 const deadline=Object.assign(new Error('offline deadline'),{code:'TOP5_TIMEOUT'});
 const scenarios=[
  [{status:200,body:{value:1}}], [{status:402}], [{status:403}], [{status:429,headers:{'retry-after':'2'}}],
  [{status:500},{status:200,body:[{value:2}]}], [{status:503}],
  [{status:408},{status:200,body:[{value:'timeout-recovery'}]}],
  [{status:425},{status:200,body:[{value:'early-recovery'}]}],
  [{status:302},{status:200,body:[{value:'redirect-recovery'}]}],
  [{status:409},{status:200,body:[{value:'conflict-recovery'}]}],
  [{status:406}], [{status:407}], [{status:423}], [{status:451}],
  [{error:new Error('offline network')},{status:200,body:[]}],
  [{status:200,parseError:new SyntaxError('offline JSON')},{status:200,body:[]}], [{error:deadline}],
 ];
 for(const responses of scenarios){
  const a=load(original,responses),b=load(current,responses);
  const outcome=async m=>{try{return {result:json(await m.fetchJson('https://provider.invalid/offline'))};}catch(e){return {error:e.message,status:e.status,code:e.code};}};
  assert.deepEqual(await outcome(a),await outcome(b));assert.equal(a.calls.length,b.calls.length);assert.deepEqual(a.timers,b.timers);
  for(const key of new Set([...Object.keys(a.sandbox),...Object.keys(b.sandbox)].filter(k=>k.startsWith('__'))))assert.equal(a.sandbox[key],b.sandbox[key],'Exact cooldown state retained');
  if(responses[0].status===429){assert.equal((await failed(a)).status,429);assert.equal((await failed(b)).status,429);assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);}
 }
 // Actual public enrichment composition: successful outputs/cache persistence
 // identical; permanent-failure fallback still returns identical unavailable rows.
 for(const status of [200,401,404,422,429,503]){
  const responses=status===200?[{status:200,body:[{symbol:'AAA',grossProfitMarginTTM:.4,operatingProfitMarginTTM:.2,debtToEquityRatioTTM:.3,growthRevenue:.1,growthEPS:.2}]}]:[{status}];
  const a=load(original,responses),b=load(current,responses);
  assert.deepEqual(json([...await a.fetchFmpFundamentals(['AAA'])]),json([...await b.fetchFmpFundamentals(['AAA'])]));
  assert.deepEqual(json(a.writes),json(b.writes));
  if([401,404,422].includes(status))assert.equal(a.calls.length,2*b.calls.length);else assert.equal(a.calls.length,b.calls.length);
  if(status===200){const count=a.calls.length;assert.deepEqual(json([...await a.fetchFmpFundamentals(['AAA'])]),json([...await b.fetchFmpFundamentals(['AAA'])]));assert.equal(a.calls.length,count);assert.equal(b.calls.length,count);}
 }
 // Bulk's already single-attempt transport remains unchanged.
 for(const status of [200,404,429,503]){
  const responses=[{status,body:[{symbol:'AAA',value:1}]}],a=load(original,responses),b=load(current,responses);
  const out=async m=>{try{return json(await m.fetchBulkJson('https://provider.invalid/bulk'));}catch(e){return {error:e.message,status:e.status};}};
  assert.deepEqual(await out(a),await out(b));assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);
 }
 console.log('FMP CLIENT ERROR RETRY PASS: old duplicate request reproduced; client failures stop once; transient/cooldown/output/cache parity retained.');
})().catch(e=>{console.error(e);process.exitCode=1;});
