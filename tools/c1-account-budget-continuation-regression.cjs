const assert=require('node:assert/strict');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const f=createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[{symbol:'CASH',role:'Swing',shares:30000,avgCost:1}]});
const names=[...Array.from({length:24},(_,i)=>'EXPENSIVE'+String(i+1).padStart(2,'0')),'AFFORDABLE25'];
const sourceHistory=f.sessions.slice(0,221);
for(const session of sourceHistory){
 const template=session.signals[0],benchmarkPrices=session.prices.filter(p=>['SPY','QQQ'].includes(p.symbol));
 const step=sourceHistory.indexOf(session);
 const prices=names.map((symbol,index)=>{const close=index<24?8000+step*.001:100+step*.001;return {symbol,date:session.date,open:close,high:close*1.001,low:close*.999,close,volume:10000000,adjusted:true};});
 const signals=names.map((symbol,index)=>({...template,symbol,sector:'Sector'+index,issuer:'Issuer'+index,price:prices[index].close,
  researchFactors:{...template.researchFactors,momentumPercentile:100-index,volatility60Pct:20,factorCoverage:3},
  entryTiming:{...template.entryTiming,symbol,available:true,asOf:session.date,macdImproving:true,liquidityPass:true,averageDollarVolume20:500000000}}));
 session.prices=[...prices,...benchmarkPrices];session.signals=signals;session.positionSignals=signals;session.universeSymbols=[...names];
}
const baseline=sourceHistory.at(-1),date='2026-11-11',now=new Date(date+'T17:00:00.000Z');
const opening={date,decisionAt:now.toISOString(),universeSymbols:[...names],corporateActions:[],
 currentEventEvidence:currentEventEvidenceFor(names,now),prices:baseline.prices.map(p=>({...p,date,open:p.close,observedPrice:p.close,observedAt:now.toISOString()}))};
const {buildC1AccountPolicy}=f.loader.load('lib/c1AccountPolicy.js');
const {C1_OPERATIONAL_RISK_MODE}=f.loader.load('lib/c1OperationalRiskDecision.js');
const policy={...buildC1AccountPolicy(f.account,{date,now}),operationalRiskDecision:{status:'approved',mode:C1_OPERATIONAL_RISK_MODE}};
const {c1AccountBooks}=f.loader.load('lib/c1AccountLedger.js');
const {projectC1AccountSession}=f.loader.load('lib/c1AccountProjection.js');
const before=JSON.stringify(f.account);
const plan=projectC1AccountSession({adoption:f.account.adoption,baseline,opening,observedAt:now.toISOString(),books:c1AccountBooks(f.account.adoption),sessions:[baseline],historySessions:sourceHistory,
 accountPolicy:policy,brokerageCashAvailable:30000,purchaseFundingIndependent:true,additionalSwingCapacity:true,prospectiveSwingStopPolicy:'c1-new-swing-initial-stop-10-v1'});
const buys=plan.orders.filter(o=>o.side==='buy');
assert(buys.length>0,'The real projector must continue to affordable rank25 after 24 zero-whole-share candidates: '+JSON.stringify({selected:plan.additionalSwingCapacity.symbols,affordable:plan.additionalSwingCapacity.reviews.find(r=>r.symbol==='AFFORDABLE25'),blocks:plan.accountPolicy.purchaseBlocks,skips:plan.entryReviews.slice(0,5)}));
assert(buys.every(o=>o.symbol==='AFFORDABLE25'),'Unaffordable leaders never reserve selected slots or economic priority');
assert(plan.additionalSwingCapacity.symbols.includes('AFFORDABLE25'));
assert.equal(plan.accountPolicy.purchaseEligibilityComplete,true);
assert.equal(names.slice(0,24).filter(s=>plan.accountPolicy.purchaseBlocks[s]).length,24);
assert.equal(JSON.stringify(f.account),before,'Hypothetical projection does not edit actual holdings, fills, cash or adoption');
assert.equal(plan.riskBySleeve.base.operationalRisk.purchaseRiskReady,true,'An isolated approved risk reference permits the behavioral comparison; live configuration remains pending');

