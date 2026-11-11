// Synthetic accepted observations through the real account -> classifier ->
// publication join. These checks establish software behavior, not returns.
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
  const row=session[field].find(row=>row.symbol===promote);row.researchFactors.momentumPercentile=73.5;
 }
 f.setCash(100000);
 const before=JSON.stringify({account:f.account,book:f.book});
 const view=await f.prepare();
 const events=new Map(currentEventEvidenceFor(spec.symbols,f.now).map(row=>[row.symbol,row]));
 const screenRows=f.screenRows().map(row=>({...row,eventRisk:events.get(row.symbol)}));
 const input={...view,screenRows,positionRows:screenRows,screenCurrent:true,portfolio:f.portfolio};
 const {joinC1Opportunities}=f.loader.load('lib/c1OpportunitiesContract.js');
 const join=value=>joinC1Opportunities(value,{readTime:()=>f.now});
 const joined=join(input);
 assert.equal(JSON.stringify({account:f.account,book:f.book}),before,'Preparing and joining Watch cannot alter account or accepted input history');
 return {f,spec,input,joined,join};
}

function changed(base,edit){
 const input=copy(base.input),decision=copy(input.executionDecision||input.decision);
 edit({input,decision,rows:input.screenRows,candidates:decision.stockScreen.candidates,policy:decision.accountPolicy});
 // A synthetic coherent server frame keeps all views on one current version.
 // Financial records, checked order quantities and input histories stay fixed.
 const id='synthetic-current-watch-frame:'+ ++frame;
 decision.actionVersion=id;decision.decisionId=id;
 decision.accountPolicy={...decision.accountPolicy,identity:id,decisionId:id};
 decision.stockScreen={...decision.stockScreen,decisionId:id,accountPolicy:decision.accountPolicy};
 input.decision=decision;input.executionDecision=decision;
 input.actionVersion=id;
 input.openingPlan={...input.openingPlan,actionVersion:id,accountPolicy:decision.accountPolicy};
 input.manualRecommendations={...input.manualRecommendations,decisionId:id,actionVersion:id};
 return input;
}

