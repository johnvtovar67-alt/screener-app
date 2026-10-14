// Exercise the actual advisory component with synthetic quotes and account data.
// No browser, network, storage or extra dependencies are required by the full suite.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
require('styled-jsx/style'); // Initialize SSR style registry before browser-event stubs.
function createClock(initial){
 const RealDate=Date,real={setTimeout,clearTimeout,setInterval,clearInterval};
 let now=RealDate.parse(initial),next=0;const timers=new Map();
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 const schedule=(fn,delay,period)=>{const id=++next;timers.set(id,{fn,at:now+Math.max(1,Number(delay)||1),period});return id;};
 global.setTimeout=(fn,delay)=>schedule(fn,delay,0);global.clearTimeout=id=>timers.delete(id);
 global.setInterval=(fn,delay)=>schedule(fn,delay,Math.max(1,Number(delay)||1));global.clearInterval=id=>timers.delete(id);
 return {get now(){return now;},advance(ms,after=()=>{}){const target=now+ms;let count=0;while(true){const entries=[...timers.entries()].filter(([,timer])=>timer.at<=target).sort((a,b)=>a[1].at-b[1].at);if(!entries.length)break;assert.ok(++count<10000,'Timers must not spin');const [id,timer]=entries[0];now=timer.at;if(timer.period)timer.at+=timer.period;else timers.delete(id);timer.fn();after();}now=target;after();},restore(){global.Date=RealDate;Object.assign(global,real);}};
}
function elements(tree,result=[]){
 if(!React.isValidElement(tree))return result;
 result.push(tree);React.Children.forEach(tree.props.children,child=>elements(child,result));return result;
}
function content(tree){
 if(tree==null||typeof tree==='boolean')return '';
 if(typeof tree==='string'||typeof tree==='number')return String(tree);
 if(Array.isArray(tree))return tree.map(content).join('');
 return React.Children.toArray(React.isValidElement(tree)?tree.props.children:tree).map(content).join('');
}
function createHarness(ComponentFactory,initialProps){
 const hooks=[];let cursor=0,dirty=false,tree,props=initialProps,queued=[],mounted=true;
 const slot=initialize=>{const index=cursor++;if(!(index in hooks))hooks[index]=initialize();return index;};
 const changed=(previous,deps)=>!previous||!deps||deps.length!==previous.length||deps.some((value,i)=>!Object.is(value,previous[i]));
 const react={...React,
  useState:initial=>{const index=slot(()=>typeof initial==='function'?initial():initial);return [hooks[index],value=>{assert.ok(mounted,'No state updates after unmount');const next=typeof value==='function'?value(hooks[index]):value;if(!Object.is(next,hooks[index])){hooks[index]=next;dirty=true;}}];},
  useEffect:(effect,deps)=>{const index=cursor++,prior=hooks[index];if(!prior||changed(prior.deps,deps)){hooks[index]={deps,cleanup:prior?.cleanup};queued.push(()=>{prior?.cleanup?.();hooks[index].cleanup=effect();});}},
  useLayoutEffect:(effect,deps)=>react.useEffect(effect,deps),
  useRef:initial=>hooks[slot(()=>({current:initial}))],
  useId:()=>hooks[slot(()=>':intraday-ui-test:')],
  useMemo:(factory,deps)=>{const index=cursor++,prior=hooks[index];if(!prior||changed(prior.deps,deps))hooks[index]={deps,value:factory()};return hooks[index].value;},
  useCallback:(fn,deps)=>react.useMemo(()=>fn,deps),
 };
 const Component=ComponentFactory(react);
 function render(patch={}){assert.ok(mounted);props={...props,...patch};let passes=0;do{assert.ok(++passes<25,'Intraday effects must settle');dirty=false;cursor=0;queued=[];tree=Component(props);while(React.isValidElement(tree)&&typeof tree.type==='function'&&tree.type.name==='C1IntradayAdvisoryView')tree=tree.type(tree.props);for(const effect of queued)effect();}while(dirty);return tree;}
 render();return {render,get tree(){return tree;},get html(){return renderToStaticMarkup(tree);},get text(){return content(tree);},unmount(){for(const hook of hooks)if(hook?.cleanup)hook.cleanup();mounted=false;}};
}

