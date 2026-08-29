const fs=require('fs');
const vm=require('vm');
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

function loadPureModule(path,names,globals={}){
  let src=fs.readFileSync(path,'utf8').replace(/^import .*$/gm,'').replace(/export function /g,'function ');
  src+=`\nmodule.exports={${names.join(',')}};`;
  const sandbox={module:{exports:{}},exports:{},console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp,...globals};
  vm.createContext(sandbox);vm.runInContext(src,sandbox,{filename:path});return sandbox.module.exports;
}

const market=loadPureModule('lib/marketSession.js',['marketObservationSessionDay','isUsMarketSessionDay']);
const gov=loadPureModule('lib/portfolioGovernor.js',['factorWeightsFor','factorOverlap','signalPersistence','portfolioRiskSnapshot','capitalAllowance','capitalSignalEligible','rotationGate'],market);
const life=loadPureModule('lib/winnerLifecycle.js',['winnerTrimGate','normalizeWinnerLifecycle']);

// 1) WTS must load on the same AI-capex factor instead of escaping as Other.
const wts=gov.factorWeightsFor({symbol:'WTS'});assert(wts['AI Capex & Data Center']>=.5,'WTS factor leakage regression');

// 2) Core capital must not dilute Swing sizing/concentration math.
const snap=gov.portfolioRiskSnapshot([
  {symbol:'MSTR',role:'Core',value:17000},
  {symbol:'NVT',role:'Swing',value:4000},{symbol:'DLR',role:'Swing',value:2200},{symbol:'TER',role:'Swing',value:1900},{symbol:'MU',role:'Swing',value:2000},{symbol:'CGNX',role:'Swing',value:1800},{symbol:'IRDM',role:'Swing',value:3600}
]);
assert(snap.coreCapital===17000,'Core capital accounting regression');
assert(snap.swingCapital===15500,'Swing capital accounting regression');
assert((snap.factorPct['AI Capex & Data Center']||0)>.35,'AI factor concentration regression');

// 3) A correlated new WTS buy must be blocked when AI exposure is already above budget.
const crowded={...snap,factors:{...snap.factors,'AI Capex & Data Center':snap.swingCapital*.47}};
const wtsAllowance=gov.capitalAllowance({target:{symbol:'WTS'},action:'Buy',requested:1000,risk:crowded});
assert(wtsAllowance.blocked,'Crowded-factor WTS buy should be blocked');

// 4) Ordinary Buy requires persistence; one marginal observation cannot spend capital.
assert(!gov.capitalSignalEligible({action:'Buy',persistence:{persistent:false}}).pass,'Unconfirmed Buy capital regression');
assert(gov.capitalSignalEligible({action:'Buy',persistence:{persistent:true}}).pass,'Persistent Buy eligibility regression');
const state=(action,daysAgo)=>{const timestamp=new Date(Date.now()-daysAgo*86400000).toISOString();return{recordType:'state',signalState:true,symbol:'OKE',action,day:timestamp.slice(0,10),timestamp}};
let persistence=gov.signalPersistence([state('Buy',3),state('Buy',2)],'OKE');assert(persistence.persistent&&persistence.actionableDays===2,'Two uninterrupted daily Buy observations must qualify');
persistence=gov.signalPersistence([state('Buy',3),state('Buy',2),state('Watch',1),state('Buy',0)],'OKE');assert(!persistence.persistent&&persistence.interrupted&&persistence.actionableDays===1,'An intervening Watch must reset Buy funding confirmation');
persistence=gov.signalPersistence([state('Buy',3),state('Buy',2),state('Paused',1),state('Buy',0)],'OKE');assert(persistence.persistent&&!persistence.interrupted,'A temporary data-verification pause must not masquerade as stock deterioration or erase an otherwise uninterrupted Buy streak');
persistence=gov.signalPersistence([{symbol:'OKE',action:'Buy',day:new Date().toISOString().slice(0,10),timestamp:new Date().toISOString()}],'OKE');assert(!persistence.persistent&&!persistence.trackingComplete,'Legacy positive-only history must not qualify without state tracking');
const friday='2026-08-28T16:58:39.415Z',utcSaturdayButEtFriday='2026-08-29T03:43:56.651Z',saturday='2026-08-29T04:03:00.000Z',mondayPremarket='2026-08-31T13:29:00.000Z',mondayOpen='2026-08-31T13:30:00.000Z';
assert(market.marketObservationSessionDay(friday)==='2026-08-28'&&market.marketObservationSessionDay(utcSaturdayButEtFriday)==='2026-08-28'&&market.marketObservationSessionDay(saturday)==='2026-08-28'&&market.marketObservationSessionDay(mondayPremarket)==='2026-08-28'&&market.marketObservationSessionDay(mondayOpen)==='2026-08-31','Persistence must use US market sessions, not UTC midnight, weekends, or premarket calendar dates');
persistence=gov.signalPersistence([state('Watch',4),{recordType:'state',signalState:true,symbol:'OKE',action:'Buy',day:'2026-08-28',timestamp:friday},{recordType:'state',signalState:true,symbol:'OKE',action:'Buy',day:'2026-08-29',timestamp:utcSaturdayButEtFriday}],'OKE');assert(!persistence.persistent&&persistence.actionableDays===1,'UTC midnight must not manufacture a second Buy session');

