// Real accepted-source compiler path; synthetic prices establish coverage
// accounting only, never historical investment performance.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {compileC1LiveInput}=loader.load('lib/c1LiveInput.js');
const {previousMarketSessionDay}=loader.load('lib/marketSession.js');
const {buildC1StockScreenSnapshot}=loader.load('lib/c1StockClassification.js');
const dates=['2026-11-10'];while(dates.length<253)dates.unshift(previousMarketSessionDay(dates[0]));
const members=Array.from({length:90},(_,i)=>({symbol:'T'+i,name:'Fixture '+i,sector:'Sector '+i%5}));
const histories=Object.fromEntries([...members.map(row=>row.symbol),'SPY','QQQ'].map((symbol,i)=>[symbol,dates.map((date,index)=>{
 const close=100+index*(.1+i/1000);return{date,open:close-.1,high:close+1,low:close-1,close,volume:10000000,adjusted:true};
})]));
histories.T3=histories.T3.slice(-100);
const input={universe:'nasdaq',members,histories,observedAt:'2026-11-10T22:00:00.000Z',fromDate:dates[0]};
const before=JSON.stringify(input),compiled=compileC1LiveInput(input);
assert.equal(JSON.stringify(input),before,'The compiler cannot change accepted input histories');
const evidence=compiled.session.universeEvidence;
assert.equal(evidence.contract,'c1-supported-dated-universe-v2');assert.equal(evidence.sourceSessionDate,'2026-11-10');
assert.equal(evidence.totalUniverse,90);assert.equal(evidence.supportedSymbols.length,89);assert.equal(evidence.complete,true);
assert.deepEqual(JSON.parse(JSON.stringify(evidence.exclusions)),[{symbol:'T3',reason:'insufficient-accepted-history',historySessions:100,requiredHistorySessions:253}]);
const snapshot=buildC1StockScreenSnapshot(compiled.session,new Date(input.observedAt),[compiled.session]);
assert.equal(snapshot.scan.complete,true,'Verified unsupported short history is distinct from an interrupted supported-universe scan');
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.scan.unsupportedSymbols)),['T3']);
assert(!snapshot.candidates.some(row=>row.symbol==='T3'),'Insufficient history cannot manufacture a purchase candidate');
const missing=JSON.parse(JSON.stringify(compiled.session));
missing.signals=missing.signals.filter(row=>row.symbol!=='T4');missing.positionSignals=missing.positionSignals.filter(row=>row.symbol!=='T4');
assert.equal(buildC1StockScreenSnapshot(missing,new Date(input.observedAt),[missing]).scan.complete,false,'A missing supported source row is explicitly incomplete');
const forged=JSON.parse(JSON.stringify(compiled.session));forged.universeEvidence.exclusions[0].historySessions=300;
assert.equal(buildC1StockScreenSnapshot(forged,new Date(input.observedAt),[forged]).scan.complete,false,'An unsupported exclusion cannot assert away a missing supported stock');
console.log('PASS: accepted-source compilation records the full supported dated universe, verified short-history exclusions, and explicit missing-source incompleteness.');
