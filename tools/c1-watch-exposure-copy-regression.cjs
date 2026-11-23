// Fictional account observations through the real selector/join and real View.
// This tests explanation/export behavior, never investment performance or a
// private production account. Provider/storage boundaries remain isolated.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const inverse=require('./c1-watch-exposure-copy-seams.cjs'),clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message);
const candidateText="This stock's opening price or purchase limit checks are incomplete.",accountText='Current account exposure is unverified.';
const unexplain=value=>JSON.stringify(value).replaceAll(candidateText,accountText);
const root=process.cwd(),loader=createResearchModuleLoader(root);
const blocked=()=>{throw Error('No network, storage or financial write is permitted');};
const downloadState={blobs:[],links:[],appended:[],timers:[],revoked:[]};
const dom={createElement:tag=>{assert.equal(tag,'a');const link={clicks:0,removes:0,click(){this.clicks++;},remove(){this.removes++;}};downloadState.links.push(link);return link;},body:{appendChild:link=>downloadState.appended.push(link)}};
const localURL={createObjectURL:blob=>{downloadState.blobs.push(blob);return 'blob:fictional-watch-export-'+downloadState.blobs.length;},revokeObjectURL:url=>downloadState.revoked.push(url)};
function moduleFromSource(file,source,modules=loader,extra={}){
 const compiled=babel.transformSync(source,{filename:path.resolve(file),babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 const record={exports:{}},bindings={Blob,URL:localURL,document:dom,setTimeout:(fn,delay)=>downloadState.timers.push({fn,delay}),fetch:blocked,localStorage:{setItem:blocked,getItem:blocked},...extra};
 new Function('require','module','exports',...Object.keys(bindings),compiled)(name=>{
  if(name.startsWith('../lib/')||name.startsWith('./'))return modules.load(name,path.resolve(file));
  if(name==='react')return React;
  return require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name);
 },record,record.exports,...Object.values(bindings));
 return record.exports;
}
const selectorFile='lib/c1CurrentWatchSelection.js',selectorSource=fs.readFileSync(selectorFile,'utf8');
const priorSelector=moduleFromSource(selectorFile,inverse.restore(selectorFile,selectorSource));
const priorLoader=createResearchModuleLoader(root,{'lib/c1CurrentWatchSelection.js':priorSelector});
const detailsFile='lib/c1WatchDetails.js',details=moduleFromSource(detailsFile,fs.readFileSync(detailsFile,'utf8'));
const viewModules={load:(request,from)=>request==='../lib/c1WatchDetails'?details:loader.load(request,from)};
// Preserve the prior, explicitly temporary download's historical coverage.
// The new raw UI/control absence is checked by c1-watch-download-cleanup-regression.
const viewFile='components/C1AccountOpportunitiesView.js';
const {renderC1AccountOpportunitiesView:render}=moduleFromSource(viewFile,require('./c1-watch-download-cleanup-seams.cjs').restore(viewFile,fs.readFileSync(viewFile,'utf8')),viewModules);
function elements(node){if(Array.isArray(node))return node.flatMap(elements);if(!React.isValidElement(node))return [];return [node,...elements(node.props.children)];}
function text(node){if(Array.isArray(node))return node.map(text).join('');if(React.isValidElement(node))return text(node.props.children);return node==null||typeof node==='boolean'?'':String(node);}
const names=selection=>selection.rows.map(row=>row.symbol);
function expectAllowlist(report){
 same(Object.keys(report),['contract','sourceSessionDate','exportedAt','note','source','counts','rejectionCounts','unknownCounts','waitCounts','reasonDefinitions','commonWaitReasons','executionReadiness','candidates'],'The complete export root is explicitly allowlisted');
 same(Object.keys(report.source),['verified','complete','provisional','totalUniverse','candidateCount','limit','totalEligible','problems']);
 same(Object.keys(report.executionReadiness),['previousSelectorCurrent','decisionCurrent','displayDecisionMasked','displayDecisionCurrent','serverDatedCurrent','accountMismatch','evidencePending','evidenceVerified','openingPresent','reviewCurrent','marketOpen','accountPolicyComplete','purchaseEligibilityComplete']);
 for(const row of report.candidates){
  same(Object.keys(row),['symbol','sector','researchRank','policyScore','momentumPercentile','sourcePrice','factorCoverage','volatility60Pct','return120Ex20','return60Ex5','sourceTiming','recentMomentum','rating','status','eligible','omittedInOpportunities','rejectionReasons','unknownReasons','waitReasons','currentChecks']);
  same(Object.keys(row.currentChecks),['rowPresent','clientSnapshotFallback','dataFeedSnapshotStale','entryPass','openingUnverified','event','purchaseBlock','entryChecks']);
  same(Object.keys(row.currentChecks.entryChecks),['sourcePurchaseEligible','recentMomentumClear','quoteVerified','eventClear','momentumAvailable','liquidityVerified','priceFloor','excludedSymbol','openingGapClear']);
 }
 assert.match(report.note,/cannot authorize a purchase and does not change the account/);
 assert.match(report.reasonDefinitions['account-exposure-unverified'],/In commonWaitReasons this applies to the account/);
}

(async()=>{
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}]});
 const spec=applyAccountPolicyUniverseFixture(f,{count:50});f.setCash(100000);
 const financialBefore=JSON.stringify({account:f.account,book:f.book});
 const prepared=await f.prepare(),events=new Map(currentEventEvidenceFor(spec.symbols,f.now).map(row=>[row.symbol,row]));
 const screenRows=f.screenRows().map(row=>({...row,eventRisk:events.get(row.symbol)}));
 const base={...prepared,screenRows,positionRows:screenRows,screenCurrent:true,portfolio:f.portfolio};
 const {joinC1Opportunities:join}=f.loader.load('lib/c1OpportunitiesContract.js');
 const {joinC1Opportunities:priorJoin}=priorLoader.load('lib/c1OpportunitiesContract.js');
 const baseline=join(base,{readTime:()=>f.now}),first=baseline.projection.watchSelection.rows[0].symbol;
 assert.equal(baseline.projection.watchSelection.rows.length,10);
 const {watchWaitText}=loader.load(selectorFile);
 assert.equal(watchWaitText(['account-exposure-unverified'],[]),'WAIT — '+candidateText);
 assert.equal(watchWaitText(['account-exposure-unverified'],['account-exposure-unverified']),'WAIT — '+accountText);
 assert(!/verified|passed|cleared/i.test(candidateText),'Candidate copy makes no affirmative verification claim');
 const variants=[
  ['complete account, stock-only gap',({policy,candidates,rows})=>{policy.purchaseEligibilityComplete=true;policy.purchaseBlocks[first]='account-exposure-unverified';candidates.find(row=>row.symbol===first).recentMomentumGate.entryAllowed=false;const row=rows.find(row=>row.symbol===first);row.price=candidates.find(candidate=>candidate.symbol===first).sourcePrice*1.1;}],
  ['explicit global exposure failure',({policy})=>{policy.purchaseEligibilityComplete=false;policy.purchaseBlocks[first]='account-exposure-unverified';}],
  ['unknown account completeness',({policy})=>{delete policy.purchaseEligibilityComplete;policy.purchaseBlocks[first]='account-exposure-unverified';}],
  ['opening unavailable',({input,policy})=>{policy.purchaseBlocks[first]='account-exposure-unverified';input.openingPlan=null;input.manualRecommendations=null;}],
  ['market closed',({policy})=>{policy.purchaseBlocks[first]='account-exposure-unverified';},new Date('2026-11-11T23:00:00Z')],
  ['zero eligible Watch rows',({policy})=>{policy.blockedSymbols=[...spec.symbols];}],
 ];
 for(const [index,[label,edit,at=f.now]]of variants.entries()){
  const input=clone(base),decision=clone(input.executionDecision||input.decision),policy=decision.accountPolicy;
  policy.purchaseBlocks={...policy.purchaseBlocks};edit({input,decision,policy,candidates:decision.stockScreen.candidates,rows:input.screenRows});
  const id='fictional-watch-exposure-frame-'+index;decision.actionVersion=id;decision.decisionId=id;policy.identity=id;policy.decisionId=id;
  decision.stockScreen={...decision.stockScreen,decisionId:id,accountPolicy:policy};input.decision=decision;input.executionDecision=decision;
  if(input.openingPlan)input.openingPlan={...input.openingPlan,actionVersion:id,accountPolicy:policy};
  if(input.manualRecommendations)input.manualRecommendations={...input.manualRecommendations,decisionId:id,actionVersion:id};
  const inputBytes=JSON.stringify(input),current=join(input,{readTime:()=>at}),previous=priorJoin(input,{readTime:()=>at});
  assert.equal(unexplain(current),JSON.stringify(previous),label+': exact prior join preserves all rankings, counts, reasons, gates, actions and quantities apart from the authorized sentence');
  const projection=current.projection,selection=projection.watchSelection,diagnostic=selection.diagnostics.find(row=>row.symbol===first);
  same(names(selection),names(previous.projection.watchSelection),label+': current top ten order and retained source ranks are unchanged');
  assert(selection.rows.length<=10);assert.equal(selection.diagnostics.length,50,'The display cap does not truncate source diagnostics');
  if(label==='complete account, stock-only gap'){
   assert.equal(selection.executionReadiness.purchaseEligibilityComplete,true);assert(!selection.commonWaitReasons.includes('account-exposure-unverified'));
   assert.equal(diagnostic.currentChecks.purchaseBlock,'account-exposure-unverified');
   assert(diagnostic.waitReasons.includes('recent-entry-trigger-wait')&&diagnostic.waitReasons.includes('entry-gap-limit'),'Independent momentum and gap failures remain raw evidence');
   const why=selection.rows.find(row=>row.symbol===first).screenReview.why;assert(why.includes(candidateText)&&!why.includes(accountText));
   assert(why.includes('Recent momentum has not cleared the Buy/Add trigger.')&&why.includes('The current opening gap blocks buying.'));
   same(projection.actionableBuys,baseline.projection.actionableBuys,'Correcting a non-entry monitor sentence cannot change existing checked Buy quantities');
  }else if(label==='explicit global exposure failure'){
   assert(selection.commonWaitReasons.includes('account-exposure-unverified'));assert.equal(policy.purchaseEligibilityComplete,false);
   assert(selection.rows.every(row=>row.screenReview.why.includes(accountText)),'A demonstrated shared account failure keeps the account warning');
  }else if(label==='unknown account completeness'){
   assert(!Object.hasOwn(policy,'purchaseEligibilityComplete'));assert(!selection.commonWaitReasons.includes('account-exposure-unverified'));
   assert(selection.rows.find(row=>row.symbol===first).screenReview.why.includes(candidateText),'Unknown context remains an incomplete stock check, not account verification success');
  }else if(label==='opening unavailable')assert(selection.commonWaitReasons.includes('opening-checks-unavailable'));
  else if(label==='market closed')assert.equal(selection.executionReadiness.marketOpen,false);
  else assert.equal(selection.rows.length,0,'No names are manufactured to fill a download report');
  const tree=render(projection),html=renderToStaticMarkup(tree),watchHtml=html.slice(html.indexOf('aria-label="Watch opportunities"'));
  const button=elements(tree).filter(node=>node.type==='button'&&text(node)==='Download Watch details');
  assert.equal(button.length,1,label+': the real View offers the read-only export even without opening checks, during market closure, or with zero Watch names');
  assert.equal(button[0].props.type,'button');assert(!button[0].props.disabled);
  same([...watchHtml.matchAll(/<tr[^>]*><td[^>]*>(\d+)<\/td>/g)].map(match=>Number(match[1])),selection.rows.map((row,i)=>i+1),'Visible Watch numbering remains consecutive strongest-first');
  const beforeDownloads=downloadState.blobs.length;button[0].props.onClick();assert.equal(downloadState.blobs.length,beforeDownloads+1,'Actual button calls actual existing export');
  const blob=downloadState.blobs.at(-1),report=JSON.parse(await blob.text()),link=downloadState.links.at(-1);
  assert.equal(blob.type,'application/json');same(report,clone(details.buildC1WatchDetails(selection)));expectAllowlist(report);
  assert.equal(report.candidates.length,50,'The downloaded evidence preserves the full supported candidate scan, not just ten rows');
  assert.equal(link.download,'C1-Watch-details-2026-11-10.json');assert.equal(link.clicks,1);assert.equal(link.removes,1);assert.equal(downloadState.appended.at(-1),link);
  const timer=downloadState.timers.at(-1);assert.equal(timer.delay,30000);timer.fn();assert.equal(downloadState.revoked.at(-1),link.href);
  assert.equal(JSON.stringify(input),inputBytes,'Rendering and downloading leave every supplied financial and verification input unchanged');
 }
 const polluted=clone(baseline.projection.watchSelection),marker='NEVER_EXPORT_FICTIONAL_ACCOUNT_SECRET';
 Object.assign(polluted,{syncKey:marker,account:{private:marker},cash:12345,filledOrders:[{private:marker}],riskBySleeve:{private:marker},localStorage:{private:marker}});
 Object.assign(polluted.diagnostics[0],{accountId:marker,actualFill:{private:marker}});polluted.diagnostics[0].currentChecks.secret=marker;
 polluted.diagnostics[0].waitReasons.push(marker);polluted.waitCounts[marker]=1;
 const safe=details.buildC1WatchDetails(polluted);expectAllowlist(safe);assert(!JSON.stringify(safe).includes(marker),'Export cannot include extra account fields, unknown reasons or storage data');
 assert.equal(JSON.stringify({account:f.account,book:f.book}),financialBefore,'Preparation, selector, UI and export never write fixture account or accepted input records');
 console.log('PASS: actual Watch selector/join distinguishes stock-only incomplete checks from explicit account-wide failure without changing any old flags, raw reasons, order, ranks, actions or quantities; real View export remains available for closed/missing/zero states and downloads only allowlisted evidence without requests or account writes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
