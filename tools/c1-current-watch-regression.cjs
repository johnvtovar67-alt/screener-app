// Synthetic accepted observations through the real account -> classifier ->
// publication join. Monitoring is distinct from immediate execution authority.
// No production data, provider calls, financial writes or performance claims.
const assert=require('node:assert/strict');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const names=rows=>rows.map(row=>row.symbol);
const eq=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
let frame=0;

async function prepare({date='2026-11-10',promote=null}={}){
 const f=createWorkflowFixture('buy',{baselineDate:date,portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}]});
 const spec=applyAccountPolicyUniverseFixture(f,{count:50});
 if(promote)for(const session of f.sessions)for(const field of ['signals','positionSignals']){
  session[field].find(row=>row.symbol===promote).researchFactors.momentumPercentile=73.5;
 }
 f.setCash(100000);
 const before=JSON.stringify({account:f.account,book:f.book});
 const view=await f.prepare();
 const events=new Map(currentEventEvidenceFor(spec.symbols,f.now).map(row=>[row.symbol,row]));
 const screenRows=f.screenRows().map(row=>({...row,eventRisk:events.get(row.symbol)}));
 const input={...view,screenRows,positionRows:screenRows,screenCurrent:true,portfolio:f.portfolio};
 const {joinC1Opportunities}=f.loader.load('lib/c1OpportunitiesContract.js');
 const join=(value,at=f.now)=>joinC1Opportunities(value,{readTime:()=>at});
 const joined=join(input);
 assert.equal(JSON.stringify({account:f.account,book:f.book}),before,'Watch cannot alter financial history or accepted market observations');
 return {f,spec,input,joined,join};
}

function changed(base,edit){
 const input=copy(base.input),decision=copy(input.executionDecision||input.decision);
 edit({input,decision,rows:input.screenRows,candidates:decision.stockScreen.candidates,policy:decision.accountPolicy});
 const id='synthetic-dated-watch-frame:'+ ++frame;
 decision.actionVersion=id;decision.decisionId=id;
 decision.accountPolicy={...decision.accountPolicy,identity:id,decisionId:id};
 decision.stockScreen={...decision.stockScreen,decisionId:id,accountPolicy:decision.accountPolicy};
 input.decision=decision;input.executionDecision=decision;input.actionVersion=id;
 input.openingPlan={...input.openingPlan,actionVersion:id,accountPolicy:decision.accountPolicy};
 input.manualRecommendations={...input.manualRecommendations,decisionId:id,actionVersion:id};
 return input;
}
const diagnostic=(joined,symbol)=>joined.projection.watchSelection.diagnostics.find(row=>row.symbol===symbol);