async function run(){
 const base=await prepare(),{spec,input,joined,join}=base;
 assert.equal(joined.evidence.verified,true);assert.equal(joined.evidence.ratings.length,50);
 assert.equal(input.decision.stockScreen.candidates.length,50,'A ten-row presentation cannot truncate the full accepted selection universe');
 const originalBuys=copy(joined.projection.actionableBuys);
 eq(names(originalBuys),['X12','X13','X14'],'The real checked account recommendations remain unchanged');
 const expected=spec.symbols.slice(27,37);
 eq(names(joined.projection.watchView.rows),expected,'Current eligible Watch starts at source rank 28 and ends at rank 37');
 eq(joined.projection.watch.map(row=>input.decision.stockScreen.candidates.find(candidate=>candidate.symbol===row.symbol).researchRank),[28,29,30,31,32,33,34,35,36,37]);
 assert.equal(joined.projection.watchSelection.limit,10);assert.equal(joined.projection.watchSelection.verified,true);
 assert.equal(joined.projection.watchSelection.totalEligible,23);
 assert.equal(joined.projection.watchSelection.candidateCount,50);
 const baselineBytes=JSON.stringify(input);

 const targets=spec.symbols.slice(27,38);
 const filteredInput=changed(base,({input,decision,rows,candidates,policy})=>{
  policy.blockedSymbols=[...policy.blockedSymbols,targets[0]];
  policy.stockCooldowns=[...(policy.stockCooldowns||[]),{symbol:targets[0],active:true,expiresAfterSession:'2026-11-20',resumesOn:'2026-11-23'}];
  decision.activeExitSymbols=[targets[1]];
  candidates.find(row=>row.symbol===targets[2]).sourcePurchaseGate={eligible:false,reason:'Synthetic accepted volatility exceeds the unchanged source limit.'};
  const event=rows.find(row=>row.symbol===targets[3]).eventRisk;
  event.status='Blocked';event.blockNewCapital=true;event.eventVerification.state='VERIFIED_BLOCKED';
  delete rows.find(row=>row.symbol===targets[4]).eventRisk;
  rows.find(row=>row.symbol===targets[5]).recommendation.expertDecision.metrics.quoteFreshnessPass=false;
  input.portfolio.push({symbol:targets[6],role:'Swing',shares:1,avgCost:100});
  policy.purchaseBlocks={...policy.purchaseBlocks,[targets[7]]:'account-issuer-limit'};
  decision.selectionEvidence={...(decision.selectionEvidence||{}),complete:true,unverifiedSymbols:[targets[8]]};
  candidates.find(row=>row.symbol===targets[9]).recentMomentumGate.entryAllowed=false;
  candidates.find(row=>row.symbol===targets[10]).recentMomentumGate.available=false;
 });
 const filtered=join(filteredInput);
 assert.equal(filtered.evidence.ratings.length,50,'Hard Watch filtering cannot remove rows from the real classifier/purchase universe');
 eq(names(filtered.projection.watchView.rows),spec.symbols.slice(38,48),'Known cooldown, exit, source, event, history, quote, ownership and account failures are excluded before counting ten');
 assert(filtered.projection.watchView.rows.every(row=>!targets.includes(row.symbol)));
 eq(filtered.projection.actionableBuys.map(order=>({symbol:order.symbol,shares:order.shares})),originalBuys.map(order=>({symbol:order.symbol,shares:order.shares})),'Filtering unselected Watch candidates cannot change checked account quantities');

 const first=expected[0];
 for(const reason of ['brokerage-cash-insufficient','account-position-limit','account-sector-position-limit','account-concentration-limit',
  'account-issuer-limit','account-allocation-whole-share-limit','account-allocation-trade-size-limit','account-exposure-unverified','entry-gap-limit','entry-invalidated-at-open']){
  const value=join(changed(base,({policy})=>{policy.purchaseBlocks={...policy.purchaseBlocks,[first]:reason};}));
  assert(!names(value.projection.watchView.rows).includes(first),'Concrete purchase restriction remains excluded: '+reason);
  assert.equal(value.projection.watchView.rows.length,10);
 }
 const waiting=join(changed(base,({policy,candidates,rows})=>{
  policy.purchaseBlocks={...policy.purchaseBlocks,[first]:'not-in-entry-queue'};
  const candidate=candidates.find(row=>row.symbol===first);candidate.sourceTiming.pass=false;candidate.sourceTiming.strongPass=false;
  const observed=rows.find(row=>row.symbol===first);observed.entryTiming.pass=false;observed.entryTiming.strongPass=false;
 }));
 assert(names(waiting.projection.watchView.rows).includes(first),'Verified entry-trigger waiting and generic queue absence alone do not create a new exclusion');
 const openingMissing=join(changed(base,({decision})=>{decision.selectionEvidence={...(decision.selectionEvidence||{}),complete:true,unverifiedSymbols:spec.symbols.slice(27)};}));
 assert.equal(openingMissing.projection.watchView.rows.length,0,'Clear screen receipts cannot override missing latest opening event evidence');
 assert.equal(openingMissing.projection.watchSelection.totalEligible,0);

 const five=join(changed(base,({policy})=>{policy.blockedSymbols=[...policy.blockedSymbols,...spec.symbols.slice(27,45)];}));
 eq(names(five.projection.watchView.rows),spec.symbols.slice(45),'Fewer than ten are displayed honestly when only five currently qualify');
 assert.equal(five.projection.watchSelection.totalEligible,5);assert.equal(five.projection.watchSelection.verified,true);
 const none=join(changed(base,({policy})=>{policy.blockedSymbols=[...policy.blockedSymbols,...spec.symbols.slice(27)];}));
 assert.equal(none.projection.watchView.rows.length,0);assert.equal(none.projection.watchSelection.totalEligible,0);
 for(const edit of [
  ({input})=>{input.screenCurrent=false;},
  ({decision})=>{decision.current=false;},
  ({decision})=>{decision.stockScreen.sourceSessionDate='2026-11-09';},
  ({decision})=>{delete decision.stockScreen.scan;},
  ({decision})=>{decision.stockScreen.scan.complete=false;},
  ({policy})=>{policy.complete=false;},
  ({policy})=>{policy.purchaseEligibilityComplete=false;},
  ({rows})=>{rows[0].dataFeedSnapshotStale=true;}
 ]){
  const result=join(changed(base,edit));
  assert.equal(result.projection.watchView.rows.length,0,'Unverified/stale source or account frames cannot publish a current Watch list');
  assert.equal(result.projection.watchSelection.verified,false);
  assert.equal(result.projection.watchSelection.totalEligible,null,'Unverified does not mean zero eligible stocks');
 }
 const mismatched=join({...input,executionDecision:{...input.executionDecision,revision:input.decision.revision+1}});
 assert.equal(mismatched.projection.watchView.rows.length,0,'Competing account revisions cannot mix Watch and checked order versions');
 const previous=copy(joined.evidence);previous.ratings.reverse();
 previous.ratings.forEach((row,index)=>{row.priority=-1000-index;row.appearanceCount=10000;});
 const recurring=join({...input,previousEvidence:previous});
 eq(names(recurring.projection.watchView.rows),expected,'Previous appearances, priority and ordering confer neither promotion nor a repeated-name penalty');

 const next=await prepare({date:'2026-11-11',promote:'X30'});
 assert.equal(next.joined.evidence.ratings.length,50);
 eq(names(next.joined.projection.actionableBuys),['X12','X13','X14']);
 eq(names(next.joined.projection.watchView.rows),['X30',...expected.slice(0,9)],'A newly stronger later accepted observation displaces the former tenth Watch name');
 assert(!names(next.joined.projection.watchView.rows).includes(expected[9]));
 assert.notEqual(next.input.decision.sourceSessionDate,input.decision.sourceSessionDate);
 assert.notEqual(next.joined.evidence.key,joined.evidence.key,'Later-source rank is a new immutable decision frame');
 eq(JSON.stringify(input),baselineBytes,'No Watch projection rewrites earlier accepted rankings, recorded fills, balances or prior decisions');
 console.log('PASS: real fifty-name account/classifier/publication path, current eligible top-ten Watch, hard restrictions before counting, entry-trigger waits, zero/fewer-ten honesty, stale/version isolation, unchanged checked quantities and later-source displacement without appearance priority.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