// 5) Fast churn and correlated rotations need exceptional edge.
const riskForRotation=gov.portfolioRiskSnapshot([{symbol:'NVT',role:'Swing',value:3000},{symbol:'CGNX',role:'Swing',value:7000}]);
const recent=new Date(Date.now()-3*86400000).toISOString();
const target={symbol:'WTS',finalDecision:{action:'Buy'}};
let gate=gov.rotationGate({source:{symbol:'NVT',openedAt:recent,lastTradeAt:recent},target,gap:50,persistence:{persistent:true},risk:riskForRotation,requested:800});
assert(!gate.pass,'Fast-churn rotation regression');
const old=new Date(Date.now()-60*86400000).toISOString();
gate=gov.rotationGate({source:{symbol:'NVT',openedAt:old,lastTradeAt:old},target,gap:50,persistence:{persistent:true},risk:riskForRotation,requested:800});
assert(!gate.pass,'Correlated rotation overlap regression');

// 6) IOVA has already been trimmed twice: ordinary extension alone must preserve the runner.
const iovaHistory={trimCount:2,trimmedShares:218,originalShares:400,lastTrimAt:'2026-08-21T00:00:00.000Z',lastTrimPrice:8.96};
let trim=life.winnerTrimGate({position:{symbol:'IOVA',shares:182,gainLossPct:92.79},decision:{profitProtection:{pnlPct:92.79,extension:78,vs50:67.4,day:-7.8,highFroth:true,moderateFroth:true,winnerFading:false}},history:iovaHistory});
assert(!trim.pass,'Third IOVA trim should not fire on persistent extension alone');
trim=life.winnerTrimGate({position:{symbol:'IOVA',shares:182,gainLossPct:92.79},decision:{profitProtection:{pnlPct:92.79,extension:78,vs50:67.4,day:-7.8,highFroth:true,moderateFroth:true,winnerFading:true}},history:iovaHistory});
assert(trim.pass&&trim.maxTrimPct<=.15,'Third winner trim must require deterioration and be capped');

// 7) Integration invariants in Portfolio Intelligence.
const page=fs.readFileSync('pages/index.js','utf8');
assert(page.includes('winnerTrimGate')&&page.includes('recordWinnerTrim'),'Winner lifecycle not integrated into page');
assert(page.includes('factorWeightsFor'),'Projected-risk engine is not using weighted factors');
assert(page.includes('trimCount:2')&&page.includes('trimmedShares:218')&&page.includes('originalShares:400'),'Known IOVA lifecycle history not seeded');
assert(/Winner lifecycle/.test(page),'Lifecycle block reason not surfaced to user');

// 8) Fundamental incompleteness and the base entry gate must both constrain fresh-capital sizing.
const expert=fs.readFileSync('lib/expertDecision.js','utf8');
assert(expert.includes("fundamentalsPass=fundamentalStatus==='complete'&&stock?.fundamentalDataVerified===true"),'Verified fundamental completeness gate missing');
assert(/fullBuyPass=[^;]*fundamentalsPass/.test(expert)&&/partialBuyPass=[^;]*fundamentalsPass/.test(expert),'Buy path can bypass fundamental verification');
assert(/fullBuyPass=[^;]*scoringBuyEligible/.test(expert)&&/partialBuyPass=[^;]*scoringStarterEligible/.test(expert),'Expert sizing can bypass the base entry gate');

console.log('REGRESSION PASS: 8 portfolio/signal/lifecycle checks passed');