// Four distinct account stocks can be represented in different books. A
// qualified stock held elsewhere may enter as another book's fourth holding
// without using a fifth account slot.
const shared=createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[
 {symbol:'MRNA',role:'Swing',shares:1,avgCost:100,openedAt:'2026-11-10'},
 ...['BBB','CCC','DDD'].map(symbol=>({symbol,role:'Swing',shares:60,avgCost:100,openedAt:'2026-11-10'})),
 {symbol:'CASH',role:'Swing',shares:20000,avgCost:1}]});
const sharedSource=shared.sessions.slice(0,221),sharedBaseline=sharedSource.at(-1),sharedOpening=shared.opening();
const sharedPolicy={...shared.loader.load('lib/c1AccountPolicy.js').buildC1AccountPolicy(shared.account,{date,now}),operationalRiskDecision:{status:'approved',mode:C1_OPERATIONAL_RISK_MODE}};
const sharedBooks=shared.loader.load('lib/c1AccountLedger.js').c1AccountBooks(shared.account.adoption);
assert.equal(Object.keys(sharedBooks.base.positions).length,3);assert(!sharedBooks.base.positions.MRNA);
assert.equal(new Set(Object.values(sharedBooks).flatMap(b=>Object.keys(b.positions))).size,4);
const sharedPlan=shared.loader.load('lib/c1AccountProjection.js').projectC1AccountSession({adoption:shared.account.adoption,baseline:sharedBaseline,opening:sharedOpening,observedAt:now.toISOString(),books:sharedBooks,
 sessions:[sharedBaseline],historySessions:sharedSource,accountPolicy:sharedPolicy,brokerageCashAvailable:20000,purchaseFundingIndependent:true,additionalSwingCapacity:true,prospectiveSwingStopPolicy:'c1-new-swing-initial-stop-10-v1'});
assert(sharedPlan.orders.some(o=>o.sleeve==='base'&&o.symbol==='MRNA'&&o.side==='buy'&&o.additionalCapacity===true),'An existing global holding may occupy another allocation fourth book position');
assert(sharedPlan.additionalSwingCapacity.eligibleSymbols.includes('MRNA'));
assert(!sharedPlan.additionalSwingCapacity.symbols.includes('MRNA'),'Adding an already held symbol consumes zero distinct-account capacity');
assert.equal(new Set(Object.values(sharedPlan.projectedBooks).flatMap(b=>Object.keys(b.positions))).size,4);
assert.equal(shared.account.adoption.seeds.base.accountPolicyVersion,'c1-account-policy-v2');
assert.throws(()=>createWorkflowFixture('buy',{baselineDate:'2026-11-09',portfolio:[
 {symbol:'MRNA',role:'Swing',shares:1,avgCost:100,openedAt:'2026-11-09'},
 ...['BBB','CCC','DDD'].map(symbol=>({symbol,role:'Swing',shares:60,avgCost:100,openedAt:'2026-11-09'})),
 {symbol:'CASH',role:'Swing',shares:20000,avgCost:1}]}),/frozen sleeve position count/,'Historical unversioned adoption retains its original three-position guard');
assert.throws(()=>createWorkflowFixture('buy',{baselineDate:'2026-11-10',portfolio:[
 ...['MRNA','BBB','CCC','DDD','EEE'].map(symbol=>({symbol,role:'Swing',shares:4,avgCost:100,openedAt:'2026-11-10'})),
 {symbol:'CASH',role:'Swing',shares:20000,avgCost:1}]}),/at most four distinct Swing stocks/,'The fifth distinct account stock remains disallowed');
console.log('PASS: real dated account projection skips 24 individually unaffordable candidates, advances rank25, keeps source/cash/stop/exposure/four-position rules and actual account immutable. Synthetic behavior only.');
