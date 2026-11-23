// Real producer/planner -> Watch join -> raw View, with fictional dated inputs
// and an explicit offline collector. No private report, provider, account write
// or investment-performance inference is involved.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const inverse=require('./c1-watch-entry-blocker-seams.cjs'),copy=value=>JSON.parse(JSON.stringify(value));
const root=process.cwd(),loader=createResearchModuleLoader(root),file='lib/c1CurrentWatchSelection.js';
const candidateText="This stock's opening price or purchase limit checks are incomplete.",globalText='Current account exposure is unverified.';
const same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const noSecondary=value=>JSON.stringify(value).replaceAll(' '+candidateText,'');
function compile(filename,source,modules=loader){
 const record={exports:{}},code=babel.transformSync(source,{filename:path.resolve(filename),babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',code)(name=>name.startsWith('.')?modules.load(name,path.resolve(filename)):name==='react'?React:require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 return record.exports;
}
const prior=compile(file,inverse.restore(file,fs.readFileSync(file,'utf8'))),priorLoader=createResearchModuleLoader(root,{[file]:prior});
const {watchWaitText}=loader.load(file),{renderC1AccountOpportunitiesView:render}=compile('components/C1AccountOpportunitiesView.js',fs.readFileSync('components/C1AccountOpportunitiesView.js','utf8'));
assert(!watchWaitText(['recent-entry-trigger-wait','account-exposure-unverified'],[]).includes(candidateText),'A known failed trigger supersedes the secondary per-name sentence');
assert(watchWaitText(['recent-entry-trigger-wait','account-exposure-unverified'],['account-exposure-unverified']).includes(globalText),'An explicit shared account failure remains visible');
assert(watchWaitText(['account-exposure-unverified'],[]).includes(candidateText),'Otherwise-qualified missing checks remain explicit');
assert(watchWaitText(['recent-momentum-unavailable','account-exposure-unverified'],[]).includes(candidateText),'Unknown momentum cannot be treated as a known failed trigger');
assert(watchWaitText(['event-unverified','entry-trigger-wait'],[]).includes('Current company-event verification is unavailable.'),'Informational timing cannot hide the final event gate');

(async()=>{
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}]});
 const spec=applyAccountPolicyUniverseFixture(f,{count:50}),target=spec.symbols[27];f.setCash(100000);
 // One otherwise structurally eligible fictional monitor has genuinely weak
 // accepted closes. Its new-entry clock cannot produce a pending purchase.
 for(const [index,session]of f.book.model.sessions.slice(-6).entries()){
  const close=106-index,p=session.prices.find(row=>row.symbol===target);Object.assign(p,{open:close,close,high:close*1.001,low:close*.999});
  for(const field of ['signals','positionSignals']){
   const signal=session[field].find(row=>row.symbol===target);signal.price=close;signal.entryTiming.macdImproving=false;
  }
 }
 const financialBefore=JSON.stringify({account:f.account,book:f.book}),requests=[];
 const prepare=f.loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution;
 const checked=await prepare({account:f.account,book:f.book,now:f.now,collectOpening:async request=>{
  const projected=request.resolveSymbols?request.resolveSymbols({priceBasisRevisions:[]}):[];
  const requested=[...new Set([...request.symbols,...request.essentialSymbols||[],...projected])];requests.push(requested);
  const opening=f.opening();
  return {...opening,prices:opening.prices.filter(row=>requested.includes(row.symbol)),currentEventEvidence:currentEventEvidenceFor(requested,f.now)};
 }});
 assert.equal(requests.length,1,'One real preparation asks the offline boundary for its actual requirements');
 assert(!requests[0].includes(target),'The failed-momentum name has no requested opening quote');
 assert(checked.openingPlan&&checked.openingError==null,'The real account opening succeeds with quotes only for required names');
 assert.equal(checked.decision.accountPolicy.purchaseEligibilityComplete,true,'Account-wide exposure was actually computed and validated');
 const classification=checked.openingPlan.accountExposure.candidates[target];
 assert(classification.sector&&classification.issuer,'The deliberately unrequested name has accepted classification');
 assert.equal(classification.price,undefined,'No planner opening observation was invented for this name');
 assert.equal(checked.decision.accountPolicy.purchaseBlocks[target],'account-exposure-unverified','The real producer retains the overloaded diagnostic');
 const events=new Map(currentEventEvidenceFor(requests[0],f.now).map(row=>[row.symbol,row]));
 const rows=f.screenRows().map(row=>({...row,...(events.has(row.symbol)?{eventRisk:events.get(row.symbol)}:{})}));
 const base={...checked,screenRows:rows,positionRows:rows,screenCurrent:true,portfolio:f.portfolio};
 const {joinC1Opportunities:join}=f.loader.load('lib/c1OpportunitiesContract.js'),{joinC1Opportunities:priorJoin}=priorLoader.load('lib/c1OpportunitiesContract.js');
 const initial=join(base,{readTime:()=>f.now}).projection;
 assert.equal(initial.watchSelection.rows.length,10);assert(initial.watchSelection.rows.some(row=>row.symbol===target));
 const initialDiagnostic=initial.watchSelection.diagnostics.find(row=>row.symbol===target);
 assert.equal(initialDiagnostic.recentMomentum.available,true);assert.equal(initialDiagnostic.recentMomentum.entryAllowed,false,'Accepted real gate confirms the independent entry failure');
 assert.equal(initialDiagnostic.currentChecks.entryChecks.quoteVerified,true,'The current broad-screen quote is distinct from the absent planner opening quote');
 const variants=[
  ['failed trigger',()=>{}],
  ['failed trigger and real gap',({rows,candidates})=>{rows.find(row=>row.symbol===target).price=candidates.find(row=>row.symbol===target).sourcePrice*1.1;}],
  ['global failure',({policy})=>{policy.purchaseEligibilityComplete=false;}],
  ['qualified but incomplete',({candidate})=>{candidate.recentMomentumGate.entryAllowed=true;}],
  ['unknown momentum',({candidate})=>{candidate.recentMomentumGate.available=false;}],
  ['final event gate',({candidate,policy,rows})=>{candidate.recentMomentumGate.entryAllowed=true;delete policy.purchaseBlocks[target];rows.find(row=>row.symbol===target).eventRisk={status:'Manual',blockNewCapital:true,checkComplete:false,manualCheckRequired:true};}],
 ];
 for(const [index,[label,edit]]of variants.entries()){
  const input=copy(base),decision=copy(input.executionDecision||input.decision),policy=decision.accountPolicy,candidates=decision.stockScreen.candidates,candidate=candidates.find(row=>row.symbol===target);
  policy.purchaseBlocks={...policy.purchaseBlocks};edit({input,decision,policy,candidates,candidate,rows:input.screenRows});
  const id='fictional-entry-blocker-frame-'+index;decision.actionVersion=id;decision.decisionId=id;policy.identity=id;policy.decisionId=id;
  decision.stockScreen={...decision.stockScreen,decisionId:id,accountPolicy:policy};input.decision=decision;input.executionDecision=decision;
  input.openingPlan={...input.openingPlan,actionVersion:id,accountPolicy:policy};if(input.manualRecommendations)input.manualRecommendations={...input.manualRecommendations,decisionId:id,actionVersion:id};
  const before=JSON.stringify(input),current=join(input,{readTime:()=>f.now}),old=priorJoin(input,{readTime:()=>f.now});
  assert.equal(noSecondary(current),noSecondary(old),label+': full actual join preserves every raw diagnostic, flag, rank, candidate, action and quantity except the authorized secondary sentence');
  const projection=current.projection,selection=projection.watchSelection,diagnostic=selection.diagnostics.find(row=>row.symbol===target),monitor=selection.rows.find(row=>row.symbol===target);
  assert(monitor,'A copy change cannot remove the dated monitor');assert.equal(selection.diagnostics.length,50);assert.equal(selection.rows.length,10);
  same(selection.rows.map(row=>row.symbol),old.projection.watchSelection.rows.map(row=>row.symbol),'Top ten retain exact strongest-first order');
  same(projection.watchView.rows.map(row=>row.priority),old.projection.watchView.rows.map(row=>row.priority),'Underlying source ranks remain unchanged');
  same(projection.actionableBuys,old.projection.actionableBuys,'No purchase authority or checked quantity changes');
  const html=renderToStaticMarkup(render(projection)),watch=html.slice(html.indexOf('aria-label="Watch opportunities"'));
  assert(!/Download Watch details/.test(watch),'The diagnostic control remains removed');
  same([...watch.matchAll(/<tr[^>]*><td[^>]*>(\d+)<\/td>/g)].map(match=>Number(match[1])),[1,2,3,4,5,6,7,8,9,10]);
  const why=monitor.screenReview.why;
  if(label.startsWith('failed trigger')){
   assert(why.includes('Recent momentum has not cleared the Buy/Add trigger.')&&!why.includes(candidateText),'Actual View data prioritizes the known entry failure');
   assert(diagnostic.waitReasons.includes('account-exposure-unverified'));assert.equal(diagnostic.currentChecks.purchaseBlock,'account-exposure-unverified','Raw fail-closed evidence is retained');
   assert(!watch.includes(candidateText),'The repeated secondary sentence is absent from these failed-entry monitors');
   same(projection.actionableBuys,initial.actionableBuys,'Explaining a non-entry monitor cannot change independently checked Buys');
   if(label==='failed trigger and real gap')assert(why.includes('The current opening gap blocks buying.')&&diagnostic.waitReasons.includes('entry-gap-limit'),'A genuine gap failure is not suppressed');
  }else if(label==='global failure')assert(why.includes(globalText)&&selection.commonWaitReasons.includes('account-exposure-unverified'),'Shared failures stay explicit even behind a failed stock trigger');
  else if(label==='qualified but incomplete'||label==='unknown momentum')assert(why.includes(candidateText),'Missing checks for qualified or unknown momentum remain visible');
  else {assert(why.includes('Current company-event verification is unavailable.'));assert.equal(diagnostic.currentChecks.event,'UNVERIFIED');}
  assert(!projection.actionableBuys.some(row=>row.symbol===target),'None of these blocked or unverified cases creates a new Buy');
  assert.equal(JSON.stringify(input),before,'Selection, render and explanations cannot mutate any account/market inputs');
 }
 assert.equal(JSON.stringify({account:f.account,book:f.book}),financialBefore,'Real preparation and rendering preserve all fictional financial and accepted-input bytes');
 console.log('PASS: real failed-momentum producer omits an unnecessary opening request while retaining classification and global exposure verification; current selector/View explains the trigger, preserves gap/global/qualified/unknown/event safeguards, and leaves top-ten order, raw diagnostics, actions, quantities and financial inputs unchanged.');
})().catch(error=>{console.error(error);process.exitCode=1;});
