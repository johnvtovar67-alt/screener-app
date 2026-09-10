const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const l=createResearchModuleLoader(process.cwd()),{simulatePointInTimePortfolio:run}=l.load('lib/c1FrozenSimulator.js');
const options=l.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS.base;
const line='    pendingDecisions: config.liquidateAtEnd ? [] : JSON.parse(JSON.stringify(pending)),\n';
const source=fs.readFileSync('lib/c1FrozenSimulator.js','utf8');assert.equal(source.split(line).length,2,'Only one observation-only extension');
const original=source.replace(line,'');assert.equal(createHash('sha256').update(original).digest('hex'),'bcf3cc3e89ac499319a2cbfab76e42fda3bda5ef72d2d45777959e73e6ad9e7d');
const box={console};vm.createContext(box);vm.runInContext(original.replace(/export /g,'')+'\nglobalThis.simulate=simulatePointInTimePortfolio;',box);
const symbols=Array.from({length:10},(_,i)=>'S'+i);
function session(date,open=100){return {date,decisionAt:date+'T20:00:00Z',universeSymbols:symbols,prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open,close:100,high:101,low:99,volume:10000000})),signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%5,price:100,researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))};}
const data={metadata:{},sessions:[session('2026-09-01'),session('2026-09-02')]};
const cfg={...options,startDate:'2026-09-01',endDate:'2026-09-01',liquidateAtEnd:false};
const first=run(data,cfg);assert.ok(first.pendingDecisions.some(x=>x.side==='buy'));assert.equal(first.trades.length,0,'Closing queue cannot fill on same day');
const {pendingDecisions,...legacyFields}=first;assert.equal(JSON.stringify(legacyFields),JSON.stringify(box.simulate(data,cfg)),'Observation cannot change any old result');
const future={...data,sessions:[data.sessions[0],session('2026-09-02',999)]};assert.equal(JSON.stringify(run(future,cfg).pendingDecisions),JSON.stringify(pendingDecisions),'Future session cannot alter earlier queue');
const second=run(data,{...cfg,endDate:'2026-09-02'});assert.ok(second.trades.some(t=>t.side==='buy'&&t.date==='2026-09-02'));
assert.equal(run(data,{...cfg,liquidateAtEnd:true}).pendingDecisions.length,0);
console.log('PASS: read-only pending decisions, original source identity, result parity, next-open timing and future-data isolation');

// Synthetic execution scenarios: no historical holdout is evaluated or retuned.
for (const [sleeve, frozen] of Object.entries(l.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS)) {
  const execute=(a,b)=>run({metadata:{},sessions:[a,b]}, {...frozen,startDate:a.date,endDate:b.date,liquidateAtEnd:false});
  const a=session('2026-09-01'), b=session('2026-09-02');
  const baseline=execute(a,b), buys=baseline.trades.filter(t=>t.side==='buy');
  assert.ok(buys.length>0 && buys.length<=3, sleeve+': candidate queue respects position cap');
  assert.ok(baseline.endingCash>=0, sleeve+': no borrowing');
  for(const t of buys){assert.equal(t.date,b.date);assert.ok(Number.isInteger(t.shares)&&t.shares>0);assert.ok(Math.abs(t.price-100.12)<1e-8,'12bps buy cost applied');}
  const changed=JSON.parse(JSON.stringify(b));
  changed.prices.forEach(p=>{p.close=125;p.high=130;p.low=95;});
  changed.signals.reverse();
  assert.equal(JSON.stringify(execute(a,changed).trades.filter(t=>t.side==='buy')),JSON.stringify(buys),sleeve+': later bar/closing signals cannot change opening purchases');
  const gap=session('2026-09-02',104);
  gap.prices.forEach(p=>{p.close=104;p.high=105;p.low=103;});
  const rejected=execute(a,gap);
  assert.equal(rejected.trades.filter(t=>t.side==='buy').length,0,sleeve+': 4% gap rejected');
  assert.ok(rejected.skippedOrders.some(t=>t.reason==='entry-gap-limit'));
  const absent=JSON.parse(JSON.stringify(b));absent.prices=absent.prices.filter(p=>!p.symbol.startsWith('S')||p.symbol==='SPY');
  assert.equal(execute(a,absent).trades.filter(t=>t.side==='buy').length,0,sleeve+': missing open cannot fill');
  const concentrated=JSON.parse(JSON.stringify(a));concentrated.signals.forEach(s=>s.sector='Only sector');
  const capped=execute(concentrated,b);
  assert.ok(capped.trades.filter(t=>t.side==='buy').length<=2,sleeve+': sector name cap');
  assert.ok(capped.endingCash>=frozen.initialCapital*(1-frozen.maxSectorPct)-200,sleeve+': sector capital cap');
}
console.log('PASS: all three frozen sleeves — opening timing, cash, whole shares, costs, future-bar isolation, gaps, missing prices and concentration');
