const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {restoreSimulatorAccounting}=require('./c1-simulator-accounting-extraction.cjs');
const {restoreSimulatorPhases,extractSimulatorPhases,phaseModuleSources,PHASE_HASHES}=require('./c1-simulator-phase-extraction.cjs');
const hash=source=>createHash('sha256').update(source).digest('hex');
const source=fs.readFileSync('lib/c1AccountSimulator.js','utf8');
const original=restoreSimulatorAccounting(source);
const prior=restoreSimulatorPhases(source);
assert.equal(hash(prior),'25efcc4661b39bfe86fa1fa4dca62735a8268caec4ae9e2ddb99dac64482bf4c','Exact PR334 canonical account simulator restored');
assert.equal(hash(original),'63b1909359361e35ae7d0c2e833fecbb043013f7b337f9f2c96dc0a3adb2f31e','All previous historical source pins remain exact');
assert.equal(extractSimulatorPhases(prior),source,'Every active-engine edit is a declared reversible phase seam');
for(const [file,expected] of Object.entries(phaseModuleSources(prior)))assert.equal(fs.readFileSync(file,'utf8'),expected,'Exact original phase bytes and declared wrapper: '+file);
const immutable={
 'tools/generate-c1-account-simulator.cjs':'da2963b8fcae5cf309b56176895021ed5ec82a82e446acc5350ba9933f034763',
 'tools/generate-c1-recent-momentum-challenger.cjs':'2644c7df6e2d92be174dfde242c0619f7fb2d3f3ab6060586161cd041ec02680',
 'lib/c1FrozenSimulator.js':'2d2c94f532f1370453f93c6d488d4f19d896e97ee636e2aae79ad9e201cbecf3',
 'lib/c1LegacyAccountSimulator.js':'f87a1d94d200444056884972158e290d0442548bf131aa4b38ab23f3c687b659',
 'lib/c1RecentMomentumChallengerSimulator.js':'ca08f31539bb4e306251dd11ada2ae204af78d850c23644ffa617b752923d905',
 'tools/fixtures/c1-account-simulator-9097e89.js':'15aecf5479fa496bb7fe232f8367aab2c4d37597bba0c347b2064e38e1886e4b'
};
for(const [file,pin] of Object.entries(immutable))assert.equal(hash(fs.readFileSync(file)),pin,file+' immutable source');
const originalFetch=global.fetch;let networkCalls=0;
global.fetch=()=>{networkCalls++;throw Error('No network is permitted in simulator phase characterization');};
const clone=value=>structuredClone(value);
const same=(a,b,label)=>assert.deepEqual(clone(a),clone(b),label);
try{
 const box={Math,Number,String,Object,Array,Set,Map,Boolean,JSON,Date};vm.createContext(box);
 vm.runInContext(original.replace(/^import .+\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.oracle={number,optionalNumber,clamp,average,symbolOf,factorOf,sectorOf,issuerOf,researchRank,crossSectionalRankContext,expandedResearchSource,entrySignalPool,entrySignalQualifies,persistenceEligible,tradePrice};',box);
 const oracle=box.oracle,loader=createResearchModuleLoader();
 const ranking=loader.load('lib/c1SimulatorRanking.js').createC1SimulatorRanking(oracle);
 const phases=loader.load('lib/c1SimulatorPhases.js').createC1SimulatorPhases({...oracle,...ranking});
 const block=(start,end,after='')=>{const a=original.indexOf(start,after?original.indexOf(after):0),b=original.indexOf(end,a);assert(a>=0&&b>a);return original.slice(a,b);};
 // Independent inline execution of the exact old stateful queue. New phase must
 // return only appended orders and must not modify the caller's existing queue.
 const queueBody=block('      const eligibleForRankedEntry = (signal) =>','    }\n  }\n  if (config.liquidateAtEnd');
 const queueArgs='config,session,sessionIndex,allocationBlocked,cooldownThrough,researchPersistence,persistence,rankedSelection,rankRebalance,rankedPool,entrySignals,rankContext,accountSeed,positions,completionEligible,rankedTargetCount,pending';
 vm.runInContext('globalThis.oldQueue=({'+queueArgs+'})=>{'+queueBody+'return pending;};',box);
 const saleBody=block('    const quantity = Math.min(position.shares, Math.max(0, shares));','    cash += Math.max(0, quantity * fill - commission);');
 vm.runInContext('globalThis.oldSale=({position,shares,fill,commission})=>{'+saleBody+'return {quantity,entryCommissionAllocated,realizedPnl};};',box);
 const purchaseBody=block('        const plannedShares=Math.min(','        if(recordedBuy && (shares<=0');
 vm.runInContext('globalThis.oldPurchase=({budget,fill,completion,existing,recordedBuy,config})=>{'+purchaseBody+'return {plannedShares,shares,executionCommission,cost};};',box);
 const exitBody=block('        const heldSessions = Math.max(','        if (rankExitSymbols.has(symbol))','        let boundedReviewExit = false;');
 vm.runInContext('globalThis.oldExit=({sessionIndex,position,mark,signal,config})=>{'+exitBody+'return {heldSessions,pnlPct,alpha20,alpha60,relativeExit,trendExit,timeExit};};',box);
 const modes=[...new Set([...original.matchAll(/config\.researchRankMode === "([^"]+)"/g)].map(m=>m[1]))];
 const signals=Array.from({length:28},(_,i)=>({symbol:'T'+i,sector:'Sector'+i%5,companyName:'Issuer'+i,price:100+i,score:i*3,action:i%4===0?'Strong Buy':'Buy',riskPlan:{invalidationPrice:80+i},researchFactors:{momentumPercentile:(i*17)%101,qualityPercentile:(i*13)%101,sectorQualityPercentile:70,stabilityPercentile:55,volatility60Pct:20,return5:i-8,return20:i-10,return60Ex5:i,return120Ex20:2*i,return252Ex21:3*i,globalCompositePercentile:75,coverage:1,factorCoverage:1},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000,alpha20VsSpy:i-12,alpha60VsSpy:i-14,alpha60VsQqq:i-11,alpha120VsSpy:i-4,alpha120VsQqq:i-6,strongPass:i%2===0,relativeStrengthVerified:true,benchmarkRegime:i%3===0?'defensive':'constructive'}}));
 let rankCases=0,queueCases=0,saleCases=0,purchaseCases=0,exitCases=0,priceCases=0;
 for(const rows of [[],signals.slice(0,1),signals.slice(0,19),signals.slice(0,20),signals,signals.slice().reverse()]){
  const before=clone(rows),actualContext=ranking.crossSectionalRankContext(rows),oldContext=oracle.crossSectionalRankContext(rows);
  same(actualContext,oldContext,'Complete cross-sectional rank context');
  for(const mode of [...modes,'weighted'])for(const signal of rows){same(ranking.researchRank(signal,{researchRankMode:mode},actualContext),oracle.researchRank(signal,{researchRankMode:mode},oldContext),'Rank parity '+mode);rankCases++;}
  same(rows,before,'Ranking never mutates observations');
 }
 for(const researchSignalSource of [undefined,'full-evidence','price-only','earnings-event','filing-event'])for(let fixture=0;fixture<20;fixture++){
  const config={researchSignalSource,minimumResearchFactorCoverage:0,minimumQualifiedSessions:1,rankedEntryQueueCount:fixture%4+1,rankedTargetWeights:[.2,.15,.1],accountCompletionRules:[{priorDate:'2026-10-23',partialSymbols:['T1']}]};
  const session={date:'2026-10-23',signals:signals.slice(0,8),positionSignals:signals.slice(5,12)};
  same(ranking.entrySignalPool(session,config),oracle.entrySignalPool(session,config),'Source pool replacement/order parity');
  for(const signal of signals)same(ranking.entrySignalQualifies(signal,config),oracle.entrySignalQualifies(signal,config),'Eligibility parity');
  const entries=signals.slice(0,8),pending=[{side:'sell',symbol:'T1',fraction:1,reason:'rank-deterioration'},{side:'buy',symbol:'T4',rank:99}];
  const positions=new Map([['T1',{symbol:'T1',shares:2,entryTargetShares:4}],['T2',{symbol:'T2',shares:3}]]);
  const params={config,session,sessionIndex:fixture,allocationBlocked:new Set(['T3']),cooldownThrough:new Map([['T5',10]]),researchPersistence:new Map(entries.map(s=>[s.symbol,{qualifiedSessions:2}])),persistence:new Map(entries.map(s=>[s.symbol,{buySessions:2,strongSessions:1}])),rankedSelection:fixture%2===0,rankRebalance:fixture%3!==0,rankedPool:entries,entrySignals:entries,rankContext:oracle.crossSectionalRankContext(entries),accountSeed:fixture%4?{}:null,positions,completionEligible:(position,rule)=>Boolean(rule&&position.entryTargetShares>position.shares),rankedTargetCount:3};
  const inputsBefore=clone({...params,completionEligible:null,pending});
  const expected=box.oldQueue({...params,pending:pending.slice()});
  const added=phases.queueC1Entries({...params,previousPending:pending});
  same([...pending,...added],expected,'Complete old/new queued orders/weights/identities');
  same({...params,completionEligible:null,pending},inputsBefore,'Queue phase cannot mutate records, maps or existing pending orders');
  for(const order of added)assert.equal(order.signal,entries.find(s=>s.symbol===order.symbol),'Queue retains exact source evidence object identity');
  queueCases++;
 }
 for(let fixture=0;fixture<300;fixture++){
  const position={shares:fixture%11,entryPrice:fixture%7===0?0:91.25,initialShares:fixture%13,entryCommission:fixture%3/2,enteredSessionIndex:fixture%17,lastPrice:99};
  const sale={position,shares:[-1,0,.5,2,100,Infinity][fixture%6],fill:fixture%19===0?0:100+fixture%23,commission:fixture%5/3};
  const before=clone(sale);same(phases.c1SaleEconomics(sale),box.oldSale(sale),'Complete sale economics');same(sale,before,'Sale economics is pure');saleCases++;
  const purchase={budget:[-1,0,50,1000,Infinity][fixture%5],fill:fixture%17===0?0:100,completion:fixture%2===0,existing:{entryTargetShares:fixture%8===0?undefined:10,shares:fixture%11},recordedBuy:fixture%3?null:{shares:fixture%7,price:80,fee:.53},config:{commissionPerOrder:fixture%3/2}};
  const purchaseBefore=clone(purchase);same(phases.c1PurchaseEconomics(purchase),box.oldPurchase(purchase),'Complete purchase planned/recorded economics');same(purchase,purchaseBefore,'Purchase economics is pure');purchaseCases++;
  const exits={sessionIndex:fixture%60,position,mark:fixture%4===0?80:110,signal:signals[fixture%signals.length],config:{relativeExitAlpha20:fixture%5===0?undefined:0,relativeExitMinHoldSessions:5,trendExitAlpha60:0,trendExitMinHoldSessions:8,timeStopSessions:20,timeStopMaxReturnPct:0}};
  const exitBefore=clone(exits);same(phases.c1ExitEligibility(exits),box.oldExit(exits),'Complete exit eligibility/boundary parity');same(exits,exitBefore,'Exit eligibility is pure');exitCases++;
  for(const side of ['buy','sell']){same(phases.tradePrice(fixture%13===0?'invalid':fixture/3,side,fixture%20),oracle.tradePrice(fixture%13===0?'invalid':fixture/3,side,fixture%20),'Exact slippage pricing');priceCases++;}
 }
 // Existing full-engine golden test retains its21 whole runs/63 slices and all
 // accounting assertions. It executes the newly consumed phases automatically.
 assert.equal(networkCalls,0);
 fs.mkdirSync('work/simulator-phases',{recursive:true});
 fs.writeFileSync('work/simulator-phases/parity.json',JSON.stringify({scope:'Synthetic offline software characterization only; no thesis or accepted-history rerun',rankModes:modes.length+1,rankCases,queueCases,saleCases,purchaseCases,exitCases,priceCases,phaseHashes:PHASE_HASHES,restoredPR334Sha256:hash(prior),originalCanonicalSha256:hash(original),immutablePinsUnchanged:true,networkCalls},null,2)+'\n');
 console.log(`PASS: ${rankCases} ranks across ${modes.length+1} modes; ${queueCases} complete queues; ${saleCases} sales, ${purchaseCases} purchases, ${exitCases} exits, ${priceCases} fill prices; exact PR334/canonical source restored, immutable generators/oracles retained, no mutation/network.`);
}finally{global.fetch=originalFetch;}