async function run(){
 const base=await prepare(),{spec,input,joined,join}=base;
 const originalBuys=copy(joined.projection.actionableBuys),expected=spec.symbols.slice(27,37),baselineBytes=JSON.stringify(input);
 assert.equal(joined.evidence.verified,true);assert.equal(joined.evidence.ratings.length,50);
 assert.equal(input.decision.stockScreen.candidates.length,50,'The full dated selection universe remains intact');
 eq(names(originalBuys),['X12','X13','X14']);
 eq(names(joined.projection.watchView.rows),expected,'Healthy monitoring omits the three displayed opportunity cards and preserves source ranks 28–37');
 eq(joined.projection.watchView.rows.map(row=>row.priority),[28,29,30,31,32,33,34,35,36,37]);
 const selection=joined.projection.watchSelection;
 assert.equal(selection.limit,10);assert.equal(selection.verified,true);assert.equal(selection.totalEligible,23);
 assert.equal(selection.candidateCount,50);assert.equal(selection.diagnostics.length,50);
 assert.equal(selection.counts.displayed,10);assert.equal(selection.counts.omittedInOpportunities,3);
 assert.equal(selection.counts.excluded,24,'The fixture has twenty-four known source-volatility exclusions');
 assert.equal(selection.counts.datedUnverified,0);
 assert(selection.rows.every(row=>row.monitoring===true&&!row.order&&!row.shares),'Watch rows never create an order or a quantity');

 // All of these are dated monitoring candidates with an execution wait, not
 // hard exclusions. The real classifier still withholds purchase authority.
 const first=expected[0];
 for(const reason of ['not-in-entry-queue','brokerage-cash-insufficient','account-position-limit','account-sector-position-limit',
  'account-concentration-limit','account-issuer-limit','account-allocation-whole-share-limit','account-allocation-trade-size-limit',
  'account-exposure-unverified','entry-gap-limit','entry-invalidated-at-open']){
  const value=join(changed(base,({policy})=>{policy.purchaseBlocks={...policy.purchaseBlocks,[first]:reason};}));
  assert(names(value.projection.watchView.rows).includes(first),'Execution-only restriction becomes WAIT: '+reason);
  assert(diagnostic(value,first).waitReasons.includes(reason));
  assert.deepEqual([...diagnostic(value,first).rejectionReasons],[]);
  assert.equal(value.projection.watchView.rows.length,10);
  eq(value.projection.actionableBuys.map(order=>({symbol:order.symbol,shares:order.shares})),originalBuys.map(order=>({symbol:order.symbol,shares:order.shares})));
 }
 const waits=[
  ['event-unverified',({rows})=>{delete rows.find(row=>row.symbol===first).eventRisk;}],
  ['quote-unverified',({rows})=>{rows.find(row=>row.symbol===first).recommendation.expertDecision.metrics.quoteFreshnessPass=false;}],
  ['quote-unverified',({rows})=>{rows.find(row=>row.symbol===first).dataFeedSnapshotStale=true;}],
  ['recent-entry-trigger-wait',({candidates})=>{candidates.find(row=>row.symbol===first).recentMomentumGate.entryAllowed=false;}],
  ['recent-momentum-unavailable',({candidates})=>{candidates.find(row=>row.symbol===first).recentMomentumGate.available=false;}],
  ['entry-timing-unavailable',({candidates})=>{candidates.find(row=>row.symbol===first).sourceTiming.available=false;}],
  ['entry-trigger-wait',({candidates})=>{const row=candidates.find(row=>row.symbol===first);row.sourceTiming.pass=false;row.sourceTiming.strongPass=false;}],
  ['current-entry-evidence-unverified',({decision})=>{decision.selectionEvidence={...(decision.selectionEvidence||{}),complete:true,unverifiedSymbols:[first]};}],
  ['account-verification-required',({decision})=>{decision.accountMismatch=true;}],
  ['account-policy-unverified',({policy})=>{policy.complete=false;}],
  ['account-exposure-unverified',({policy})=>{policy.purchaseEligibilityComplete=false;}]
 ];
 for(const [code,edit] of waits){
  const value=join(changed(base,edit));
  assert.equal(value.projection.watchView.rows.length,10,'Execution uncertainty must not erase dated monitoring: '+code);
  assert(names(value.projection.watchView.rows).includes(first));
  assert(diagnostic(value,first).waitReasons.includes(code),'WAIT is explicit and structured: '+code);
  assert.equal(diagnostic(value,first).eligible,true);
  assert.equal(value.projection.watchSelection.verified,true,'Dated source readiness is independent of live execution readiness');
 }
 const noLive=join({...copy(input),screenRows:[],positionRows:[],screenCurrent:false,openingPlan:null,manualRecommendations:null,openingError:'Synthetic opening checks unavailable'});
 eq(names(noLive.projection.watchView.rows),spec.symbols.slice(24,34),'Without displayed Buy cards the highest ten dated monitoring candidates remain visible');
 assert.equal(noLive.projection.actionableBuys.length,0);
 assert(noLive.projection.watch.every(row=>row.waitReasons.includes('quote-unverified')&&row.waitReasons.includes('event-unverified')&&row.waitReasons.includes('opening-checks-unavailable')));
 assert.equal(noLive.projection.watchSelection.executionReadiness.evidencePending,true);
 const noOpening=join({...copy(input),openingPlan:null,manualRecommendations:null});
 assert.equal(noOpening.projection.watchView.rows.length,10);assert.equal(noOpening.projection.actionableBuys.length,0);
 assert(noOpening.projection.watch.every(row=>row.waitReasons.includes('opening-checks-unavailable')));
 // The normal page masks its display decision during account verification;
 // matching unmodified server evidence may still prove the dated source.
 const pageMasked=join({...input,decision:{...input.decision,current:false,accountMismatch:true,opportunities:[]}});
 eq(names(pageMasked.projection.watchView.rows),spec.symbols.slice(24,34),'A local execution mask retains the highest ten dated monitors when the captured server source still matches');
 assert.equal(pageMasked.projection.watchSelection.verified,true);
 assert.equal(pageMasked.projection.watchSelection.executionReadiness.accountMismatch,true);
 assert.equal(pageMasked.projection.watchSelection.executionReadiness.displayDecisionMasked,true);
 assert.equal(pageMasked.projection.watchSelection.executionReadiness.displayDecisionCurrent,false);
 assert.equal(pageMasked.projection.watchSelection.executionReadiness.serverDatedCurrent,true);
 assert.equal(pageMasked.projection.actionableBuys.length,0,'Source proof for monitoring must not restore Buy authorization masked by the page');
 assert(pageMasked.projection.watch.every(row=>row.waitReasons.includes('account-verification-required')));
 const closed=join(input,new Date('2026-11-11T23:00:00Z'));
 assert.equal(closed.projection.watchView.rows.length,10);assert.equal(closed.projection.actionableBuys.length,0);
 assert.equal(closed.projection.watchSelection.executionReadiness.marketOpen,false);
 assert(closed.projection.watch.every(row=>row.waitReasons.includes('market-closed')));

 // Known exclusions remain hard, and are considered before taking ten.
 const targets=spec.symbols.slice(27,34);
 const hard=join(changed(base,({input,decision,rows,candidates,policy})=>{
  policy.blockedSymbols=[...policy.blockedSymbols,targets[0]];
  decision.activeExitSymbols=[targets[1]];
  input.portfolio.push({symbol:targets[2],role:'Swing',shares:1,avgCost:100});
  const event=rows.find(row=>row.symbol===targets[3]).eventRisk;
  event.status='Blocked';event.blockNewCapital=true;event.eventVerification.state='VERIFIED_BLOCKED';
  candidates.find(row=>row.symbol===targets[4]).volatility60Pct=200;
  candidates.find(row=>row.symbol===targets[5]).sourcePrice=4;
  candidates.find(row=>row.symbol===targets[6]).sourceTiming.averageDollarVolume20=100;
 }));
 eq(names(hard.projection.watchView.rows),spec.symbols.slice(34,44));
 const hardReasons=['account-stock-cooldown','active-account-exit','already-held','verified-corporate-event-block','dated-volatility','dated-source-price','dated-liquidity'];
 targets.forEach((symbol,index)=>{
  assert.equal(diagnostic(hard,symbol).status,'excluded');
  assert(diagnostic(hard,symbol).rejectionReasons.includes(hardReasons[index]));
 });
 eq(hard.projection.actionableBuys.map(order=>({symbol:order.symbol,shares:order.shares})),originalBuys.map(order=>({symbol:order.symbol,shares:order.shares})),'Monitoring changes neither checked Buy quantities nor current entry checks');
 for(const field of ['researchRank','policyScore','sourcePrice','factorCoverage','volatility60Pct']){
  const unknown=join(changed(base,({candidates})=>{delete candidates.find(row=>row.symbol===first)[field];}));
  const row=diagnostic(unknown,first);
  assert.equal(row.status,'dated-unverified');assert(row.unknownReasons.length>0);
  assert.equal(unknown.projection.watchSelection.provisional,true,'Missing dated input is not replaced by a fabricated structural pass');
  assert(!names(unknown.projection.watchView.rows).includes(first));
 }
 const five=join(changed(base,({policy})=>{policy.blockedSymbols=[...policy.blockedSymbols,...spec.symbols.slice(27,45)];}));
 eq(names(five.projection.watchView.rows),spec.symbols.slice(45));assert.equal(five.projection.watchSelection.totalEligible,5);
 const none=join(changed(base,({policy})=>{policy.blockedSymbols=[...policy.blockedSymbols,...spec.symbols.slice(27)];}));
 assert.equal(none.projection.watchView.rows.length,0);assert.equal(none.projection.watchSelection.totalEligible,0);
 for(const edit of [
  ({decision})=>{decision.current=false;},
  ({decision})=>{decision.stockScreen.sourceSessionDate='2026-11-09';},
  ({decision})=>{delete decision.stockScreen.scan;},
  ({decision})=>{decision.stockScreen.scan.complete=false;},
  ({decision})=>{decision.stockScreen.scan.sourceSessionDate='2026-11-09';}
 ]){
  const value=join(changed(base,edit));
  assert.equal(value.projection.watchView.rows.length,0,'Unverified or mixed dated sources cannot manufacture a monitoring list');
  assert.equal(value.projection.watchSelection.verified,false);assert.equal(value.projection.watchSelection.totalEligible,null);
  assert(value.projection.watchSelection.sourceProblems.length>0);
 }
 const mixed=join({...input,executionDecision:{...input.executionDecision,revision:input.decision.revision+1}});
 assert.equal(mixed.projection.watchView.rows.length,0,'Competing account/source revisions do not publish mixed Watch and Buy frames');
 const mixedSource=join({...input,executionDecision:{...input.executionDecision,sourceSessionDate:'2026-11-09'}});
 assert.equal(mixedSource.projection.watchView.rows.length,0,'A captured server decision from another source date cannot bypass the page mask or establish dated monitoring proof');
 const previous=copy(joined.evidence);previous.ratings.reverse();
 previous.ratings.forEach((row,index)=>{row.priority=-1000-index;row.appearanceCount=10000;});
 eq(names(join({...input,previousEvidence:previous}).projection.watchView.rows),expected,'Prior appearances confer neither priority nor a repeated-name penalty');
 const next=await prepare({date:'2026-11-11',promote:'X30'});
 eq(names(next.joined.projection.actionableBuys),['X12','X13','X14']);
 eq(names(next.joined.projection.watchView.rows),['X30',...expected.slice(0,9)],'A stronger later dated rank displaces the former tenth monitoring candidate');
 assert.notEqual(next.joined.evidence.key,joined.evidence.key);
 // The downloadable diagnostic report must be useful for every accepted
 // source candidate without becoming a serialization of private account props.
 const {buildC1WatchDetails}=base.f.loader.load('lib/c1WatchDetails.js');
 const sentinel='PRIVATE_ACCOUNT_TEST_SENTINEL_DO_NOT_EXPORT';
 const contaminated=copy(selection);
 Object.assign(contaminated,{syncKey:sentinel,credentials:{token:sentinel},account:{cash:sentinel},
  ledger:[sentinel],positions:[sentinel],fills:[sentinel],browserStorage:{account:sentinel}});
 contaminated.executionReadiness.credentials=sentinel;
 contaminated.counts.cash=sentinel;contaminated.waitCounts[sentinel]=42;
 contaminated.sourceProblems.push(sentinel);
 for(const row of contaminated.diagnostics){
  Object.assign(row,{syncKey:sentinel,credentials:{token:sentinel},account:{cash:sentinel},
   positions:[sentinel],fills:[sentinel],cash:sentinel,raw:{account:sentinel}});
  row.sourceTiming.credentials=sentinel;row.recentMomentum.credentials=sentinel;
  row.currentChecks.credentials=sentinel;row.currentChecks.entryChecks.credentials=sentinel;
  row.waitReasons.push(sentinel);row.rejectionReasons.push(sentinel);row.unknownReasons.push(sentinel);
 }
 contaminated.diagnostics[0].currentChecks.purchaseBlock=sentinel;
 const report=buildC1WatchDetails(contaminated),serialized=JSON.stringify(report);
 assert(!serialized.includes(sentinel),'The download must not leak arbitrary selection, account, credential or raw diagnostic fields');
 assert.equal(report.contract,'c1-watch-monitoring-details-v1');assert.equal(report.sourceSessionDate,'2026-11-10');
 assert.equal(report.candidates.length,50,'The export diagnoses the complete dated candidate set, not just the ten cards');
 assert.equal(report.source.verified,true);assert.equal(report.source.complete,true);assert.equal(report.source.candidateCount,50);
 assert.equal(report.counts.displayed,10);assert.equal(report.counts.omittedInOpportunities,3);assert.equal(report.counts.excluded,24);
 eq(Object.keys(report).sort(),['contract','sourceSessionDate','exportedAt','note','source','counts','rejectionCounts','unknownCounts','waitCounts','reasonDefinitions','commonWaitReasons','executionReadiness','candidates'].sort());
 assert.match(report.reasonDefinitions['market-closed'],/market is closed/i,'The full safe reason text accompanies diagnostic codes');
 const downloaded=report.candidates.find(row=>row.symbol===first),original=diagnostic(joined,first);
 for(const field of ['researchRank','policyScore','momentumPercentile','sourcePrice','factorCoverage','volatility60Pct','return120Ex20','return60Ex5']){
  assert.equal(downloaded[field],typeof original[field]==='number'&&Number.isFinite(original[field])?original[field]:null,'Export preserves the actual dated metric '+field);
 }
 eq(Object.keys(downloaded).sort(),['symbol','sector','researchRank','policyScore','momentumPercentile','sourcePrice','factorCoverage','volatility60Pct','return120Ex20','return60Ex5','sourceTiming','recentMomentum','rating','status','eligible','omittedInOpportunities','rejectionReasons','unknownReasons','waitReasons','currentChecks'].sort());
 eq(Object.keys(downloaded.currentChecks).sort(),['rowPresent','clientSnapshotFallback','dataFeedSnapshotStale','entryPass','openingUnverified','event','purchaseBlock','entryChecks'].sort());
 assert.equal(report.candidates[0].currentChecks.purchaseBlock,null,'An arbitrary private purchase-block string cannot cross the diagnostic boundary');
 const unavailableReport=buildC1WatchDetails(noLive.projection.watchSelection);
 assert.equal(unavailableReport.counts.displayed,10);assert.equal(unavailableReport.executionReadiness.openingPresent,false);
 assert(unavailableReport.candidates.some(row=>row.status==='displayed'&&row.waitReasons.includes('quote-unverified')&&row.waitReasons.includes('event-unverified')),'The export carries WAIT evidence even when live execution inputs are unavailable');
 eq(JSON.stringify(input),baselineBytes,'Earlier dated rankings, orders, balances and financial records stay unchanged');
 console.log('PASS: real fifty-name dated monitoring Watch, independent live WAIT diagnostics, market-closed/missing-evidence persistence, known exclusions, unknown dated facts, unchanged checked quantities, coherent current rank without appearance priority and allowlisted full-candidate diagnostic download.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
