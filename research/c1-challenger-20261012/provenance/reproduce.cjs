// Research-only three-session fixtures. No historical or production execution.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {createResearchModuleLoader} = require('../imported/source/tools/research-module-loader.cjs');
const root = path.resolve(__dirname, '../imported/source');
const originalRead = fs.readFileSync;
const fixtures = [
  {rule:'age-30-top6', rankWithSCHW:7, openedAt:'2026-07-01', price:100,
   expectedReason:'rank-deterioration', expectedDate:'2026-09-02'},
  {rule:'profit-top6-two-session', rankWithSCHW:7, openedAt:'2026-08-24', price:120,
   expectedReason:'profit-rank-deterioration', expectedDate:'2026-09-03'},
  {rule:'early-top9-three-session', rankWithSCHW:10, openedAt:'2026-08-24', price:100,
   expectedReason:'early-rank-deterioration', expectedDate:'2026-09-04'},
];
const refs = [
  {ref:'e2b98471311fb702113baf0ca64473b92ccfd142',file:'e2-simulator.js',
   expectedHash:'aa9171972572607cbe63fbe68911c0825f4d67113e5ebf2649704d04f4cf6e13'},
  {ref:'006e067697385143684c7417b18bc7909c2d217e',file:'audit-simulator.js',
   expectedHash:'2c5e4036d4fac8992c8bedbeb0899c627a82e3b54b4f1cf59e924409dc95ac83'},
];
const dates = ['2026-09-01','2026-09-02','2026-09-03','2026-09-04'];
const digest = source => crypto.createHash('sha256').update(source).digest('hex');
const marketSource = originalRead(path.join(__dirname,'shared-market-session.js'),'utf8');
const evidence=[];
for (const ref of refs) {
  const source = originalRead(path.join(__dirname,ref.file),'utf8');
  assert.equal(digest(source),ref.expectedHash,'Commit source identity changed');
  fs.readFileSync = (file,...args) => {
    const absolute = path.resolve(String(file));
    if (absolute === path.join(root,'lib/c1AccountSimulator.js')) return source;
    if (absolute === path.join(root,'lib/marketSession.js')) return marketSource;
    return originalRead(file,...args);
  };
  let loaded;
  try {
    const loader = createResearchModuleLoader(root);
    loaded={...loader.load('lib/c1AccountSimulator.js'),...loader.load('lib/c1FrozenOptions.js')};
  } finally { fs.readFileSync = originalRead; }
  for (const fixture of fixtures) {
    const symbols=['SCHW',...Array.from({length:fixture.rankWithSCHW-2},(_,i)=>'A'+(i+1)),'HELD','LAST'];
    const sessions=dates.map(date => {
      const signals=symbols.map((symbol,index)=>({symbol,sector:'Sector '+index,cik:String(100+index),
        companyName:symbol,price:fixture.price,researchFactors:{momentumPercentile:100-index,volatility60Pct:20},
        entryTiming:{available:true,asOf:date,liquidityPass:true,averageDollarVolume20:500000000}}));
      return {date,decisionAt:date+'T21:00:00Z',signals,positionSignals:signals,universeSymbols:symbols,
        corporateActions:[],prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:fixture.price,
          high:fixture.price+1,low:fixture.price-1,close:fixture.price,adjusted:true}))};
    });
    const config={...loaded.C1_FROZEN_OPTIONS.base,startDate:dates[0],endDate:dates.at(-1),liquidateAtEnd:false};
    const heldIndex=symbols.indexOf('HELD');
    const seed={contract:'c1-prospective-account-seed-v1',sleeve:'base',asOfSession:dates[0],
      prospectiveAdoptionConfirmed:true,cash:0,highWater:100000,remainingCooldownSessions:0,
      positions:[{symbol:'HELD',role:'Swing',shares:100000/fixture.price,entryPrice:100,
        openedAt:fixture.openedAt,inheritedRiskOnly:false,sector:'Sector '+heldIndex,issuer:String(100+heldIndex),
        stock:{symbol:'HELD',sector:'Sector '+heldIndex}}]};
    const run=loaded.simulatePointInTimePortfolio({sessions},config,seed);
    const heldSells=JSON.parse(JSON.stringify(run.trades.filter(t=>t.symbol==='HELD'&&t.side==='sell').map(t=>({date:t.date,reason:t.reason}))));
    const audit=ref.file==='audit-simulator.js';
    assert.deepEqual(heldSells,audit?[]:[{date:fixture.expectedDate,reason:fixture.expectedReason}]);
    evidence.push({ref:ref.ref,simulatorSha256:digest(source),rule:fixture.rule,
      rankWithSCHW:fixture.rankWithSCHW,rankWithoutSCHW:fixture.rankWithSCHW-1,
      schwRankEligible:loaded.c1AccountRankEligible(sessions[0].signals[0],config),heldSells});
  }
}
const result={contract:'c1-two-source-holding-rank-provenance-synthetic-v1',
  scope:'Four invented offline sessions only; no historical replay, account write, strategy modification or production action.',
  sharedCalendarSha256:digest(marketSource),fixtures,evidence};
fs.writeFileSync(path.join(__dirname,'synthetic-holding-rank-evidence.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:true,fixtures:fixtures.length,sources:refs.length,evidence}));
