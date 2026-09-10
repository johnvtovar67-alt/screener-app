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
