// Real quote-only handler and browser transport, synthetic provider evidence only.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createOperationalModuleLoader}=require('./fixtures/c1-operational-modules.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const now=new Date('2026-11-04T15:10:00Z');
const quote={symbol:'SYNA',price:90,timestamp:now.getTime()/1000,_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteCache:'live',_fmpQuoteFetchedAt:now.toISOString(),_fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol:'SYNA',price:90,timestamp:now.getTime()/1000,fetchedAt:now.toISOString()}};
let calls=[];
const route=createOperationalModuleLoader(process.cwd(),{'../../lib/fmpQuotes':{fetchFmpQuote:()=>{throw Error('Live provider forbidden');}},'../../lib/publicApiFailure':{sendPublicApiFailure:(res,x)=>res.status(x.status).json({error:x.error,detail:x.detail})}}).load('pages/api/c1-stop-quote.js');
async function invoke(fetchQuote,req={method:'GET',query:{symbol:'SYNA'}},timeoutMs=20){const result={headers:{},statusCode:200},handler=route.createC1StopQuoteHandler({fetchQuote,clock:()=>now,timeoutMs});await handler(req,{setHeader(k,v){result.headers[k]=v;},status(n){result.statusCode=n;return this;},json(body){result.body=body;return this;}});return result;}
(async()=>{
 const success=await invoke(async(symbol,options)=>{calls.push({symbol,options});return quote;});
 assert.equal(success.body.contract,'c1-stop-quote-v1');assert.equal(success.body.stock.quoteVerification.verifiedRegularSession,true);assert.equal(calls.length,1);assert.equal(calls[0].options.forceRefresh,true);assert.match(success.headers['Cache-Control'],/no-store/);
 for(const patch of [{timestamp:quote.timestamp-121},{_fmpQuoteCache:'stale-fallback'},{_fmpQuoteObservation:null},{timestamp:quote.timestamp+1}]){
  const result=await invoke(async()=>({...quote,...patch}));assert.equal(result.body.stock.quoteVerification.verifiedRegularSession,false,'Old, fallback, future or unbound evidence never authorizes a current stop');
 }
 assert.equal((await invoke(async()=>({...quote,symbol:'OTHER'}))).statusCode,503);
 assert.equal((await invoke(()=>new Promise(()=>{}))).statusCode,503,'Server has its own deadline');
 for(const req of [{method:'POST',query:{symbol:'SYNA'}},{method:'GET',query:{symbol:['SYNA','OTHER']}},{method:'GET',query:{symbol:'../private'}}]){
  let invoked=false;const result=await invoke(async()=>{invoked=true;return quote;},req);assert(result.statusCode>=400);assert.equal(invoked,false);
 }
 const {requestC1StopQuote,createC1StopVerification}=createResearchModuleLoader(process.cwd()).load('lib/c1StopVerification.js');
 let requested;
 assert.equal((await requestC1StopQuote('SYNA',{fetcher:async(url,options)=>{requested={url,options};return {ok:true,json:async()=>success.body};}})).price,90);
 assert.equal(requested.url,'/api/c1-stop-quote?symbol=SYNA');assert.equal(requested.options.cache,'no-store');
 for(const fetcher of [async()=>new Promise(()=>{}),async()=>({ok:true,json:()=>new Promise(()=>{})})]){
  let signal;await assert.rejects(requestC1StopQuote('SYNA',{timeoutMs:10,fetcher:(url,options)=>{signal=options.signal;return fetcher();}}),/timed out/);assert.equal(signal.aborted,true);
 }
 for(const response of [{ok:false},{ok:true,json:async()=>{throw Error('bad json');}},{ok:true,json:async()=>({...success.body,stock:{...quote,symbol:'OTHER'}})}])await assert.rejects(requestC1StopQuote('SYNA',{fetcher:async()=>response}));
 let binding='same',releaseA,releaseB;const published=[],verifier=createC1StopVerification(()=>binding);
 const a=verifier.verify({symbol:'A',collect:()=>new Promise(r=>releaseA=r),publish:x=>published.push(x)});
 const b=verifier.verify({symbol:'B',collect:()=>new Promise(r=>releaseB=r),publish:x=>published.push(x)});
 releaseB({price:2});releaseA({price:1});assert.equal((await a).status,'published');assert.equal((await b).status,'published');assert.equal(published.length,2,'Separate holdings retain independent verified observations');
 // A transport generation can change while the reconciled economic snapshot is identical.
 let owner='old-frame',identity='same-account-and-portfolio',attempts=0,accepted=[];
 const retry=createC1StopVerification(()=>owner,()=>identity);
 assert.equal((await retry.verify({symbol:'SYNA',collect:async()=>{attempts++;if(attempts===1)owner='new-frame';return {attempt:attempts};},publish:x=>accepted.push(x)})).status,'published');
 assert.equal(attempts,2);assert.equal(accepted.length,1);assert.equal(accepted[0].binding,'new-frame');assert.equal(accepted[0].stock.attempt,2,'Old response is discarded, never rebound');
 for(const change of ['different-revision','different-shares','different-stops','different-entered-portfolio',null]){
  owner='before';identity='original';attempts=0;accepted=[];
  const fenced=createC1StopVerification(()=>owner,()=>identity);
  const result=await fenced.verify({symbol:'SYNA',collect:async()=>{attempts++;owner=change===null?null:'after';identity=change;return quote;},publish:x=>accepted.push(x)});
  assert.equal(result.status,'superseded');assert.equal(attempts,1);assert.equal(accepted.length,0,'Changed/unknown ownership cannot trigger retry or publication');
 }
 owner='one';identity='unchanged';attempts=0;
 const twice=createC1StopVerification(()=>owner,()=>identity);
 assert.equal((await twice.verify({symbol:'SYNA',collect:async()=>{owner=String(++attempts);return quote;},publish:()=>assert.fail('Continuously changing frames cannot publish')})).status,'superseded');assert.equal(attempts,2,'No retry loop');
 const page=fs.readFileSync('pages/index.js','utf8'),body=page.slice(page.indexOf('  async function verifyStopNow('),page.indexOf('  const stopPositionRows='));
 assert(body.includes('collect:wanted=>requestC1StopQuote(wanted,{timeoutMs:Math.max(1,deadline-performance.now())})'));assert(!/fetchHoldingQuotes|fetchStock|refreshC1Account|fetchScreen/.test(body));assert(page.includes('stopVerifying[sym(held)]'));assert(page.includes('role="status">{stopVerificationStatus[sym(held)]'));
 console.log('PASS: quote-only handler, strict provenance, bounded fetch/body, independent holdings, visible retry status; no live I/O.');
})().catch(error=>{console.error(error);process.exitCode=1;});
