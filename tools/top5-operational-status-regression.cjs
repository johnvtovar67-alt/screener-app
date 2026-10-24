const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const helper=createResearchModuleLoader(process.cwd()).load('lib/top5Diagnostics.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const base={stocks:[{symbol:'PRIVATE_SYMBOL',price:123.45}],meta:{quoteFeedStatus:'live',quoteCoverageAdequate:true,
 fundamentalFeedStatus:'healthy',returned:587,buys:0,strongBuys:0,productionPolicy:{sourceSessionDate:'2026-10-23'},privateKey:'PRIVATE_KEY'}};
const source=JSON.stringify(base),status=helper.top5ScreenOperationalStatus;
assert.equal(status(base).code,'SCREEN_FEEDS_HEALTHY');
for(const [mutate,code] of [
 [v=>v.meta.quoteFeedStatus='stale-verified','SCREEN_SNAPSHOT_STALE'],
 [v=>v.meta.clientSnapshotFallback=true,'SCREEN_SNAPSHOT_STALE'],
 [v=>v.meta.quoteCoverageAdequate=false,'SCREEN_QUOTE_VERIFICATION_INCOMPLETE'],
 [v=>delete v.meta.quoteFeedStatus,'SCREEN_QUOTE_VERIFICATION_INCOMPLETE'],
 [v=>v.meta.quoteFeedStatus='PRIVATE_PROVIDER_ERROR','SCREEN_QUOTE_VERIFICATION_INCOMPLETE'],
 [v=>v.meta.fundamentalFeedStatus='unavailable','SCREEN_FUNDAMENTAL_FEED_UNAVAILABLE'],
 [v=>v.meta.fundamentalFeedStatus='degraded','SCREEN_FUNDAMENTAL_COVERAGE_DEGRADED'],
 [v=>delete v.meta.fundamentalFeedStatus,'SCREEN_FUNDAMENTAL_STATUS_UNKNOWN'],
 [v=>v.stocks=[],'SCREEN_EMPTY_WITH_HEALTHY_FEEDS'],
 [v=>v.stocks=[null],'SCREEN_RESPONSE_INCOMPLETE'],
 [v=>delete v.meta,'SCREEN_RESPONSE_INCOMPLETE']
]){const v=clone(base);mutate(v);const before=JSON.stringify(v);assert.equal(status(v).code,code);assert.equal(JSON.stringify(v),before);}
assert.equal(status(null).code,'SCREEN_RESPONSE_INCOMPLETE');
const malformed=clone(base);Object.assign(malformed.meta,{returned:'PRIVATE_COUNT',buys:Infinity,strongBuys:-1,productionPolicy:{sourceSessionDate:'PRIVATE_DATE'}});
const safe=status(malformed);assert.equal(safe.sourceRowCount,null);assert.equal(safe.broadBuyCount,null);assert.equal(safe.broadStrongBuyCount,null);assert.equal(safe.sourceSessionDate,null);
const report=JSON.stringify(status(base));assert(!/PRIVATE_|123.45|price|symbol|privateKey/.test(report));
assert.equal(status(base).c1Selection,'NOT_VERIFIED');assert.equal(status(base).accountOpening,'NOT_VERIFIED');assert.equal(status(base).executable,false);
let logged=[];
assert.strictEqual(helper.top5ObserveScreenResponse(base,(...args)=>logged.push(args)),base);
assert.equal(logged.length,1);assert.equal(logged[0][0],'C1_SCREEN_OPERATIONAL');
assert.strictEqual(helper.top5ObserveScreenResponse(base,()=>{throw Error('PRIVATE_LOG_FAILURE');}),base);
assert.doesNotThrow(()=>helper.top5ObserveScreenResponse({get meta(){throw Error('PRIVATE_DIAGNOSTIC_FAILURE');}},()=>{throw Error();}));
helper.top5ObserveScreenFailure(Error('PRIVATE_PROVIDER_URL_APIKEY'),(...args)=>logged.push(args));
assert.equal(JSON.parse(logged.at(-1)[1]).code,'SCREEN_REQUEST_FAILED');
helper.top5ObserveScreenFailure(new helper.Top5DeadlineError(),(...args)=>logged.push(args));
assert.equal(JSON.parse(logged.at(-1)[1]).code,'SCREEN_REQUEST_TIMEOUT');
assert(!JSON.stringify(logged).includes('PRIVATE_'));assert.equal(JSON.stringify(base),source);
assert.doesNotThrow(()=>helper.top5ObserveScreenFailure(Error('secret'),()=>{throw Error('logger');}));
console.log('PASS: passive screen metadata diagnostics distinguish healthy/degraded/stale/unavailable/empty/failure states, preserve response identity and redact raw data even on logger failure.');
