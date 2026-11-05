// Execute the production App fetch boundary with controlled clocks and streams.
// No account, provider or network access; source override proves the old failure.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const app=fs.readFileSync(process.env.C1_BOUNDED_APP_SOURCE||'pages/_app.js','utf8');
const source=app.slice(app.indexOf('const CANONICAL_HOST='),app.indexOf('export default function App('));
const {observeC1ClientMutation}=createResearchModuleLoader().load('lib/c1ClientRelease.js');
const {parseTop5Response}=createResearchModuleLoader().load('lib/top5Response.js');
const ticks=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(nativeFetch){
 const timers=new Map(),requests=[],outcomes=[];let serial=0;
 const window={location:{href:'https://screener-app-cq5t.vercel.app/',origin:'https://screener-app-cq5t.vercel.app'},
  localStorage:{getItem:()=>null,setItem(){throw Error('No cache write expected');}},dispatchEvent(){},
  __c1ClientReleaseGuard:{beginMutation:()=>value=>outcomes.push(value)},
  fetch:(url,options)=>{requests.push({url,options});return nativeFetch(url,options);}};
 const context={window,URL,URLSearchParams,Response,AbortController,DOMException,Date,parseTop5Response,observeC1ClientMutation,
  setTimeout:(callback,ms)=>{const id=++serial;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(source,context);
 return {fetch:window.fetch,timers,requests,outcomes,fire(ms){const timer=[...timers.values()].find(t=>t.ms===ms);assert(timer,'Missing active '+ms+'ms deadline');timer.callback();}};
}
async function main(){
 let complete;
 const headers=fixture(()=>new Promise(resolve=>{complete=resolve;}));
 let result='pending';const request=headers.fetch('/api/c1-account',{method:'POST',body:'synthetic'}).then(()=>{result='success';},error=>{result=error;});
 await ticks();try{headers.fire(90000);}catch(error){complete(new Response('{}'));await request;throw error;}await ticks();
 assert.equal(result.code,'FINANCIAL_REQUEST_UNCONFIRMED');assert.match(result.message,/result is unconfirmed/);
 assert.equal(headers.requests.length,1);assert.equal(headers.requests[0].options.signal,undefined,'Expiry does not abort an uncertain write');
 complete(new Response('{}'));await request;await ticks();assert.equal(result.code,'FINANCIAL_REQUEST_UNCONFIRMED','Late headers cannot publish a successful old result');
 assert(headers.outcomes.some(value=>value.unconfirmed),'Loaded-client guard retains uncertainty');

 let completeBody;
 const financialBody=fixture(()=>Promise.resolve(new Response(new ReadableStream({start(controller){completeBody=controller;}}))));
 const financialResponse=await financialBody.fetch('/api/portfolio-sync',{method:'PUT',body:'synthetic'});
 let bodyResult='pending';const readFinancial=financialResponse.json().then(()=>{bodyResult='success';},error=>{bodyResult=error;});
 await ticks();financialBody.fire(90000);await readFinancial;assert.equal(bodyResult.code,'FINANCIAL_REQUEST_UNCONFIRMED');
 assert.equal(financialBody.requests.length,1);assert.equal(financialBody.requests[0].options.signal,undefined);
 completeBody.enqueue(new TextEncoder().encode('{}'));completeBody.close();await ticks();assert.equal(bodyResult.code,'FINANCIAL_REQUEST_UNCONFIRMED','Late direct form body cannot publish after expiry');

 for(const [route,status,budget]of [['/api/portfolio-sync',200,15000],['/api/performance',503,15000],['/api',200,15000],['/api/c1-account',200,90000],['/api/top5',503,90000]]){
  let body,signal;const read=fixture((url,options)=>{signal=options.signal;
   const stream=new ReadableStream({start(controller){body=controller;controller.enqueue(new TextEncoder().encode('{"synthetic":'));}});
   signal.addEventListener('abort',()=>body.error(signal.reason),{once:true});
   return Promise.resolve(new Response(stream,{status}));});
  let outcome='pending';const pending=read.fetch(route).then(response=>response.text()).then(()=>{outcome='success';},error=>{outcome=error;});
  // Response.arrayBuffer() is still pending even though headers returned.
  await new Promise(resolve=>setImmediate(resolve));
  read.fire(budget);await pending;assert.match(outcome.message,/timed out/);assert(signal.aborted);
  assert.equal(read.requests.length,1);assert.equal(read.timers.size,0);
 }
 for(const status of [200,401,409,503]){
  const body='{"synthetic":"bytes preserved"}';const ready=fixture(()=>Promise.resolve(new Response(body,{status,headers:{'x-c1-request-id':'0123456789'}})));
  const response=await ready.fetch('/api/portfolio-sync');assert.equal(response.status,status);assert.equal(response.headers.get('x-c1-request-id'),'0123456789');assert.equal(await response.text(),body);assert.equal(ready.timers.size,0);
 }
 const empty=fixture(()=>Promise.resolve(new Response(null,{status:204})));
 assert.equal((await empty.fetch('/api/performance')).status,204);
 console.log('PASS: real App bounds API bodies and uncertain financial headers, ignores late headers, preserves response bytes/status/identity, and never retries or aborts a financial write.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
