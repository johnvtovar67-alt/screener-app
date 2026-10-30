// Exact Home orchestration against deferred synthetic stage replies; no live I/O.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const babel=require('next/dist/compiled/babel/core');
const {createC1RefreshFrame}=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd()).load('lib/c1RefreshFrame.js');
const current=fs.readFileSync('pages/index.js','utf8'),original=require('./c1-refresh-generation-ui-seams.cjs').restore(current);
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
assert.equal(blob(original),'d5db3a39a67600a15b71c0fdea9e0a06afb1df26','Exact whole deployed PR333 Home restored before prior/current comparisons');
const clone=v=>JSON.parse(JSON.stringify(v)),tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const at='2026-10-15T17:00:00.000Z',positions=[{symbol:'AAA',shares:2,avgCost:90,role:'Swing'}];
const payload=(marker='CURRENT')=>({stocks:[{symbol:marker,action:'Watch',price:100}],performance:{records:[],available:true},meta:{quoteFeedStatus:'live',fundamentalFeedStatus:'healthy',snapshotAsOf:at}});
function functions(source){const ast=babel.parseSync(source,{sourceType:'module',babelrc:false,configFile:false,parserOpts:{plugins:['jsx']}});const home=ast.program.body.find(n=>n.type==='ExportDefaultDeclaration').declaration;return ['load','analyze','handleReload'].map(name=>{const n=home.body.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(n);return source.slice(n.start,n.end);}).join('\n');}
function harness(source,{services={},portfolio=[],tab='opportunities'}={}){
 const state={stocks:[],results:[],feedHealth:{status:'healthy'},marketScope:null,marketRadar:[],lastUpdated:null,applicationRefreshAt:null,reloading:false,loading:false,error:'',analysisCapitalReady:false,holdingsComparison:null,portfolioAnalyzedAt:null,quoteRefreshStatus:''};
 const calls=[],clock=[],timers=[],indices={};
 const invoke=async(name,args,fallback)=>{const index=indices[name]||0;indices[name]=index+1;calls.push({name,index,args:clone(args)});const value=services[name]?.[index];if(value instanceof Error)throw value;return value===undefined?fallback:await (typeof value==='function'?value():value);};
 class Clock extends Date{constructor(...args){clock.push(['new',args]);super(...(args.length?args:[at]));}static now(){clock.push(['now']);return Date.parse(at);}}
 const setters={setReloading:'reloading',setLoading:'loading',setErr:'error',setResults:'results',setStocks:'stocks',setFeedHealth:'feedHealth',setMarketScope:'marketScope',setMarketRadar:'marketRadar',setLastUpdated:'lastUpdated',setApplicationRefreshAt:'applicationRefreshAt',setAnalysisCapitalReady:'analysisCapitalReady',setHoldingsComparison:'holdingsComparison',setPortfolioAnalyzedAt:'portfolioAnalyzedAt',setQuoteRefreshStatus:'quoteRefreshStatus'};
 const box={createC1RefreshFrame,accountRequestId:{current:0},publishC1AccountState(){},setPortfolio(){},setC1Control(){},Date:Clock,Promise,Map,Set,console,portfolio,results:[],tab,selectedTheme:'ai_compute',syncKey:'',screenRequestId:{current:0},manualVerificationPass:{current:0},CASH:['CASH'],
  setTimeout:fn=>{timers.push('minimum-loading-delay');queueMicrotask(fn);},
  screenHealth:()=>({status:'healthy'}),pausePriorRows:rows=>rows.map(row=>({...row,clientSnapshotFallback:true,dataFeedSnapshotStale:true})),
  sym:r=>r.symbol,act:r=>r.action,rank:()=>0,capitalScore:()=>0,signalPersistence:()=>({}),rotationTargetEligible:()=>false,capitalSignalEligible:()=>({pass:false}),role:()=> 'Swing',compareC1Holdings:()=>({status:'fixture'}),
  holdingQuoteRow:(p,q)=>({...p,...q,value:Number(p.shares)*Number(q?.price||0)}),
  refreshC1Account:async body=>invoke('account',[body||null],{decision:{current:true,stockScreen:{candidates:[]}}}),
  prepareC1Execution:async view=>invoke('opening',[view],undefined),
  fetchScreen:async(...args)=>invoke('screen',args,payload()),
  fetchHoldingQuotes:async(held,force,prior,options={})=>{const rows=await invoke('quotes',[held,force],new Map(held.map(p=>[p.symbol,{symbol:p.symbol,price:100}])));if(!options.isCurrent||options.isCurrent())box.setQuoteRefreshStatus('quotes-complete');return rows;},
  fetch:async()=>({ok:true,json:async()=>invoke('timing',[],{timing:{AAA:{available:true}}})}),
  refreshEnteredPortfolio:async()=>invoke('cloud',[],portfolio),
  localStorage:{getItem:()=> '{}',setItem(){throw Error('Unexpected legacy persistence');}},
  recoverC1Account:()=>invoke('account-tools',[],null),check:()=>invoke('single',[],null),setThemeStocks(){},setThemeFeedHealth(){}};
 for(const [fn,key] of Object.entries(setters))box[fn]=value=>{state[key]=typeof value==='function'?value(state[key]):value;};
 vm.createContext(box);vm.runInContext(functions(source)+';this.api={load,analyze,handleReload};',box);
 return {state,calls,clock,timers,box,...box.api};
}
async function overlap(source,olderKind,newerKind,{oldFailure=false,quoteLate=false}={}){
 const old=deferred(),next=deferred(),oldQuote=deferred();
 const services={screen:[old.promise,next.promise],...(quoteLate?{quotes:[oldQuote.promise,new Map([['AAA',{symbol:'AAA',price:110}]])]}:{})};
 const h=harness(source,{services,portfolio:quoteLate?positions:[]});
 const a=olderKind==='load'?h.load('opportunities'):h.analyze(h.box.portfolio);await tick();
 const b=newerKind==='load'?h.load('opportunities'):h.analyze(h.box.portfolio);await tick();
 next.resolve(payload('NEWER'));await b;
 const after=clone(h.state);
 if(oldFailure)old.reject(Error('Older provider outage'));else old.resolve(payload('OLDER'));
 if(quoteLate)oldQuote.resolve(new Map([['AAA',{symbol:'AAA',price:80}]]));
 await a;return {state:clone(h.state),after};
}
(async()=>{
 let parity=0,races=0;
 for(const kind of ['load','analyze'])for(const held of [[],positions])for(const failure of [null,'screen','account']){
  const services=failure?{[failure]:[Error('Synthetic stage outage')]}:{};
  // All accepted response/state/request/clock outcomes outside reproduced races
  // remain exact, with finance functions deliberately held fixed to isolate I/O ownership.
  const a=harness(original,{services,portfolio:held}),b=harness(current,{services,portfolio:held});
  await (kind==='load'?a.load('opportunities'):a.analyze(held));await (kind==='load'?b.load('opportunities'):b.analyze(held));
  assert.deepEqual(clone(b.state),clone(a.state),'Uncontended complete state parity');assert.deepEqual(b.calls,a.calls,'Same requests/start order/arguments');assert.deepEqual(b.clock,a.clock,'Same source/application clock reads');assert.deepEqual(b.timers,a.timers);parity++;
 }
 for(const [a,b] of [['load','analyze'],['analyze','load'],['analyze','analyze']])for(const options of [{},{oldFailure:true},{quoteLate:true}]){
  const before=await overlap(original,a,b,options),after=await overlap(current,a,b,options);
  assert.deepEqual(after.state,after.after,'Old screen/error/quote/finalizer cannot replace later state');
  if(a==='load'&&b==='analyze'&&!options.oldFailure)assert.notDeepEqual(before.state,before.after,'Immutable prior source reproduces stale result publication');
  races++;
 }
 // A superseded finalizer must not clear the newer request's busy state.
 for(const [olderKind,newerKind] of [['analyze','analyze'],['analyze','load'],['load','analyze']]){
  const a=deferred(),b=deferred(),h=harness(current,{services:{screen:[a.promise,b.promise]}});
  const first=olderKind==='load'?h.load('opportunities'):h.analyze([]);await tick();const second=newerKind==='load'?h.load('opportunities'):h.analyze([]);await tick();
  a.resolve(payload('OLDER'));await first;assert.equal(h.state[newerKind==='load'?'reloading':'loading'],true);b.resolve(payload('NEWER'));await second;assert.equal(h.state.reloading||h.state.loading,false);races++;
 }
 // A slower earlier cloud read cannot become a new refresh after a later tab analysis.
 for(const source of [original,current]){
  const cloud=deferred(),h=harness(source,{services:{cloud:[cloud.promise],screen:[payload('NEWER'),payload('OLDER')]}});
  const earlier=h.handleReload();await tick();await h.analyze([]);const after=clone(h.state),count=h.calls.length;cloud.resolve([]);await earlier;
  if(source===original)assert.equal(h.state.stocks[0].symbol,'OLDER','Reproduce stale cloud-preflight intent restart');else{assert.deepEqual(clone(h.state),after);assert.equal(h.calls.length,count,'Obsolete intent performs no subsequent screen/account request');}races++;
 }
 // Late account reads/committed input updates and held-timing parses are also
 // fenced before downstream publication; already completed server work survives.
 for(const stage of ['account','timing']){
  const old=deferred();let committed=0;
  const settings=stage==='account'?{account:[async()=>{const value=await old.promise;committed++;return value;}]}:{timing:[old.promise]};
  const h=harness(current,{services:settings,portfolio:stage==='timing'?positions:[]});
  const earlier=h.analyze(h.box.portfolio);await tick();await h.load('opportunities');const after=clone(h.state);
  old.resolve(stage==='account'?{decision:{current:true,stockScreen:{candidates:[]}}}:{timing:{AAA:{available:true}}});await earlier;
  assert.deepEqual(clone(h.state),after,'Superseded '+stage+' cannot publish or clear newer completion');
  if(stage==='account'){assert.equal(committed,1,'Client discarding a stale view does not undo/abort an already committed server operation');assert.equal(h.calls.filter(c=>c.name==='account').length,2,'One request per explicit analysis/read, no mutation retry');}races++;
 }
 // Two explicit Reload intents may overlap during cloud preflight; only the
 // later one can begin account/screen work after its cloud read resolves.
 {
  const a=deferred(),b=deferred(),h=harness(current,{services:{cloud:[a.promise,b.promise]}});
  const first=h.handleReload();await tick();const second=h.handleReload();await tick();b.resolve([]);await second;const after=clone(h.state),count=h.calls.length;a.resolve([]);await first;
  assert.deepEqual(clone(h.state),after);assert.equal(h.calls.length,count);assert.equal(h.calls.filter(c=>c.name==='screen').length,1);races++;
 }
 // Failure without an App cache still preserves the currently verified React
 // rows for display, but marks them stale and excludes them from analysis inputs.
 for(const source of [original,current]){
  const h=harness(source,{services:{screen:[Error('Synthetic broad screen outage'),payload('RECOVERED')]}});
  const retained={symbol:'VERIFIED',action:'Buy',price:123,privateFixture:'retained-only'};h.state.stocks=[clone(retained)];await h.analyze([]);
  if(source===original)assert.equal(h.state.stocks.length,0,'Prior Portfolio code erased verified rows when acquisition failed');else{
   assert.deepEqual(clone(h.state.stocks),[{...retained,clientSnapshotFallback:true,dataFeedSnapshotStale:true}]);
   assert.equal(h.state.analysisCapitalReady,false);assert.equal(h.state.results.length,0,'Retained display evidence is never reused as acquired portfolio inputs');
  }
  await h.analyze([]);assert.equal(h.state.stocks[0].symbol,'RECOVERED');assert(!h.state.stocks[0].clientSnapshotFallback);races++;
 }
 // Other existing Reload branches inherit ownership without leaving stale
 // analysis/reloading booleans stuck after their superseded finalizer is fenced.
 for(const tab of ['account-tools','single']){
  const h=harness(current,{tab});h.state.loading=true;h.state.reloading=true;await h.handleReload();
  assert.equal(h.state.loading||h.state.reloading,false);assert(h.calls.some(c=>c.name===tab));races++;
 }
 // Portfolio completion now awaits its already-started opening review, like Opportunities.
 for(const source of [original,current]){
  const opening=deferred(),h=harness(source,{services:{opening:[opening.promise]}});let done=false;const task=h.analyze([]).then(()=>{done=true;});await tick();
  assert.equal(done,source===original,'Prior premature settlement reproduced; current request remains pending');if(source===current)assert.equal(h.state.loading,true);opening.resolve();await task;assert.equal(h.state.loading,false);
 }
 console.log(JSON.stringify({status:'PASS',baselineBlob:blob(original),uncontendedFullStateRequestClockComparisons:parity,overlapAndIntentCases:races,openingCompletion:'old-fails/current-passes',productionIO:0,automaticMutationRetries:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
