// Actual Home orchestration + actual account response boundary and frame module.
// Deferred synthetic HTTP replies reproduce mixed-generation UI publication.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const babel=require('next/dist/compiled/babel/core'),{createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),page=fs.readFileSync('pages/index.js','utf8');
const ast=babel.parseSync(page,{sourceType:'module',babelrc:false,configFile:false,parserOpts:{plugins:['jsx']}});
const home=ast.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration;
const names=['publishC1AccountState','refreshC1Account','prepareC1Execution','load','analyze'];
const code=names.map(name=>{const n=home.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n);return page.slice(n.start,n.end);}).join('\n');
const clone=x=>JSON.parse(JSON.stringify(x)),tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const account=tag=>({decision:{contract:'c1-account-decision-v1',decisionId:tag+':1',revision:1,current:true,positions:[],stockScreen:{candidates:[]}}});
function harness({opening,accountReply,screenFailure=false}={}){
 const state={account:account('PRIOR'),stocks:[{symbol:'PRIOR'}],results:[{symbol:'AAA',price:90}],verified:true,health:{status:'healthy'},busy:false,error:'',publications:[],portfolio:[],writes:[]};
 Object.defineProperty(state,'busy',{enumerable:true,get:()=>Boolean(state.loading||state.reloading)});
 const calls=[],now='2026-11-02T15:00:00Z',holdings=[{symbol:'AAA',shares:2,avgCost:90,role:'Swing'}];
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return Date.parse(now);}}
 const box={...loader.load('lib/c1RefreshFrame.js'),...loader.load('lib/c1RefreshResponse.js'),...loader.load('lib/c1JourneyClient.js'),
  Object,Date:Clock,Promise,Map,Set,console,accountRequestId:{current:0},screenRequestId:{current:0},SYNC_KEY:'key',KEY:'portfolio',C1_DRAWDOWN_KEY:'capital',
  localStorage:{getItem:key=>key==='key'?'offline_fixture_key_000001':'[]',setItem:(...args)=>state.writes.push(args)},
  portfolio:holdings,results:state.results,syncKey:'',CASH:['CASH'],setPortfolio:v=>{state.portfolio=v;},
  setAccountView:v=>{state.account=v;state.publications.push('account');},setAccountAbsent(){},setAccountError(){},setAccountResponseVerified:v=>state.verified=v,
  setReloading:v=>state.reloading=v,setLoading:v=>state.loading=v,setErr:v=>state.error=v,setApplicationRefreshAt:v=>state.completed=v,
  setResults:v=>{state.results=typeof v==='function'?v(state.results):v;state.publications.push('quotes');},setStocks:v=>{state.stocks=typeof v==='function'?v(state.stocks):v;state.publications.push('screen');},
  setFeedHealth:v=>state.health=typeof v==='function'?v(state.health):v,setMarketScope(){},setMarketRadar(){},setThemeStocks(){},setThemeFeedHealth(){},setLastUpdated(){},setPortfolioAnalyzedAt(){},setAnalysisCapitalReady(){},setHoldingsComparison(){},setC1Control(){},
  setTimeout:fn=>{queueMicrotask(fn);return 1;},sym:p=>p.symbol,role:()=> 'Swing',holdingQuoteRow:(p,q)=>({...p,...q,value:p.shares*q.price}),
  screenHealth:()=>({status:'healthy'}),pausePriorRows:rows=>rows.map(row=>({...row,clientSnapshotFallback:true})),signalPersistence:()=>({}),act:()=> 'Watch',rank:()=>0,capitalScore:()=>0,rotationTargetEligible:()=>false,capitalSignalEligible:()=>({pass:false}),compareC1Holdings:()=>({}),
  fetchHoldingQuotes:async()=>new Map([['AAA',{symbol:'AAA',price:110}]]),
  fetchScreen:async()=>{calls.push('screen');if(screenFailure)throw Error('Synthetic screen outage');return {stocks:[{symbol:'CURRENT',price:110}],performance:{records:[]},meta:{snapshotAsOf:now,quoteFeedStatus:'live'}};},
  fetch:async(url,options={})=>{
   if(url==='/api/entry-timing?symbols=AAA')return new Response(JSON.stringify({timing:{AAA:{available:true}}}));
   assert.equal(url,'/api/c1-account');const operation=options.body?JSON.parse(options.body).operation:'GET';calls.push(operation);
   let body;
   if(operation==='prepare-execution'){if(opening)await opening.promise;body={...account('CURRENT'),executionDecision:account('CURRENT').decision,openingPlan:{id:'checked'}};}
   else if(accountReply)body=await accountReply.promise;
   else body=account('CURRENT');
   return body instanceof Response?body:new Response(JSON.stringify(body));
  }};
 vm.createContext(box);vm.runInContext(code+';this.api={load,analyze};',box);return {box,state,calls,...box.api};
}
(async()=>{
 let cases=0;
 for(const kind of ['load','analyze'])for(const screenFailure of [false,true]){
  const opening=deferred(),h=harness({opening,screenFailure}),before=clone(h.state);
  const pending=kind==='load'?h.load('opportunities'):h.analyze();await tick();await tick();
  assert(h.calls.includes('screen'));assert(h.calls.includes('prepare-execution'));
  assert.deepEqual(h.state.account,before.account,'Completed account response waits for its opening/screen/quote frame');
  assert.deepEqual(h.state.results,before.results,'Current quotes do not leak into a prior account frame');
  assert.deepEqual(h.state.stocks,before.stocks,'Current or failed screen display waits for its opening review');
  assert.equal(h.state.verified,false,'Prior quantities lose authority immediately');assert.equal(h.state.busy,true);assert.deepEqual(h.state.publications,[]);
  opening.resolve();await pending;
  assert.equal(h.state.account.decision.decisionId,'CURRENT:1');assert.equal(h.state.account.openingPlan.id,'checked');assert.equal(h.state.results[0].price,110);
  assert.equal(h.state.stocks[0].symbol,screenFailure?'PRIOR':'CURRENT');assert.equal(h.state.busy,false);assert.equal(h.state.verified,true);
  assert.deepEqual(h.state.writes,[],'View publication cannot create financial history');assert.equal(h.calls.filter(c=>c==='prepare-execution').length,1);cases++;
 }
 // An explicit newer account operation can supersede a screen's account owner
 // without starting another screen. The completed old frame cannot overwrite it.
 for(const kind of ['load','analyze']){
  const opening=deferred(),h=harness({opening}),pending=kind==='load'?h.load('opportunities'):h.analyze();await tick();await tick();
  h.box.accountRequestId.current++;h.state.account=account('NEWER_SAVED');const publications=h.state.publications.length;
  opening.resolve();await pending;assert.equal(h.state.account.decision.decisionId,'NEWER_SAVED:1');assert.equal(h.state.publications.length,publications);assert.equal(h.state.stocks[0].symbol,'PRIOR');cases++;
 }
 // Authoritative missing/authentication replies and an interrupted response
 // remain distinct, and none is converted to an implicit account retry.
 for(const [status,body,expected]of [[404,{},null],[401,{error:'Rejected'},null],[503,{error:'Unavailable'},'PRIOR:1']]){
  const accountReply=deferred(),h=harness({accountReply}),pending=h.load('opportunities');await tick();accountReply.resolve(new Response(JSON.stringify(body),{status}));await pending;
  assert.equal(h.state.account?.decision?.decisionId||null,expected);assert.equal(h.calls.filter(c=>c==='GET').length,1);assert.equal(h.state.verified,false);cases++;
 }
 const seen=[],frame=loader.load('lib/c1RefreshFrame.js').createC1RefreshFrame(()=>true),write=frame.defer(v=>seen.push(v));write(1);write(2);assert.deepEqual(seen,[]);assert(frame.publish());assert.deepEqual(seen,[1,2]);write(3);assert.equal(frame.publish(),false);assert.deepEqual(seen,[1,2]);
 console.log('PASS: '+cases+' actual Home account/screen/quote/opening publication cases; prior display retained until settlement, financial ownership wins, missing/auth failures distinct, no financial writes or mutation retries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
