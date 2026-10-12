const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const root=process.cwd();
const plain=value=>JSON.parse(JSON.stringify(value));

// Exact reviewed base sources; this proof does not depend on CI Git history.
const fixtures=[
  ['lib/c1AccountSeed.js','tools/fixtures/c1-account-seed-9097e89.js','c252e5f7c96d55b44aa8aa56dd10f57102d5968617bacadab6f47cb53506147e'],
  ['lib/marketSession.js','tools/fixtures/c1-market-session-9097e89.js','2b12b67b5000249f05431908e21c8b8e0979d881f2390d11430287aafe818cc6'],
  ['lib/c1AccountSimulator.js','tools/fixtures/c1-account-simulator-9097e89.js','15aecf5479fa496bb7fe232f8367aab2c4d37597bba0c347b2064e38e1886e4b'],
  ['lib/c1AccountLedger.js','tools/fixtures/c1-account-ledger-9097e89.js','f861123083c1d08c825808cf76e479cd00cc59eba5eefa24e29d2a286aaa9a77'],
  ['lib/c1AccountProjection.js','tools/fixtures/c1-account-projection-9097e89.js','63805fbd73e5fa28a48fa3adcf38e1c313430f9c36dd820e7225b52e9afbc53b'],
  ['lib/c1AccountService.js','tools/fixtures/c1-account-service-9097e89.js','0ddc751280d9d639866ef1945dbc4aa082e152005afa1b612139353315863355'],
];
const sources=new Map(fixtures.map(([target,fixture,sha256])=>{
  const bytes=fs.readFileSync(fixture);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,'Immutable base source changed: '+fixture);
  return [path.join(root,target),bytes.toString()];
}));
function modules(){
  const loader=createResearchModuleLoader(root);
  return {service:loader.load('lib/c1AccountService.js'),ledger:loader.load('lib/c1AccountLedger.js'),
    seed:loader.load('lib/c1AccountSeed.js'),account:loader.load('lib/c1AccountSimulator.js').simulatePointInTimePortfolio,
    execution:loader.load('lib/c1AccountExecution.js'),intraday:loader.load('lib/c1IntradayActivity.js'),
    context:loader.load('lib/c1PositionContext.js'),market:loader.load('lib/marketSession.js'),
    options:loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS,
    signature:loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature};
}
const readFileSync=fs.readFileSync;
let baseline;
try{
  fs.readFileSync=function(file,options){
    const source=sources.get(path.resolve(String(file)));
    return source===undefined?readFileSync.apply(this,arguments):
      typeof options==='string'||options?.encoding?source:Buffer.from(source);
  };
  baseline=modules();
}finally{fs.readFileSync=readFileSync;}
const current=modules();
const symbols=['AAA','BBB','CCC'];
function session(date){
  return {date,decisionAt:date+'T22:00:00Z',universeSymbols:symbols,corporateActions:[],
    prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,high:101,low:99,close:100,volume:5000000,adjusted:true})),
    signals:symbols.map((symbol,index)=>({symbol,sector:'Sector'+index,companyName:symbol,cik:String(index+1),price:100,
      researchFactors:{momentumPercentile:99-index,volatility60Pct:20},
      entryTiming:{available:true,asOf:date,liquidityPass:true,averageDollarVolume20:500000000}}))};
}
// Synthetic adjusted bars on actual trading dates only. There is no Jan9 bar.
const history=[session('2025-01-08'),session('2025-01-10'),session('2025-01-13')];
const book={universe:'sp500',model:{sessions:history.slice(0,2)},
  captures:history.slice(0,2).map(s=>({sessionDate:s.date,hash:'source-'+s.date,observedAt:s.decisionAt}))};
const now=new Date('2025-01-10T22:00:00Z');
const portfolio=[{symbol:'AAA',role:'Swing',shares:4,avgCost:100,openedAt:'2025-01-09'},
  {symbol:'CASH',role:'Swing',shares:9600,avgCost:1}];
const capitalRecord={version:2,highWater:10000,triggerDay:null,
  portfolioSignature:baseline.signature(portfolio),reconciliationRequired:false};
assert.equal(baseline.market.isUsMarketSessionDay('2025-01-09'),true);
assert.equal(current.market.isUsMarketSessionDay('2025-01-09'),false);
const saved=baseline.service.adoptC1Account({portfolio,capitalRecord,book,now});
saved.positionContext=[{symbol:'AAA',stage:'full',purchases:[{date:'2025-01-09',shares:4,cost:100}],
  source:'owner-confirmed-brokerage-evidence',openingShares:4,openingCost:400}];
