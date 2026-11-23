// Raw current UI against the exact prior View, using fictional workflow data.
// Only the temporary diagnostic button disappears; no live service or account
// is accessed, and no supplied financial/selection inputs may change.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const inverse=require('./c1-watch-download-cleanup-seams.cjs'),clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const file='components/C1AccountOpportunitiesView.js',source=fs.readFileSync(file,'utf8'),priorSource=inverse.restore(file,source);
assert(!source.includes('downloadC1WatchDetails'),'Raw production View has no diagnostic-download import or callback');
assert(priorSource.includes('downloadC1WatchDetails(watchSelection)'),'Exact prior View includes the temporary control');
const loader=createResearchModuleLoader(process.cwd());
// Keep the cleanup's historical warning assertions on their exact original
// selector; the raw-current entry-blocker regression covers the later repair.
const selectorFile='lib/c1CurrentWatchSelection.js',historicalSelector={exports:{}};
const historicalCode=babel.transformSync(require('./c1-watch-entry-blocker-seams.cjs').restore(selectorFile,fs.readFileSync(selectorFile,'utf8')),{filename:path.resolve(selectorFile),babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
new Function('require','module','exports',historicalCode)(name=>name.startsWith('./')?loader.load(name,path.resolve(selectorFile)):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),historicalSelector,historicalSelector.exports);
function compile(text){
 const record={exports:{}},code=babel.transformSync(text,{filename:path.resolve(file),babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',code)(name=>name.startsWith('../lib/')?loader.load(name,path.resolve(file)):name==='react'?React:require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 return record.exports.renderC1AccountOpportunitiesView;
}
const render=compile(source),renderPrior=compile(priorSource);
function elements(node){if(Array.isArray(node))return node.flatMap(elements);if(!React.isValidElement(node))return [];return [node,...elements(node.props.children)];}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(React.isValidElement(node))return text(node.props.children);return node==null||typeof node==='boolean'?'':String(node);}

(async()=>{
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],moduleOverrides:{[selectorFile]:historicalSelector.exports}});
 const spec=applyAccountPolicyUniverseFixture(f,{count:50});f.setCash(100000);
 const financial=JSON.stringify({account:f.account,book:f.book});
 const view=await f.prepare(),events=new Map(currentEventEvidenceFor(spec.symbols,f.now).map(row=>[row.symbol,row]));
 const screenRows=f.screenRows().map(row=>({...row,eventRisk:events.get(row.symbol)}));
 const base={...view,screenRows,positionRows:screenRows,screenCurrent:true,portfolio:f.portfolio};
 const {joinC1Opportunities:join}=f.loader.load('lib/c1OpportunitiesContract.js');
 const first=spec.symbols[27];
 const cases=[
  ['open market',()=>{}],
  ['stock-specific warning',({policy,candidates})=>{policy.purchaseEligibilityComplete=true;policy.purchaseBlocks[first]='account-exposure-unverified';candidates.find(row=>row.symbol===first).recentMomentumGate.entryAllowed=false;}],
  ['shared account warning',({policy})=>{policy.purchaseEligibilityComplete=false;}],
  ['opening unavailable',({input})=>{input.openingPlan=null;input.manualRecommendations=null;}],
  ['market closed',()=>{},new Date('2026-11-11T23:00:00Z')],
  ['zero Watch names',({policy})=>{policy.blockedSymbols=[...spec.symbols];}],
 ];
 for(const [index,[name,edit,at=f.now]]of cases.entries()){
  const input=clone(base),decision=clone(input.executionDecision||input.decision),policy=decision.accountPolicy;
  policy.purchaseBlocks={...policy.purchaseBlocks};edit({input,decision,policy,candidates:decision.stockScreen.candidates});
  const id='fictional-watch-cleanup-'+index;decision.decisionId=id;decision.actionVersion=id;policy.identity=id;policy.decisionId=id;
  decision.stockScreen={...decision.stockScreen,decisionId:id,accountPolicy:policy};input.decision=decision;input.executionDecision=decision;
  if(input.openingPlan)input.openingPlan={...input.openingPlan,actionVersion:id,accountPolicy:policy};
  if(input.manualRecommendations)input.manualRecommendations={...input.manualRecommendations,actionVersion:id,decisionId:id};
  const inputBytes=JSON.stringify(input),projection=join(input,{readTime:()=>at}).projection,projectionBytes=JSON.stringify(projection);
  const tree=render(projection),html=renderToStaticMarkup(tree),priorHTML=renderToStaticMarkup(renderPrior(projection));
  const priorButtons=[...priorHTML.matchAll(/<button\b[^>]*>Download Watch details<\/button>/g)];
  assert.equal(priorButtons.length,1,name+': the exact prior UI has one temporary diagnostic button');
  assert.match(priorButtons[0][0],/type="button"/);
  assert.equal(html,priorHTML.replace(priorButtons[0][0],''),name+': every action, checked quantity, warning, rank and other rendered element remains byte-identical after deleting only the temporary button');
  assert(!elements(tree).some(node=>node.type==='button'&&text(node)==='Download Watch details'),name+': raw current React tree has no download control');
  assert(!/Download Watch details|downloadC1WatchDetails/.test(html),name+': no hidden download UI remains');
  const selection=projection.watchSelection,watch=html.slice(html.indexOf('aria-label="Watch opportunities"'));
  assert.equal(selection.diagnostics.length,50,'The display cleanup never truncates the full candidate diagnostics');
  assert(selection.rows.length<=10);
  assert(!(selection.rows.length?/source candidates|monitoring candidates|universe/i:/source candidates|universe/i).test(watch),name+': normal Watch stays free of diagnostic counts, while the zero-name explanation remains honest');
  same([...watch.matchAll(/<tr[^>]*><td[^>]*>(\d+)<\/td>/g)].map(match=>Number(match[1])),selection.rows.map((row,index)=>index+1),'Actual Watch numbers remain sequential strongest first');
  if(name==='open market'){
   assert.equal(selection.rows.length,10);same(selection.rows.map(row=>row.symbol),spec.symbols.slice(27,37),'Open-market top ten retain their established source order');
   same(projection.actionableBuys.map(row=>row.symbol),['X12','X13','X14'],'The checked purchase set remains intact');
   assert(projection.actionableBuys.every(row=>Number.isSafeInteger(row.shares)&&row.shares>0));
   same(projection.watchView.rows.map(row=>row.priority),[28,29,30,31,32,33,34,35,36,37],'Underlying source ranks are retained separately from visible positions');
  }else if(name==='stock-specific warning'){
   assert.equal(policy.purchaseEligibilityComplete,true);assert(!selection.commonWaitReasons.includes('account-exposure-unverified'));
   const why=selection.rows.find(row=>row.symbol===first).screenReview.why;
   assert(why.includes("This stock's opening price or purchase limit checks are incomplete.")&&!why.includes('Current account exposure is unverified.'),'Removing the control preserves the corrected per-stock explanation');
  }else if(name==='shared account warning'){
   assert(selection.commonWaitReasons.includes('account-exposure-unverified'));assert(watch.includes('Current account exposure is unverified.'),'A true shared account warning remains visible');
  }else if(name==='opening unavailable'||name==='market closed'){
   assert.equal(selection.rows.length,10,'Missing execution authority does not erase otherwise valid dated monitoring');
   assert.equal(projection.actionableBuys.length,0,'Dated monitoring creates no purchase authority');
   if(name==='opening unavailable')assert(selection.commonWaitReasons.includes('opening-checks-unavailable'));
   else assert.equal(selection.executionReadiness.marketOpen,false);
  }else {assert.equal(selection.rows.length,0);assert.equal(selection.totalEligible,0,'Cleanup never manufactures names');}
  assert.equal(JSON.stringify(input),inputBytes,'All supplied cash, holdings, stops, orders, flags and market observations remain unchanged');
  assert.equal(JSON.stringify(projection),projectionBytes,'Rendering cannot change checked quantities, structured reasons or candidate selection');
  const portfolio={...projection,portfolioOnly:true},portfolioBytes=JSON.stringify(portfolio);
  assert.equal(renderToStaticMarkup(render(portfolio)),renderToStaticMarkup(renderPrior(portfolio)),'Portfolio actions never contained this control and remain entirely unchanged');
  assert.equal(JSON.stringify(portfolio),portfolioBytes);
 }
 assert.equal(JSON.stringify({account:f.account,book:f.book}),financial,'Preparation and all presentation checks leave fictional account and accepted book bytes unchanged');
 console.log('PASS: raw current Watch removes only the temporary download control across open, closed, missing-opening and zero-name states; exact prior HTML minus that button preserves warnings, top-ten order, source ranks, actions, quantities, flags and all financial inputs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
