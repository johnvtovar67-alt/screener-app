// Exact rendered and effect parity against the pre-extraction component.
// Synthetic account fixtures only: no provider requests or live account writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const file=path.resolve('components/C1AccountOpportunities.js'),viewFile=path.resolve('components/C1AccountOpportunitiesView.js');
const currentSource=fs.readFileSync(file,'utf8'),source=require('./c1-opportunities-projection-extraction.cjs').restoreOpportunitiesProjection(currentSource),viewSource=fs.readFileSync(viewFile,'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'794a87727bfb4dcfc17e98fbb6948690fd4fa64606a29febd3cd5e1691a335b2','Shared projection extraction reconstructs the exact PR331 component');
const seam=source.indexOf(' return renderC1AccountOpportunitiesView('),bodyStart=viewSource.indexOf(' return <><section');
assert(seam>=0&&bodyStart>=0);
const original="import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';\n"+
 source.slice(0,seam).replace("import {renderC1AccountOpportunitiesView} from './C1AccountOpportunitiesView';\n",'')+require('./c1-holding-wording-seams.cjs').restoreView(viewSource).slice(bodyStart);
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'0b72fd1afff37128fce1f203753a1eebbf3afa6a73dee618a8c919a422d6c71c',
 'Reversing only the render extraction reproduces the complete deployed component, including all authority/effect code and literal markup');
