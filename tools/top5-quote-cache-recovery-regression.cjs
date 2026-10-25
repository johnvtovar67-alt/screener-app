// Full actual route/provider orchestration with synthetic HTTP and memory only.
// Reproduce malformed quote cache poisoning, then exercise explicit recovery.
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createHarness,CURRENT}=require('./top5-performance-regression.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const blob=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
const source=fs.readFileSync(CURRENT,'utf8');
const header='    res.setHeader("X-C1-Request-Id", top5RequestId());\n';
const verifiedCache='    cached.quoteCoverageAdequate === true &&\n';
const comment='          // A rejected price must not replace the last usable cache entry.\n';
const guarded='if (toPositiveNumber(row?.price)) cache.set(symbol, { ts: Date.now(), data: row });';
assert.equal(source.split(guarded).length,3,'Only the two quote cache admission writes change');
assert.equal(source.split(header).length,2,'One passive response correlation header');
assert.equal(source.split(verifiedCache).length,2,'One completed-cache eligibility check');
const original=source.replace(', top5RequestId }',' }').replace(header,'').replace(comment,'')
 .replace(verifiedCache,'').replaceAll(guarded,'cache.set(symbol, { ts: Date.now(), data: row });');
assert.equal(blob(original),'3268d660390187e9e991d815d8068a441304e077','Exact complete deployed PR333 route reversal; no policy/TTL/observation/retry changes');
const getter='\n// Reuse the existing request timing identity for response/browser correlation.\nexport function top5RequestId() { return requests.getStore()?.id || null; }\n';
const diagnostics=fs.readFileSync('lib/top5Diagnostics.js','utf8');
assert.equal(diagnostics.split(getter).length,2);
assert.equal(blob(diagnostics.replace(getter,'')),'d2510daec24a002ebd6d9729c14a082a264d0677','Existing request profiler/timing/deadline/diagnostics remain exact');
const withoutHeader=response=>{const result=clone(response);delete result.headers['X-C1-Request-Id'];return result;};
const correlations=h=>{
 const records=h.logs.filter(row=>row[0]==='C1_SCREEN_OPERATIONAL').map(row=>JSON.parse(row[1]));
 const requests=h.logs.filter(row=>row[0]==='TOP5_TIMING').map(row=>JSON.parse(row[1])).filter(row=>row.event==='request');
 return {records,requests};
};

async function recovery(value,portfolio=false){
 const options={quoteOverrides:{}};
 const priorOptions={quoteOverrides:{},routeSource:original};
 const before=createHarness(CURRENT,priorOptions);
 const after=createHarness(CURRENT,options);
 const query={compact:'1',verificationPass:portfolio?'0':'1'};
 const a=await before.clock.settle(before.request(query)),b=await after.clock.settle(after.request(query));
 assert.deepEqual(withoutHeader(b),a,'Original successful full response preserved');
 assert.deepEqual(clone(after.calls),clone(before.calls),'Original successful provider/storage calls and timestamps preserved');
 assert.deepEqual(clone([...after.quoteCache()]),clone([...before.quoteCache()]),'Original successful cache preserved');
 before.clock.advance(portfolio?301000:61000);after.clock.advance(portfolio?301000:61000);
 priorOptions.quoteTimestamp=before.clock.now()/1000;options.quoteTimestamp=after.clock.now()/1000;
 options.quoteOverrides.SPY={price:value};options.quoteOverrides.QQQ={price:value};
 priorOptions.quoteOverrides.SPY={price:value};priorOptions.quoteOverrides.QQQ={price:value};
 const oldBad=await before.clock.settle(before.request({...query,verificationPass:portfolio?'0':'2'}));
 const bad=await after.clock.settle(after.request({...query,verificationPass:portfolio?'0':'2'}));
 assert.deepEqual(withoutHeader(bad),oldBad,'This malformed-provider response remains exactly fail closed');
 assert.equal(bad.body.meta.quoteCoverageAdequate,false);
 assert(bad.body.stocks.every(row=>!['Buy','Strong Buy'].includes(row.finalDecision?.action)));
 for(const symbol of ['SPY','QQQ']){
  assert.equal(after.quoteCache().get(symbol).data.price,100,'Last usable quote is not replaced');
  assert.equal(after.quoteCache().get(symbol).ts,1791493200000,'Malformed response cannot renew cache age');
  assert.equal(before.quoteCache().get(symbol).data.price,value,'Original route poisons its fresh cache');
 }
 delete options.quoteOverrides.SPY;delete options.quoteOverrides.QQQ;
 delete priorOptions.quoteOverrides.SPY;delete priorOptions.quoteOverrides.QQQ;
 const oldCount=before.calls.filter(row=>row.phase==='quote').length,newCount=after.calls.filter(row=>row.phase==='quote').length;
 const oldRecovery=await before.clock.settle(before.request({...query,verificationPass:portfolio?'0':'3'}));
 const recovered=await after.clock.settle(after.request({...query,verificationPass:portfolio?'0':'3'}));
 assert.equal(oldRecovery.body.meta.quoteCoverageAdequate,false,'Reproduced old failure remains after provider recovery');
 assert.equal(before.calls.filter(row=>row.phase==='quote').length,oldCount,'Original fresh bad cache prevents reacquisition');
 assert.equal(recovered.body.meta.quoteCoverageAdequate,true,'Next explicit refresh reacquires healthy benchmark observations');
 assert.equal(recovered.body.meta.quoteFeedStatus,'live');
 assert.equal(after.calls.filter(row=>row.phase==='quote').length,newCount+1,'Recovery makes one ordinary batch request only');
 return {flow:portfolio?'Portfolio pass0':'Opportunities incremented pass',value,oldRecoveryPaused:true,explicitRecoveryLive:true,additionalRecoveryQuoteCalls:1};
}

async function main(){
 const results=[];
 for(const value of [null,0,-1,'','not-a-number','Infinity'])results.push(await recovery(value));
 results.push(await recovery(null,true));
 // Healthy formatted prices retain the existing normalizer and cache contracts.
 for(const value of [100,'100','100.00','1,000.00','100%']){
  const options={quoteOverrides:{SPY:{price:value},QQQ:{price:value}}};
  const before=createHarness(CURRENT,{...options,routeSource:original}),after=createHarness(CURRENT,options);
  const a=await before.clock.settle(before.request()),b=await after.clock.settle(after.request());
  assert.deepEqual(withoutHeader(b),a);assert.deepEqual(clone(after.calls),clone(before.calls));
  assert.deepEqual(clone([...after.quoteCache()]),clone([...before.quoteCache()]));
  const {records,requests}=correlations(after);
  assert.match(b.headers['X-C1-Request-Id'],/^[a-f0-9]{10}$/);
  assert.equal(b.headers['X-C1-Request-Id'],records[0].request);assert.equal(records[0].request,requests[0].request);
 }
 // The emergency path must not turn malformed single-symbol rows into fresh
 // cache entries either; existing caps/cooldown/failure result remain unchanged.
 for(const value of [null,0,-1,'bad']){
  const seed={};for(const symbol of ['AAPL','MSFT','NVDA','AVGO','AMD','MU','ARM','SMCI','SPY','QQQ'])seed[symbol]={price:value};
  const options={batchStatus:403,quoteOverrides:new Proxy(seed,{get:(target,key)=>key in target?target[key]:{price:value}})};
  const before=createHarness(CURRENT,{...options,routeSource:original}),after=createHarness(CURRENT,options);
  const a=await before.clock.settle(before.request()),b=await after.clock.settle(after.request());
  assert.deepEqual(withoutHeader(b),a,'Emergency malformed response remains unchanged');assert.equal(b.code,503);
  assert.deepEqual(clone(after.calls),clone(before.calls),'No new automatic provider or ledger attempt');
  assert.equal(after.quoteCache().size,0,'Invalid emergency observations never become a fresh cache');
  assert(before.quoteCache().size>0,'Original emergency path caches the malformed observations');
  const failures=after.logs.filter(row=>row[0]==='C1_SCREEN_OPERATIONAL').map(row=>JSON.parse(row[1]));
  assert.equal(b.headers['X-C1-Request-Id'],failures.at(-1).request,'Failure header reuses existing safe request identity');
 }
 const {createResearchModuleLoader}=require('./research-module-loader.cjs');
 assert.equal(createResearchModuleLoader(process.cwd()).load('lib/top5Diagnostics.js').top5RequestId(),null,'No request identity is generated outside a request');
 console.log(JSON.stringify({completeRoute:true,malformedRecoveryCases:results,healthyParityCases:5,emergencyMalformedCases:4,existingRequestIdentityReused:true,syntheticOnly:true,noAutomaticMutationRetries:true},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