const original=JSON.stringify({saved,book,portfolio,capitalRecord});
const continuationArgs={adoption:saved.adoption,sessions:[history[1]],historySessions:book.model.sessions,records:[],observedAt:now};
const oldRun=baseline.ledger.continueC1ActualAccount(continuationArgs);
const newRun=current.ledger.continueC1ActualAccount(continuationArgs);
const oldDecision=baseline.service.evaluateC1Account({account:saved,book,now});
const newDecision=current.service.evaluateC1Account({account:saved,book,now});
assert.deepEqual(plain(newRun.books),plain(oldRun.books),'Every saved sleeve retains exact cash, shares, basis and literal purchase date');
assert.equal(newRun.actualCash,9600);
assert.equal(newDecision.positions[0].shares,4);
assert.equal(newDecision.positions[0].avgCost,100);
assert.equal(newDecision.positions[0].openedAt,'2025-01-09','Historical metadata is never silently moved');
assert.equal(newDecision.strategyCash,oldDecision.strategyCash);
assert.ok(newDecision.positions[0].reviewRules.every(rule=>rule.heldSessions===1),'Age uses the corrected closed-day calendar');
for(const sleeve of Object.keys(current.options)){
  assert.deepEqual(plain(newRun.sleeves[sleeve].trades),plain(oldRun.sleeves[sleeve].trades));
  assert.deepEqual(plain(newRun.sleeves[sleeve].accountRisk),plain(oldRun.sleeves[sleeve].accountRisk));
  assert.equal(newRun.sleeves[sleeve].openPositions[0].stopPrice,86);
  assert.equal(newRun.sleeves[sleeve].openPositions[0].enteredAt,'2025-01-09');
}
const oldHistory=oldRun.holdingPriceHistory.AAA,newHistory=newRun.holdingPriceHistory.AAA;
assert.equal(oldHistory.sessionsObserved,1);assert.equal(oldHistory.expectedSessions,2);assert.equal(oldHistory.complete,false);
assert.equal(newHistory.from,'2025-01-09');assert.equal(newHistory.sessionsObserved,1);
assert.equal(newHistory.expectedSessions,1);assert.equal(newHistory.complete,true,'Only actual market sessions require bars');
const poison=session('2025-01-09');
poison.prices.find(row=>row.symbol==='AAA').high=999;
const poisonedHistory=[history[0],poison,history[1]];
const cleanEvidence=current.seed.c1HistoricalPriceEvidence(saved.adoption.seeds.base.positions[0],poisonedHistory,
  '2025-01-10',{historicalAdoption:true});
assert.deepEqual(plain(cleanEvidence),plain(newHistory),'A supplied closure bar cannot add coverage or a false peak');
assert.equal(cleanEvidence.high,101);assert.equal(cleanEvidence.sessionsObserved,1);
const cleanAdoption=current.seed.withC1HistoricalPriceEvidence(saved.adoption,poisonedHistory,{historicalAdoption:true});
assert.equal(current.seed.c1SeedPosition(cleanAdoption.seeds.base.positions[0],0,'2025-01-10',100).highWatermark,101);
assert.equal(poison.prices.find(row=>row.symbol==='AAA').high,999,'Rejected price evidence is never rewritten');
assert.equal(JSON.stringify({saved,book,portfolio,capitalRecord}),original);

// Completed empty activity remains immutable; historical metadata adds no fill.
const advanced=plain(saved),laterBook={...book,model:{sessions:history},
  captures:history.map(s=>({sessionDate:s.date,hash:'source-'+s.date,observedAt:s.decisionAt}))};
advanced.records=[{date:'2025-01-13',complete:true,openingObservedAt:'2025-01-13T15:00:00Z',fills:[]}];
advanced.sourceHashes.push({date:'2025-01-13',hash:'source-2025-01-13'});
const advancedOriginal=JSON.stringify(advanced),laterNow=new Date('2025-01-13T22:00:00Z');
const later=current.service.evaluateC1Account({account:advanced,book:laterBook,now:laterNow});
assert.equal(later.positions[0].shares,4);assert.equal(later.strategyCash,9600);
assert.equal(later.positions[0].openedAt,'2025-01-09');
assert.ok(later.positions[0].reviewRules.every(rule=>rule.heldSessions===2));
assert.equal(JSON.stringify(advanced),advancedOriginal);
const corrected=current.service.correctC1AccountOpenedAt({account:advanced,symbol:'AAA',openedAt:'2025-01-08',
  expectedRevision:advanced.revision,book:laterBook,now:laterNow});
const correctedDecision=current.service.evaluateC1Account({account:corrected,book:laterBook,now:laterNow});
assert.equal(correctedDecision.positions[0].openedAt,'2025-01-08');
assert.equal(correctedDecision.positions[0].shares,4);assert.equal(correctedDecision.strategyCash,9600);
for(const field of ['records','sourceHashes','positionContext'])assert.deepEqual(plain(corrected[field]),plain(advanced[field]));
for(const sleeve of Object.keys(current.options)){
  const {positions:oldPositions,...oldSeed}=advanced.adoption.seeds[sleeve];
  const {positions:newPositions,...newSeed}=corrected.adoption.seeds[sleeve];
  assert.deepEqual(plain(newSeed),plain(oldSeed),'Correction preserves seed cash, units, peak and cooldown');
  assert.deepEqual(plain(newPositions.map(({openedAt,...position})=>position)),plain(oldPositions.map(({openedAt,...position})=>position)));
}
assert.equal(corrected.corrections.at(-1).previousDates[0],'2025-01-09');
assert.equal(JSON.stringify(advanced),advancedOriginal);