const NativeDate=Date,nativeFetch=global.fetch,nativeWindow=global.window,nativeSetTimeout=global.setTimeout,nativeClearTimeout=global.clearTimeout;
let clock='2026-10-15T17:01:00.000Z',clockStep=0,clockReads=[];
function readClock(){const value=NativeDate.parse(clock)+(clockStep?clockReads.length*clockStep:0);clockReads.push(value);return value;}
global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[readClock()]));}static now(){return readClock();}};
global.fetch=async()=>{throw Error('Network forbidden in extraction parity regression');};
const clone=value=>JSON.parse(JSON.stringify(value));
function harness(baseline,browser){
 const loader=createResearchModuleLoader(process.cwd()),components=new Map(),refs=[],states=[],effects=[],previousDeps=[],cleanups=[],memory=new Map(),operations=[],timers=new Map();
 let refIndex=0,stateIndex=0,effectIndex=0,timerId=0;
 const hooks={...React,useRef:value=>refs[refIndex++]||(refs[refIndex-1]={current:value}),
  useState:value=>{const index=stateIndex++;if(!(index in states))states[index]=value;return [states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},
  useEffect:(fn,deps)=>{const index=effectIndex++,old=previousDeps[index];if(!old||!deps||deps.some((value,i)=>!Object.is(value,old[i]))){effects.push(()=>{cleanups[index]?.();cleanups[index]=fn();});previousDeps[index]=deps;}}};
 const storage={getItem:key=>{operations.push(['get',key]);return memory.get(key)??null;},setItem:(key,value)=>{operations.push(['set',key,value]);memory.set(key,value);}};
 function load(componentFile){
  if(components.has(componentFile))return components.get(componentFile);
  // The immutable original hash above stays unchanged. Allow only the owner-
  // requested heading copy when comparing every other render/effect byte.
  const text=baseline&&componentFile===file?original.replace(require('./c1-holding-wording-seams.cjs').oldLabel,require('./c1-holding-wording-seams.cjs').newLabel):fs.readFileSync(componentFile,'utf8'),record={exports:{}};
  const compiled=babel.transformSync(text,{filename:componentFile,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
  new Function('require','module','exports',compiled)(name=>name==='react'?hooks:name.startsWith('../lib/')?loader.load(name,componentFile):name.startsWith('.')?load(path.resolve(path.dirname(componentFile),name.endsWith('.js')?name:name+'.js')):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
  components.set(componentFile,record.exports);return record.exports;
 }
 const Component=load(file).default;
 return {render(props,advancingClock=false){
  clockReads=[];clockStep=advancingClock?1:0;
  if(browser)global.window={localStorage:storage};else delete global.window;
  global.setTimeout=(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;};global.clearTimeout=id=>timers.delete(id);
  refIndex=0;stateIndex=0;effectIndex=0;effects.length=0;
  const before=JSON.stringify(props),html=renderToStaticMarkup(Component(props));
  effects.forEach(effect=>effect());
  assert.equal(JSON.stringify(props),before,'Rendering/effects cannot mutate supplied account, orders or price evidence');
  const clockTrace=[...clockReads];clockStep=0;
  return {html,operations:clone(operations),memory:[...memory],timers:[...timers].map(([id,{ms}])=>[id,ms]),states:clone(states),clockTrace};
 },expire(){for(const [id,{fn}]of [...timers]){timers.delete(id);fn();}}};
}
async function main(){try{
 const fixture=createWorkflowFixture();fixture.setCash(100000);fixture.advance();const checked=await fixture.prepare();
 const props={...checked,screenRows:fixture.screenRows(),positionRows:fixture.screenRows(),screenCurrent:true,portfolio:fixture.portfolio};
 const sell=createWorkflowFixture('sell');sell.setCash(0);sell.setOpeningFailure(true);sell.advance();const sellView=await sell.prepare();
 const scenarios=[
  ['checked',p=>p],['portfolio',p=>({...p,view:'portfolio'})],
  ['screen pending',p=>({...p,screenCurrent:false})],['screen missing',p=>({...p,screenRows:[]})],
  ['opening pending',p=>({...p,openingPlan:null,manualRecommendations:{status:'waiting',reason:'Synthetic opening pending.'}})],
  ['opening failure',p=>({...p,openingPlan:null,openingError:'Synthetic provider unavailable.'})],
  ['account stale',p=>({...p,decision:{...p.decision,current:false}})],
  ['account mismatch',p=>({...p,decision:{...p.decision,accountMismatch:true}})],
  ['foreign revision',p=>({...p,executionDecision:{...p.executionDecision,revision:p.executionDecision.revision+1}})],
  ['expired review',p=>({...p,manualRecommendations:{...p.manualRecommendations,validUntil:'2026-10-15T16:59:00Z'}})],
  ['zero cash',p=>({...p,decision:{...p.decision,brokerageCash:0,executableCash:0}})],
  ['missing cash',p=>({...p,decision:{...p.decision,brokerageCash:undefined,brokerageCashCurrent:false}})],
  ['conditional orders',p=>({...p,manualRecommendations:{...p.manualRecommendations,orders:p.manualRecommendations.orders.map(o=>({...o,condition:'synthetic-pending'}))}})],
  ['changed event',p=>({...p,screenRows:p.screenRows.map((row,index)=>index?row:{...row,eventRisk:{status:'Blocked',blockNewCapital:true}})})],
  ['stale quote',p=>({...p,screenRows:p.screenRows.map(row=>({...row,clientSnapshotFallback:true}))})],
  ['no source candidates',p=>({...p,decision:{...p.decision,stockScreen:{...p.decision.stockScreen,candidates:[]}}})],
  ['recorded stop',()=>({...sellView,screenRows:sell.screenRows(),positionRows:sell.screenRows(),screenCurrent:true,portfolio:sell.portfolio,view:'portfolio'})],
  ['stop opportunities',()=>({...sellView,screenRows:sell.screenRows(),positionRows:sell.screenRows(),screenCurrent:true,portfolio:sell.portfolio})],
 ];
 let comparisons=0;
 for(const [name,edit]of scenarios)for(const browser of [false,true]){
  const old=harness(true,browser),current=harness(false,browser),input=edit(clone(props));
  for(let render=0;render<3;render++){
   assert.deepEqual(current.render(clone(input)),old.render(clone(input)),`${name}, browser=${browser}, render=${render}: literal HTML, CSS scoping, storage/effects and timer wiring must match`);comparisons++;
  }
 }
 // Retained selection, failed refresh, independent review recovery, source
 // replacement and recommendation-expiry callbacks use persistent hook state.
 for(const browser of [false,true]){
  const old=harness(true,browser),current=harness(false,browser);
  const retained=clone(props),failed={...clone(props),screenRows:[],openingError:'Synthetic refresh failure'},recovered=clone(props);
  for(const input of [retained,retained,failed,failed,recovered,recovered,{...clone(props),decision:{...props.decision,decisionId:'changed-source:2',stockScreen:{...props.decision.stockScreen,candidates:[]}}}]){
   assert.deepEqual(current.render(clone(input)),old.render(clone(input)),'Retained/recovered source sequence and storage identities are unchanged');comparisons++;
  }
  clock='2026-10-15T17:04:00.000Z';old.expire();current.expire();
  assert.deepEqual(current.render(clone(props)),old.render(clone(props)),'The unchanged expiry callback cannot retain expired quantities');comparisons++;
  clock='2026-10-15T17:01:00.000Z';
 }
 // The extracted renderer is called synchronously, rather than scheduled as
 // a React child. Advance time on every implicit Date/Date.now read around
 // expiry and compare the complete callback/clock trace as well as markup.
 assert.match(currentSource,/return projection\?renderC1AccountOpportunitiesView\(projection\):null/);
 assert.doesNotMatch(viewSource,/\buse(?:State|Effect|Ref|Memo|Callback|Context)\s*\(/,'The synchronous renderer must stay hook-free');
 for(const instant of ['2026-10-15T17:01:00.000Z','2026-10-15T17:02:59.995Z','2026-10-15T17:03:00.000Z'])for(const view of ['opportunities','portfolio']){
  clock=instant;
  const old=harness(true,true),current=harness(false,true),input={...clone(props),view};
  for(let render=0;render<2;render++){
   assert.deepEqual(current.render(clone(input),true),old.render(clone(input),true),'Advancing-clock callback order and exact expiry behavior stay in the original parent render');comparisons++;
  }
 }
 console.log(`PASS: deployed component source reconstructed exactly; ${comparisons} complete markup/effect/storage/timer parity comparisons across 18 states, both views, browser restore, retained failure/recovery, expiry and advancing-clock callback traces; zero network/live account writes.`);
}finally{global.Date=NativeDate;global.fetch=nativeFetch;global.setTimeout=nativeSetTimeout;global.clearTimeout=nativeClearTimeout;if(nativeWindow===undefined)delete global.window;else global.window=nativeWindow;}}
main().catch(error=>{console.error(error);process.exitCode=1;});