const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const sourceFile=path.resolve('components/C1IntradayAdvisory.js');
function component(react=React){
 const code=babel.transformSync(fs.readFileSync(sourceFile,'utf8'),{filename:sourceFile,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 const modules=createResearchModuleLoader(process.cwd()),record={exports:{}};
 new Function('require','module','exports',code)(name=>name==='react'?react:name.startsWith('../lib/')?modules.load(name,sourceFile):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 return record.exports.default;
}
const fixture={
 decision:{contract:'c1-account-decision-v1',decisionId:'synthetic:2',revision:2,current:true,sourceSessionDate:'2026-10-13',positions:[{symbol:'DELL',shares:10,avgCost:100,openedAt:'2026-09-25',stops:[{sleeve:'base',price:95,shares:10}],reviewRules:[{sleeve:'base',close:100,rankVerified:true}],holdingRank:{base:{rank:2,eligible:true,eligibleCount:100}}}],opportunities:[{symbol:'AAPL'}],stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:'2026-10-13',candidates:[{symbol:'DELL',sector:'Technology',sourcePrice:100,researchRank:2},{symbol:'AAPL',sector:'Healthcare',sourcePrice:100,researchRank:1},{symbol:'MYST',sector:'Future Sector',sourcePrice:100,researchRank:3}]}},
 screenRows:[{symbol:'DELL',sector:'Technology'},{symbol:'AAPL',sector:'Healthcare'},{symbol:'MYST',sector:'Future Sector'}],
 portfolio:[{symbol:'DELL',role:'Swing',shares:10,avgCost:100,openedAt:'2026-09-25'},{symbol:'CASH',role:'Swing',shares:1000,avgCost:1}],accountMatches:true,disabled:false,
};
const observedAt='2026-10-14T16:00:00.000Z';
const quoteSnapshot={contract:'c1-intraday-quotes-v1',receivedAt:observedAt,cacheStatus:'live',quotes:[
 {symbol:'DELL',price:98,open:101,previousClose:100,dayHigh:102,dayLow:97},
 {symbol:'AAPL',price:103,open:100,previousClose:100,dayHigh:104,dayLow:99},
 {symbol:'MYST',price:106,open:104,previousClose:100,dayHigh:107,dayLow:102},
 {symbol:'SPY',price:101,open:100,previousClose:100},
 {symbol:'QQQ',price:102,open:100,previousClose:100},
 {symbol:'XLK',price:101.5,open:100,previousClose:100},
 {symbol:'XLV',price:99.4,open:100,previousClose:100},
 ].map(quote=>({...quote,timestamp:Date.parse(observedAt)/1000}))};

const snapshot=patch=>({...quoteSnapshot,...patch});
const response=(body=quoteSnapshot,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function refreshButton(harness){
 const matches=elements(harness.tree).filter(node=>node.type==='button'&&/refresh intraday|checking observations/i.test(content(node)));
 assert.equal(matches.length,1,'Advisory has exactly one manual quote refresh button');return matches[0];
}
function mockRequests(){
 const calls=[];
 global.fetch=(url,options={})=>{const pending=deferred();calls.push({url,options,...pending});return pending.promise;};
 return calls;
}
async function resolveRefresh(harness,calls,body=quoteSnapshot,status=200){
 const task=refreshButton(harness).props.onClick();harness.render();
 const call=calls.at(-1);assert.ok(call,'Explicit refresh requests quotes');call.resolve(response(body,status));
 await task;await flush();harness.render();return call;
}

function eventTarget(){
 const listeners=new Map();
 return {addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener);},removeEventListener(type,listener){listeners.get(type)?.delete(listener);},dispatch(type){for(const listener of listeners.get(type)||[])listener();},get count(){return [...listeners.values()].reduce((total,set)=>total+set.size,0);}};
}
async function main(){
 const original={fetch:global.fetch,window:global.window,document:global.document};
 const clock=createClock(observedAt),windowEvents=eventTarget(),documentEvents=eventTarget(),active=[];
 const forbidStorage=new Proxy({}, {get(){throw new Error('Advisory must not read or write browser storage');}});
 global.window={...windowEvents,localStorage:forbidStorage,sessionStorage:forbidStorage};global.document={...documentEvents};
 try{
  const calls=mockRequests();
  const Component=component();
  const ssr=renderToStaticMarkup(React.createElement(Component,fixture));
  assert.equal(calls.length,0,'Server rendering does not request observations');
  assert.match(ssr,/No intraday quotes are fetched until you refresh/);
  assert.match(ssr,/2026-10-13/,'The accepted daily source date is always visible');
  assert.doesNotMatch(ssr,/\$98\.00|Historical momentum \/ current weakness/,'SSR does not fabricate provider observations');
  const harness=createHarness(component,fixture);active.push(harness);
  assert.equal(calls.length,0,'Mount/effects do not request observations');
  const click=refreshButton(harness).props.onClick,first=click(),duplicate=click();
  harness.render();
  assert.equal(calls.length,1,'Rapid repeated clicks are deduplicated before state rerender');
  assert.equal(refreshButton(harness).props.disabled,true,'Pending refresh disables the button');
  const url=new URL(calls[0].url,'http://localhost');
  assert.equal(url.pathname,'/api/c1-intraday-advisory');
  assert.deepEqual([...url.searchParams.keys()],['symbols'],'Only public symbols cross the advisory API boundary');
  assert.deepEqual(url.searchParams.get('symbols').split(','),['AAPL','DELL','MYST','QQQ','SPY','XLK','XLV']);
  assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.cache,'no-store');
  assert.ok(calls[0].options.signal instanceof AbortSignal);assert.equal(calls[0].options.body,undefined);
  calls[0].resolve(response());await first;await duplicate;await flush();harness.render();
  assert.equal(refreshButton(harness).props.disabled,false);
  assert.match(harness.text,/Historical momentum \/ current weakness/,'Strong historical momentum can coexist with measured current weakness');
  assert.match(harness.text,/Observed price\$98\.00/);assert.match(harness.text,/Since open-2\.97%/);
  assert.match(harness.html,/dateTime="2026-10-14T16:00:00\.000Z"/,'Each usable stock shows its actual provider timestamp');
  assert.match(harness.text,/11:00:00 AM CDT/,'Provider timestamps display in the client timezone');
  assert.match(harness.text,/Recorded stops: \$95\.00/,'Only the recorded stop is displayed');
  assert.match(harness.text,/verified dated sector benchmark is unavailable/,'Unknown sectors produce an explicit limitation');
  assert.doesNotMatch(harness.text,/Buy \d+|sell \d+|Strong Buy|Exit candidate/,'The advisory cannot create trading instructions');

  clock.advance(120002,()=>harness.render());
  assert.match(harness.text,/Delayed observation/);assert.doesNotMatch(harness.text,/SPY [+-]\d/,'Delayed comparisons cannot remain current');
  assert.equal(calls.length,1,'Aging a fresh observation never fetches quotes');
  clock.advance(780000,()=>harness.render());
  assert.match(harness.text,/Stale observation/);assert.equal(calls.length,1,'Aging into stale status never fetches quotes');
  global.window.dispatch('focus');global.document.dispatch('visibilitychange');harness.render();
  assert.equal(calls.length,1,'Focus and visibility updates only age existing observations');
  harness.unmount();active.pop();

  // Run following cases from a fresh regular-session clock without reloading source.
  clock.advance(1);
  const currentSnapshot=patch=>snapshot({receivedAt:new Date(clock.now).toISOString(),quotes:quoteSnapshot.quotes.map(row=>({...row,timestamp:clock.now/1000})),...patch});
  for(const malformed of [null,{}, {contract:'wrong',quotes:[]},currentSnapshot({quotes:'invalid'})]){
   const before=calls.length,bad=createHarness(component,fixture);active.push(bad);
   await resolveRefresh(bad,calls,malformed);assert.equal(calls.length,before+1);
   assert.match(bad.text,/Current observations are unavailable/);assert.match(bad.text,/Intraday quotes are unavailable/);
   assert.doesNotMatch(bad.text,/\$98\.00|Historical momentum \/ current weakness/);
   bad.unmount();active.pop();
  }
  for(const type of ['http','network','json']){
   const bad=createHarness(component,fixture);active.push(bad);const task=refreshButton(bad).props.onClick();bad.render();
   const call=calls.at(-1);
   if(type==='network')call.reject(new Error('Sensitive provider URL must not leak'));
   else if(type==='json')call.resolve({ok:true,json:async()=>{throw new SyntaxError('Malformed body');}});
   else call.resolve(response({error:'Sensitive provider body must not leak'},503));
   await task;await flush();bad.render();assert.match(bad.text,/Current observations are unavailable/);
   assert.doesNotMatch(bad.text,/Sensitive|\$98\.00/,'Failed source details and prices are not fabricated');
   assert.equal(refreshButton(bad).props.disabled,false,'A failed request can be retried manually');
   bad.unmount();active.pop();
  }

  // Structurally valid snapshots with unusable prices/timestamps retain no values.
  const invalid=createHarness(component,fixture);active.push(invalid);
  await resolveRefresh(invalid,calls,currentSnapshot({quotes:quoteSnapshot.quotes.map(row=>({...row,price:'98',timestamp:null}))}));
  assert.match(invalid.text,/Observation unavailable/);assert.doesNotMatch(invalid.text,/\$98\.00|Since open-2\.97%/);
  invalid.unmount();active.pop();

  // Price-basis mismatch keeps exact recorded stop, suppressing derived distance/divergence.
  const mismatch=createHarness(component,fixture);active.push(mismatch);
  const mismatchQuotes=currentSnapshot();mismatchQuotes.quotes=mismatchQuotes.quotes.map(row=>row.symbol==='DELL'?{...row,previousClose:99}:row);
  await resolveRefresh(mismatch,calls,mismatchQuotes);
  assert.match(mismatch.text,/\$95\.00 \(distance unavailable\)/);assert.doesNotMatch(mismatch.text,/Historical momentum \/ current weakness/);
  assert.match(mismatch.text,/Accepted daily close\/date does not match/);
  mismatch.unmount();active.pop();

  // A still-fresh but 61-second-separated benchmark must not form a relative signal.
  const misaligned=createHarness(component,fixture);active.push(misaligned);
  const misalignedQuotes=currentSnapshot();misalignedQuotes.quotes=misalignedQuotes.quotes.map(row=>['SPY','QQQ','XLK','XLV'].includes(row.symbol)?{...row,timestamp:row.timestamp-61}:row);
  await resolveRefresh(misaligned,calls,misalignedQuotes);
  assert.match(misaligned.text,/SPY: comparison unavailable/);assert.doesNotMatch(misaligned.text,/SPY [+-]\d|Historical momentum \/ current weakness|Strengthening intraday price/);
  misaligned.unmount();active.pop();

  // A benchmark can expire before the stock. Relative labels must age at its deadline.
  const benchmarkAging=createHarness(component,fixture);active.push(benchmarkAging);
  const expiringBenchmark=currentSnapshot();expiringBenchmark.quotes=expiringBenchmark.quotes.map(row=>({...row,timestamp:row.timestamp-(row.symbol==='SPY'?119:60)}));
  await resolveRefresh(benchmarkAging,calls,expiringBenchmark);
  assert.match(benchmarkAging.text,/SPY -3\.97 pp since open/);assert.match(benchmarkAging.text,/Historical momentum \/ current weakness/);
  const benchmarkCalls=calls.length;clock.advance(1002,()=>benchmarkAging.render());
  assert.match(benchmarkAging.text,/SPY: comparison unavailable/);assert.doesNotMatch(benchmarkAging.text,/SPY [+-]\d|Historical momentum \/ current weakness/);
  assert.match(benchmarkAging.text,/Observed price\$98\.00/,'Stock remains usable while the benchmark ages');
  assert.equal(elements(benchmarkAging.tree).filter(node=>node.type==='span'&&content(node)==='Fresh').length,3,'Stock freshness is independent of benchmark expiry');
  assert.equal(calls.length,benchmarkCalls,'Benchmark aging does not fetch a replacement quote');
  benchmarkAging.unmount();active.pop();

  for(const patch of [
   {decision:{...fixture.decision,revision:3}},
   {decision:{...fixture.decision,decisionId:'new-baseline'}},
   {decision:{...fixture.decision,current:false}},
   {decision:{...fixture.decision,sourceSessionDate:'2026-10-12'}},
   {accountMatches:false},
   {portfolio:[{...fixture.portfolio[0],shares:11}]},
   {decision:{...fixture.decision,stockScreen:{...fixture.decision.stockScreen,candidates:fixture.decision.stockScreen.candidates.slice(0,1)}}},
  ]){
   const race=createHarness(component,fixture);active.push(race);
   const before=calls.length,task=refreshButton(race).props.onClick();race.render();const prior=calls.at(-1);
   race.render(patch);assert.equal(prior.options.signal.aborted,true,'Changing the authoritative baseline or target context aborts the previous observation request');
   assert.equal(calls.length,before+1,'Context changes never initiate new requests');
   prior.resolve(response(currentSnapshot()));await task;await flush();race.render();
   assert.doesNotMatch(race.text,/\$98\.00|Provider observation: Oct/,'An obsolete response cannot populate the new context');
   race.unmount();active.pop();
  }
  // A canceled older request cannot overwrite a newer context's successful response.
  const reordered=createHarness(component,fixture);active.push(reordered);
  const oldTask=refreshButton(reordered).props.onClick();reordered.render();const oldCall=calls.at(-1);
  reordered.render({decision:{...fixture.decision,revision:4}});
  const newTask=refreshButton(reordered).props.onClick();reordered.render();const newCall=calls.at(-1);
  const replacement=currentSnapshot();replacement.quotes=replacement.quotes.map(row=>row.symbol==='DELL'?{...row,price:97}:row);
  newCall.resolve(response(replacement));await newTask;await flush();reordered.render();
  assert.match(reordered.text,/Observed price\$97\.00/);
  oldCall.resolve(response(currentSnapshot()));await oldTask;await flush();reordered.render();
  assert.match(reordered.text,/Observed price\$97\.00/);assert.doesNotMatch(reordered.text,/Observed price\$98\.00/);
  reordered.unmount();active.pop();

  const fallback=createHarness(component,fixture);active.push(fallback);
  await resolveRefresh(fallback,calls,currentSnapshot({cacheStatus:'stale-fallback'}));
  assert.match(fallback.text,/Cached fallback after a failed refresh/);assert.match(fallback.text,/Stale observation/);
  assert.doesNotMatch(fallback.text,/Historical momentum \/ current weakness|SPY [+-]\d/,'Fallback data cannot preserve current momentum classifications');
  fallback.unmount();active.pop();

  const pending=createHarness(component,fixture);active.push(pending);
  const task=refreshButton(pending).props.onClick();pending.render();const finalCall=calls.at(-1);
  pending.unmount();active.pop();assert.equal(finalCall.options.signal.aborted,true,'Unmount aborts an active request');
  finalCall.resolve(response(currentSnapshot()));await task;await flush();

  for(const props of [{...fixture,disabled:true},{decision:null,accountMatches:false}]){
   const before=calls.length,blocked=createHarness(component,props);active.push(blocked);
   assert.equal(refreshButton(blocked).props.disabled,true);await refreshButton(blocked).props.onClick();
   assert.equal(calls.length,before,'Disabled or unavailable contexts cannot request quotes');blocked.unmount();active.pop();
  }
  assert.equal(global.window.count,0);assert.equal(global.document.count,0,'All browser event listeners clean up');
  const source=fs.readFileSync(sourceFile,'utf8');
  assert.doesNotMatch(source,/localStorage|sessionStorage|\/api\/c1-account|\bsetPortfolio\b|\bsetStocks\b|\bonSave\b/,'Advisory has no account/storage/current-price mutation path');
  console.log('PASS: real advisory SSR, manual-only batched GET, busy deduplication, local freshness aging, safe failures, exact timestamp/stop display, unknown-sector/basis/benchmark suppression, baseline races and unmount cleanup.');
 }finally{
  for(const harness of active)harness.unmount();
  clock.restore();global.fetch=original.fetch;
  for(const key of ['window','document'])if(original[key]===undefined)delete global[key];else global[key]=original[key];
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