// The capability belongs to disposable position objects, never persisted JSON.
const enriched=current.seed.withC1HistoricalPriceEvidence(saved.adoption,book.model.sessions,{historicalAdoption:true});
for(const sleeve of Object.keys(current.options)){
  const config={...current.options[sleeve],startDate:'2025-01-10',endDate:'2025-01-10',liquidateAtEnd:false};
  assert.equal(current.account({sessions:[history[1]]},config,enriched.seeds[sleeve]).openPositions[0].enteredAt,'2025-01-09');
  assert.throws(()=>current.account({sessions:[history[1]]},config,saved.adoption.seeds[sleeve]),/original holding date/);
  assert.throws(()=>current.account({sessions:[history[1]]},config,plain(enriched.seeds[sleeve])),/original holding date/);
  const forged={...plain(enriched.seeds[sleeve]),historicalAdoption:true};
  for(const position of forged.positions)position.historicalAdoption=true;
  assert.throws(()=>current.account({sessions:[history[1]]},config,forged),/original holding date/,'Serialized compatibility flags provide no capability');
  const invalidAsOf={...enriched.seeds[sleeve],asOfSession:'2025-01-09'};
  assert.throws(()=>current.seed.validateC1AccountSeed(invalidAsOf,{...config,startDate:'2025-01-09'},[history[1]]),/completed-close session/);
}
const firstPlan=current.execution.planC1ActualAccountOpening({adoption:enriched,baseline:history[1],opening:history[2],observedAt:'2025-01-13T15:00:00Z'});
assert.equal(firstPlan.date,'2025-01-13');assert.deepEqual(plain(firstPlan.openingBooks),plain(newRun.books));
assert.equal(firstPlan.providerVerified,false);assert.equal(firstPlan.executable,false);
assert.throws(()=>current.seed.withC1HistoricalPriceEvidence(saved.adoption,book.model.sessions),/Holding basis, dates/);
for(const openedAt of ['2025-01-01','2025-01-11','2025-02-30']){
  const other=plain(saved.adoption);
  for(const seed of Object.values(other.seeds))for(const position of seed.positions)position.openedAt=openedAt;
  assert.throws(()=>current.seed.withC1HistoricalPriceEvidence(other,book.model.sessions,{historicalAdoption:true}),/Holding basis, dates/);
}
assert.throws(()=>current.service.adoptC1Account({portfolio,capitalRecord,book,now}),/Original entry date/);
assert.throws(()=>current.service.adoptC1Account({portfolio:portfolio.map(position=>({...position,historicalAdoption:true})),capitalRecord,book,now}),/Original entry date/);
assert.throws(()=>current.service.correctC1AccountOpenedAt({account:corrected,symbol:'AAA',openedAt:'2025-01-09',
  expectedRevision:corrected.revision,book:laterBook,now:laterNow}),/valid first-purchase date/);
assert.throws(()=>current.context.recordC1PositionContext({account:saved,expectedRevision:saved.revision,now,
  context:{contract:'c1-position-context-v1',positions:[saved.positionContext[0]]}}),/Valid dated purchase/);

// Saved metadata never authorizes a new trade or a fabricated closure session.
const closedPlan={contract:'c1-actual-account-opening-plan-v1',date:'2025-01-09',sourceSessionDate:'2025-01-08',
  observedAt:'2025-01-09T15:00:00Z',openingBooks:newRun.books,
  orders:[{id:'new-buy',sleeve:'base',symbol:'BBB',side:'buy',shares:1,estimatedPrice:100,phase:3}]};
const ticket={id:'new-ticket',symbol:'BBB',side:'buy',shares:1,price:100,fee:0,executedAt:'2025-01-09T15:00:00Z'};
assert.throws(()=>current.ledger.reconcileC1ActualAccountFills({plan:closedPlan,fills:[{...ticket,orderId:'new-buy'}],
  observedAt:'2025-01-09T16:00:00Z'}),/Invalid actual execution time/);
assert.throws(()=>current.intraday.recordC1IntradayActivity({account:saved,plan:closedPlan,ticket,
  expectedRevision:saved.revision,now:new Date('2025-01-09T16:00:00Z')}),/actual regular-session trade/);
assert.throws(()=>current.service.appendC1AccountSession({account:saved,
  record:{date:'2025-01-09',complete:true,fills:[]},book,expectedRevision:saved.revision,now}),/Observed session input missing/);
assert.equal(JSON.stringify({saved,book,portfolio,capitalRecord}),original);
console.log('PASS: exact approved Jan9 adoption retains literal date, cash, shares, basis, stops, capital and history; correction preserves economics; real session counts replace the closure defect; compatibility is disposable and cannot admit new adoption, target date, purchase context, session or fill on Jan9.');
