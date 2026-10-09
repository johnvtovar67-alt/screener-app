const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {parseTop5Response,readTop5Response}=createResearchModuleLoader(process.cwd()).load('lib/top5Response.js');
const app=fs.readFileSync('pages/_app.js','utf8'),page=fs.readFileSync('pages/index.js','utf8');
const appBoundary=app.slice(app.indexOf('const CANONICAL_HOST='),app.indexOf('export default function App('));
const screenBoundary=page.slice(page.indexOf('  function screenHealth('),page.indexOf('  async function fetchStock('));
const actionBoundary=page.slice(page.indexOf('const act=s=>'),page.indexOf('\nfunction dataQualityBlocked('));
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const snapshot={stocks:[{symbol:'AAA',price:100,finalDecision:{action:'Buy'},recommendation:{label:'Buy'}}],meta:{quoteFeedStatus:'live',snapshotAsOf:'2026-10-08T20:00:00Z'},themeLeadership:[]};
const request='/api/top5?theme=opportunities&compact=1&verificationPass=';
function fetchBoundary(responses,initialCache=[]){
 const storage=new Map(initialCache),writes=[],notices=[],requests=[];
 const window={location:{href:'https://screener-app-cq5t.vercel.app/',origin:'https://screener-app-cq5t.vercel.app'},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{writes.push({key,value});storage.set(key,value);}},
  dispatchEvent:event=>notices.push(event.detail),
  fetch:async(input,options)=>{requests.push({input,options});assert.ok(responses.length,'Unexpected extra request');const response=responses.shift();if(response instanceof Error)throw response;return response;}};
 const box={window,URL,URLSearchParams,Response,AbortController,DOMException,Date,setTimeout,clearTimeout,parseTop5Response,
  CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}}};
 vm.createContext(box);vm.runInContext(appBoundary,box);
 return {fetch:window.fetch,storage,writes,notices,requests};
}
function screenUI(fetch,priorRows=snapshot.stocks){
 const state={stocks:priorRows,feedHealth:{status:'healthy'},error:'',reloading:false,historyReads:0};
 const set=(name,value)=>{state[name]=typeof value==='function'?value(state[name]):value;};
 const box={fetch,readTop5Response,accountView:null,Date,setTimeout:callback=>{callback();return 0;},
  performanceHistory:async()=>{state.historyReads++;return {records:[],available:true};},
  signalPersistence:()=>({}),sym:row=>row.symbol,CASH:['CASH'],specialSituation:()=>null,fd:row=>row.finalDecision,
  refreshC1Account:async()=>null,prepareC1Execution:()=>{throw new Error('No account to prepare');},
  setReloading:value=>set('reloading',value),setErr:value=>set('error',value),setStocks:value=>set('stocks',value),
  setFeedHealth:value=>set('feedHealth',value),setThemeStocks:value=>set('themeStocks',value),setThemeFeedHealth:value=>set('themeFeedHealth',value),
  setMarketScope:value=>set('marketScope',value),setMarketRadar:value=>set('marketRadar',value),setLastUpdated:value=>set('lastUpdated',value)};
 vm.createContext(box);vm.runInContext(screenBoundary+'\n'+actionBoundary+'\nthis.ui={load,fetchScreen,act};',box);
 return {...box.ui,state};
}
async function main(){
 for(const [status,body,expected] of [
  [504,'An error occurred: FUNCTION_INVOCATION_TIMEOUT',/Broad screen update timed out/],
  [504,'<!doctype html><h1>Gateway Timeout</h1>',/Broad screen update timed out/],
  [502,'<html>Bad Gateway</html>',/temporarily unavailable/],
  [200,'<html>Upstream error</html>',/temporarily unavailable/],
  [200,'{"stocks":',/temporarily unavailable/],
  [200,'null',/temporarily unavailable/],
  [200,'[]',/temporarily unavailable/],
  [200,'{}',/temporarily unavailable/],
  [200,'{"stocks":[]}',/temporarily unavailable/],
  [200,'{"meta":{}}',/temporarily unavailable/],
  [200,'{"stocks":{},"meta":{}}',/temporarily unavailable/],
  [200,'{"stocks":[],"meta":null}',/temporarily unavailable/],
  [200,'{"stocks":[],"meta":[]}',/temporarily unavailable/]
 ]){
  await assert.rejects(readTop5Response(new Response(body,{status})),error=>{
   assert.match(error.message,expected);assert.match(error.message,/Existing portfolio analysis remains available; new capital is paused until refresh succeeds\./);assert.doesNotMatch(error.message,/Unexpected token|FUNCTION_INVOCATION_TIMEOUT|<html|DOCTYPE|JSON/i);return true;
  });
 }
 await assert.rejects(readTop5Response(json({error:'Screen provider unavailable.'},503)),/Screen provider unavailable\./);
 await assert.rejects(readTop5Response(json({error:'short',detail:'Existing detailed API error.'},503)),/Existing detailed API error\./);
 await assert.rejects(readTop5Response(json({},504)),/Broad screen update timed out/);
 await assert.rejects(readTop5Response({ok:true,status:200,text:async()=>{throw new Error('Body stream interrupted');}}),/temporarily unavailable/);
 assert.deepEqual(await readTop5Response(json(snapshot)),snapshot,'Valid screen JSON is unchanged');
 assert.deepEqual(parseTop5Response(JSON.stringify(snapshot)),snapshot);
 assert.deepEqual(await readTop5Response(json({stocks:[],meta:{}})),{stocks:[],meta:{}},'An empty but complete screen payload remains valid');

 const live=fetchBoundary([json(snapshot)]),liveUI=screenUI(live.fetch,[]);
 await liveUI.load('opportunities');
 assert.equal(liveUI.state.historyReads,1,'Persistence history is read after a valid screen');
 assert.equal(liveUI.state.feedHealth.status,'healthy');assert.equal(liveUI.act(liveUI.state.stocks[0]),'Buy');
 assert.equal(liveUI.state.stocks[0].clientSnapshotFallback,false);assert.equal(live.writes.length,1);

 for(const failedResponse of [new Response('FUNCTION_INVOCATION_TIMEOUT',{status:504}),new Response('<html>Bad upstream response</html>',{status:200}),new Response('{"stocks":',{status:200}),json({}),json({stocks:[]}),json({meta:{}})]){
  const boundary=fetchBoundary([json(snapshot),failedResponse]);
  await boundary.fetch(request+'0');
  const priorCache=[...boundary.storage.values()][0],ui=screenUI(boundary.fetch);
  await ui.load('opportunities',1);
  assert.equal(boundary.writes.length,1,'Failure cannot overwrite the previous valid cached body');
  assert.equal([...boundary.storage.values()][0],priorCache);
  assert.equal(boundary.requests.length,2,'One verification request follows the initial screen');
  assert.equal(ui.state.error,'');assert.equal(ui.state.feedHealth.status,'stale');
  assert.equal(ui.state.stocks[0].symbol,'AAA');assert.equal(ui.state.stocks[0].finalDecision.action,'Buy','Prior analysis remains intact for continuity');
  assert.equal(ui.state.stocks[0].clientSnapshotFallback,true);assert.equal(ui.state.stocks[0].dataFeedSnapshotStale,true);
  assert.equal(ui.act(ui.state.stocks[0]),'Watch','The existing action gate pauses fresh Buy capital on the fallback');
  assert.ok(boundary.notices.some(message=>message.includes('no fresh-capital action may use it.')));
 }

 const noCache=fetchBoundary([new Response('FUNCTION_INVOCATION_TIMEOUT',{status:504})]),failedUI=screenUI(noCache.fetch);
 await failedUI.load('opportunities');
 assert.equal(failedUI.state.error,'Broad screen update timed out. Existing portfolio analysis remains available; new capital is paused until refresh succeeds.');assert.doesNotMatch(failedUI.state.error,/Unexpected token|FUNCTION_INVOCATION_TIMEOUT/);
 assert.equal(failedUI.state.historyReads,0,'A failed response cannot reach persistence history or screen decoration');
 assert.equal(failedUI.state.reloading,false);assert.equal(failedUI.state.feedHealth.status,'unavailable');
 assert.equal(failedUI.state.stocks[0].symbol,'AAA');assert.equal(failedUI.state.stocks[0].finalDecision.action,'Buy');
 assert.equal(failedUI.act(failedUI.state.stocks[0]),'Watch','The existing failure path pauses prior Buy capital');
 assert.equal(noCache.writes.length,0);
 const incomplete=fetchBoundary([json({})]),incompleteUI=screenUI(incomplete.fetch);
 await incompleteUI.load('opportunities');
 assert.match(incompleteUI.state.error,/Broad screen update is temporarily unavailable/);
 assert.equal(incompleteUI.state.historyReads,0);assert.equal(incompleteUI.state.feedHealth.status,'unavailable');
 assert.equal(incompleteUI.state.stocks[0].symbol,'AAA','A missing screen contract must not erase prior analysis as a successful empty screen');
 assert.equal(incompleteUI.act(incompleteUI.state.stocks[0]),'Watch');assert.equal(incomplete.writes.length,0);

 const cacheKey='screener_top5_response_v2:/api/top5?theme=opportunities&compact=1';
 for(const cached of [{ts:Date.now(),body:'<html>Old invalid response</html>'},{ts:Date.now(),body:'{}'},{ts:Date.now()-31*60*1000,body:JSON.stringify(snapshot)}]){
  const boundary=fetchBoundary([new Response('<html>Gateway Timeout</html>',{status:504})],[[cacheKey,JSON.stringify(cached)]]);
  const response=await boundary.fetch(request+'1');
  assert.equal(response.status,504,'Invalid or expired cache entries cannot become a successful fallback');
  await assert.rejects(readTop5Response(response),/Broad screen update timed out/);assert.equal(boundary.writes.length,0);
 }
 const account=fetchBoundary([new Response('Existing account error',{status:504})]);
 const accountResponse=await account.fetch('/api/c1-account');
 assert.equal(accountResponse.status,504);assert.equal(await accountResponse.text(),'Existing account error');assert.equal(account.writes.length,0,'Only top5 handling changes');
 console.log('TOP5 RESPONSE PASS: text/HTML timeouts and malformed JSON show operational errors; valid JSON/API errors remain intact; failed refreshes preserve prior analysis and keep fresh capital paused.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
