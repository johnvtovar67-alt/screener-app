// Synthetic software checks only: source snapshots and real account projection.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {verifyBaseline}=require('./selection.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const dates=['2026-09-01','2026-09-02','2026-09-03','2026-09-04'];
function fixture(symbols,price=100) {
  return dates.map(date=>{
    const signals=symbols.map((symbol,index)=>({symbol,sector:'Sector '+index,cik:String(100+index),
      companyName:symbol,price,researchFactors:{momentumPercentile:100-index,volatility60Pct:20},
      entryTiming:{available:true,asOf:date,liquidityPass:true,averageDollarVolume20:500000000}}));
    return {date,decisionAt:date+'T21:30:00Z',signals,positionSignals:signals,universeSymbols:symbols,
      corporateActions:[],prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:price,high:price+1,
        low:price-1,close:price,adjusted:true}))};
  });
}
function seed(sleeve,positions=[],cash=100000) {
  return {contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:dates[0],
    prospectiveAdoptionConfirmed:true,cash,highWater:100000,remainingCooldownSessions:0,positions};
}
const cases=[
  {rule:'age30-top6',rank:7,openedAt:'2026-07-01',price:100,reason:'rank-deterioration',date:dates[1]},
  {rule:'profit-top6-two',rank:7,openedAt:'2026-08-24',price:120,reason:'profit-rank-deterioration',date:dates[2]},
  {rule:'early-top9-three',rank:10,openedAt:'2026-08-24',price:100,reason:'early-rank-deterioration',date:dates[3]},
];
const checks=[];
for(const id of ['audit-historical','production-equivalent']) {
  const baseline=verifyBaseline(id);
  const {createResearchModuleLoader}=require(path.join(baseline.sourceRoot,'tools/research-module-loader.cjs'));
  const loader=createResearchModuleLoader(baseline.sourceRoot);
  const {simulatePointInTimePortfolio:simulate,c1AccountRankEligible}=loader.load('lib/c1AccountSimulator.js');
  const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
  const {projectC1AccountSession}=loader.load('lib/c1AccountProjection.js');
  const allocation=fixture(['SCHW','AAA','BBB','CCC']).slice(0,2);
  for(const [sleeve,config] of Object.entries(options)) {
    const run=simulate({sessions:allocation},{...config,startDate:dates[0],endDate:dates[1],liquidateAtEnd:false},seed(sleeve));
    const buys=plain(run.trades.filter(t=>t.side==='buy').map(t=>t.symbol));
    assert.deepEqual(buys,['AAA','BBB','CCC']);
    assert(run.trades.every(t=>Number.isSafeInteger(t.shares)&&t.shares>0));
    assert(run.curve.every(p=>p.cash>=0));
    assert.equal(c1AccountRankEligible(allocation[0].signals[0],config),id==='production-equivalent');
    checks.push({id,sleeve,check:'schw-allocation-excluded-rank-preserved-as-selected',buys,
      schwHoldingRankEligible:c1AccountRankEligible(allocation[0].signals[0],config)});
  }
  const weights={base:.25,cooldown15:.5,sector40:.25};
  const adoption={sourceSessionDate:dates[0],seeds:Object.fromEntries(Object.entries(weights).map(([sleeve,weight])=>
    [sleeve,{...seed(sleeve),actualDollarsPerModelDollar:weight}]))};
  const books=Object.fromEntries(Object.entries(weights).map(([sleeve,weight])=>[sleeve,{cash:100000*weight,positions:{}}]));
  const plan=projectC1AccountSession({adoption,baseline:allocation[0],opening:allocation[1],
    observedAt:dates[1]+'T14:00:00Z',books,sessions:[allocation[0]]});
  for(const sleeve of Object.keys(weights)) {
    assert.deepEqual(plain(plan.orders.filter(order=>order.sleeve===sleeve&&order.side==='buy').map(order=>order.symbol)),['AAA','BBB','CCC']);
    assert.equal(Object.keys(plan.projectedBooks[sleeve].positions).length,3);
    assert(plan.projectedBooks[sleeve].cash>=0);
  }
  assert.equal(plan.blockedOrders.length,0);
  checks.push({id,check:'actual-opening-projection-uses-freed-slot',sleeves:Object.keys(weights),blockedOrders:0});
  for(const test of cases) {
    const symbols=['SCHW',...Array.from({length:test.rank-2},(_,i)=>'A'+(i+1)),'HELD','LAST'];
    const sessions=fixture(symbols,test.price),index=symbols.indexOf('HELD');
    const holding={symbol:'HELD',role:'Swing',shares:100000/test.price,entryPrice:100,openedAt:test.openedAt,
      inheritedRiskOnly:false,sector:'Sector '+index,issuer:String(100+index),stock:{symbol:'HELD',sector:'Sector '+index}};
    const run=simulate({sessions},{...options.base,startDate:dates[0],endDate:dates.at(-1),liquidateAtEnd:false},seed('base',[holding],0));
    const sells=plain(run.trades.filter(t=>t.symbol==='HELD'&&t.side==='sell').map(t=>({date:t.date,reason:t.reason})));
    assert.deepEqual(sells,id==='production-equivalent'?[{date:test.date,reason:test.reason}]:[]);
    checks.push({id,check:test.rule,rankIncludingSCHW:test.rank,rankExcludingSCHW:test.rank-1,heldSells:sells});
  }
  verifyBaseline(id);
}
assert.throws(()=>verifyBaseline(),/Explicit baseline/);
assert.throws(()=>verifyBaseline('unknown'),/Unknown research baseline/);
const result={contract:'c1-separated-baseline-policy-synthetic-verification-v1',passed:true,
  scope:'Four invented sessions only. All three real account sleeves and real projection; no historical replay or production action.',
  baselines:['audit-historical','production-equivalent'].map(id=>{const b=verifyBaseline(id);return {id,sourceCommit:b.sourceCommit,sourceGraphSha256:b.sourceGraphSha256};}),checks};
fs.writeFileSync(path.join(__dirname,'policy-synthetic-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,checks:checks.length,baselines:result.baselines}));
