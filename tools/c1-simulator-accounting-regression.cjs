const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {restoreSimulatorAccounting,extractSimulatorAccounting,accountingModuleSource}=require('./c1-simulator-accounting-extraction.cjs');
const root=process.cwd(),hash=x=>createHash('sha256').update(x).digest('hex');
const currentSource=fs.readFileSync('lib/c1AccountSimulator.js','utf8');
const originalSource=restoreSimulatorAccounting(currentSource);
assert.equal(hash(originalSource),'63b1909359361e35ae7d0c2e833fecbb043013f7b337f9f2c96dc0a3adb2f31e','Restoring the accounting phase must recover the exact pre-extraction engine');
assert.equal(extractSimulatorAccounting(originalSource),currentSource,'Mechanical extraction must have exactly the declared seams');
assert.equal(accountingModuleSource(originalSource),fs.readFileSync('lib/c1SimulatorAccounting.js','utf8'),'Module contains the original accounting body in its exact wrapper');
// Keep every immutable oracle and prior generated Challenger independent.
const pins={
 'lib/c1FrozenSimulator.js':'2d2c94f532f1370453f93c6d488d4f19d896e97ee636e2aae79ad9e201cbecf3',
 'lib/c1LegacyAccountSimulator.js':'f87a1d94d200444056884972158e290d0442548bf131aa4b38ab23f3c687b659',
 'lib/c1RecentMomentumChallengerSimulator.js':'ca08f31539bb4e306251dd11ada2ae204af78d850c23644ffa617b752923d905',
 'tools/fixtures/c1-account-simulator-9097e89.js':'15aecf5479fa496bb7fe232f8367aab2c4d37597bba0c347b2064e38e1886e4b'
};
for(const [file,pin] of Object.entries(pins))if(pin)assert.equal(hash(fs.readFileSync(file)),pin,file+' immutable oracle');
const originalFetch=global.fetch;let networkCalls=0;
global.fetch=()=>{networkCalls++;throw Error('Unexpected network in synthetic accounting parity');};
const same=(a,b,label)=>assert.deepEqual(structuredClone(a),structuredClone(b),label);
const loader=createResearchModuleLoader(root);
const current=loader.load('lib/c1AccountSimulator.js');
const {createC1SimulatorAccounting}=loader.load('lib/c1SimulatorAccounting.js');
// The unchanged frozen source supplies the original helper semantics and phase
// oracle; definitions are loaded only. No experiment or walk-forward runner runs.
const frozen=fs.readFileSync('lib/c1FrozenSimulator.js','utf8');
const box={console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,JSON};vm.createContext(box);
vm.runInContext(frozen.replace(/^export /gm,'')+'\nglobalThis.accountingOracle={number,optionalNumber,clamp,round,average,standardDeviation,STOP_EXIT_REASONS,metricsFromCurve};',box);
const metrics=createC1SimulatorAccounting(box.accountingOracle).metricsFromCurve;
let phaseCases=0,fullCases=0;
const comparePhase=(curve,trades=[],benchmark=[],benchmarks={})=>{const before=JSON.stringify([curve,trades,benchmark,benchmarks]);same(metrics(curve,trades,benchmark,benchmarks),box.accountingOracle.metricsFromCurve(curve,trades,benchmark,benchmarks),'Complete accounting output parity '+phaseCases);assert.equal(JSON.stringify([curve,trades,benchmark,benchmarks]),before,'Accounting cannot mutate observations, trades or benchmarks');phaseCases++;};
comparePhase([]);comparePhase([{date:'2026-01-02',equity:0,cash:0}]);
// Fixed deterministic software fixtures cover absent/exact exposures, clamping,
// benchmark gaps, partial/closed trades, stop classifications, zeros and losses.
for(let fixture=0;fixture<160;fixture++){
 const count=1+fixture%25;
 const curve=Array.from({length:count},(_,i)=>({date:String(i).padStart(3,'0'),equity:fixture%11===0?0:100000+(i%5-2)*1379+fixture*17,cash:fixture%3===0?200000:i%2?12345:0,...(fixture%4===0?{activeExposure:(i%4-1)*.8,benchmarkExposure:(i%3-1)*1.2}:{}),benchmarkSleeveValue:i%2?1000:0}));
 const benchmark=curve.filter((_,i)=>fixture%5!==0||i%2===0).map((r,i)=>({date:r.date,value:fixture%13===0?0:100+i*(fixture%2?-2:3)}));
 const trades=Array.from({length:fixture%9},(_,i)=>({side:i%2?'sell':'buy',positionId:Math.floor(i/2),positionClosed:i%3!==0,shares:3+i,price:90+i,roundTripPnl:i%3?-20*i:100,realizedPnl:i%2?-33:44,reason:['initial-stop','ratcheted-stop','rank-deterioration','profit-trailing-stop','owner-discretionary-exit'][i%5],holdingSessions:2+i,mfePct:i,maePct:-i}));
 comparePhase(curve,trades,benchmark,{SPY:benchmark,QQQ:benchmark.map(r=>({...r,value:r.value*1.03}))});
}
const scratch=fs.mkdtempSync(path.join(root,'work','c1-accounting-parity-'));
try{
 fs.cpSync(path.join(root,'lib'),path.join(scratch,'lib'),{recursive:true});
 fs.writeFileSync(path.join(scratch,'lib/c1AccountSimulator.js'),originalSource);
 const original=createResearchModuleLoader(scratch).load('lib/c1AccountSimulator.js');
 const {C1_FROZEN_OPTIONS:options}=loader.load('lib/c1FrozenOptions.js');
 const {C1_ACCOUNT_SEED_CONTRACT:contract}=loader.load('lib/c1AccountSeed.js');
 const {isUsMarketSessionDay}=loader.load('lib/marketSession.js');
 const sessions=[],symbols=Array.from({length:12},(_,i)=>'T'+i);
 for(let time=Date.parse('2026-03-02T12:00:00Z');sessions.length<80;time+=86400000){
  const date=new Date(time).toISOString().slice(0,10);if(!isUsMarketSessionDay(date))continue;
  const day=sessions.length;
  const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{const prior=day?sessions.at(-1).prices[i].close:100,close=prior*(day===25||day===55?.84:1+.001*(i%3+1));return{symbol,open:prior,close,high:Math.max(prior,close)*1.01,low:Math.min(prior,close)*.99,volume:10000000,adjusted:true};});
  sessions.push({date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,prices,signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:prices[i].close,researchFactors:{momentumPercentile:100-((i+Math.floor(day/18)*4)%12),volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
 }
 const inputBefore=JSON.stringify(sessions);
 function compareRun(label,opts,seed=null,executions=null){
  const inputs=[{sessions},opts,seed,executions],before=JSON.stringify(inputs);
  const actual=current.simulatePointInTimePortfolio(...structuredClone(inputs));
  const expected=original.simulatePointInTimePortfolio(...structuredClone(inputs));
  same(actual,expected,label+': full config/metrics/curve/benchmarks/trades/positions/cash/queue/diagnostics');
  for(const [start,end] of [[sessions[10].date,sessions[30].date],[sessions[40].date,sessions[60].date],['2099-01-01','2099-01-02']])same(current.slicePointInTimePortfolioRun(actual,start,end),original.slicePointInTimePortfolioRun(expected,start,end),label+': full chronological slice');
  assert.equal(JSON.stringify(inputs),before,'Caller-owned inputs remain unchanged');fullCases++;
  return actual;
 }
 for(const [sleeve,config] of Object.entries(options)){
  for(const liquidateAtEnd of [false,true])compareRun(sleeve+' modeled '+liquidateAtEnd,{...config,startDate:sessions[0].date,endDate:sessions.at(-1).date,liquidateAtEnd});
  const baseline=sessions[35],price=baseline.prices.find(p=>p.symbol==='T4').close;
  const seed={contract,sleeve,asOfSession:baseline.date,prospectiveAdoptionConfirmed:true,cash:100000-10*price,highWater:100000,remainingCooldownSessions:0,positions:[{symbol:'T4',role:'Swing',shares:10,entryPrice:price,openedAt:sessions[0].date,sector:'Sector0',issuer:'symbol:T4'}]};
  const opts={...config,startDate:baseline.date,endDate:sessions.at(-1).date,liquidateAtEnd:false};
  compareRun(sleeve+' seeded',opts,seed);
  compareRun(sleeve+' retained drawdown',opts,{...seed,highWater:120000});
  compareRun(sleeve+' cash-only',opts,{...seed,cash:100000,positions:[]});
  const replayOpts={...opts,endDate:sessions[37].date};
  const emptyReplay={contract:'c1-actual-fill-replay-v1',sessions:[{date:sessions[36].date,fills:[]},{date:sessions[37].date,fills:[]}]};
  compareRun(sleeve+' actual unfilled',replayOpts,seed,emptyReplay);
  const saleReplay=structuredClone(emptyReplay);saleReplay.sessions[0].fills=[{symbol:'T4',side:'sell',reason:'owner-discretionary-exit',shares:2,price:91,fee:.5}];
  const sold=compareRun(sleeve+' actual partial sale',replayOpts,seed,saleReplay);
  assert(sold.trades.some(t=>t.side==='sell'&&t.shares===2),'Golden fixture exercises recorded actual sale');
 }
 assert.equal(JSON.stringify(sessions),inputBefore,'Synthetic observation history remains unchanged');
}finally{fs.rmSync(scratch,{recursive:true,force:true});global.fetch=originalFetch;}
assert.equal(networkCalls,0,'No network/provider/account requests');
fs.mkdirSync('work/simulator-accounting',{recursive:true});
fs.writeFileSync('work/simulator-accounting/parity.json',JSON.stringify({scope:'Synthetic offline software parity only; no research experiment or production/account/provider call',phaseCases,fullSimulatorCases:fullCases,chronologicalSlices:fullCases*3,restoredCanonicalSha256:hash(originalSource),networkCalls,completeObjectsEqual:true,immutablePinsUnchanged:true},null,2)+'\n');
console.log(`PASS: ${phaseCases} complete accounting objects; ${fullCases} full simulator golden outputs and ${fullCases*3} slices across three sleeves, modeled/seeded/stopped/drawdown/actual-fill paths; exact canonical source restored, immutable pins retained, zero network.`);
