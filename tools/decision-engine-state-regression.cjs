const fs=require('fs');
const vm=require('vm');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function loadMarketSession(){
  let src=fs.readFileSync('lib/marketSession.js','utf8').replace(/export function /g,'function ');
  src+='\nmodule.exports={isUsMarketSessionDay,previousMarketSessionDay,easternMarketClock,marketObservationSessionDay,marketSessionDistance,marketExecutionState,latestCompletedMarketSessionDay,marketSessionProgress,expectedVolumeFraction,pacedRelativeVolume,projectedFullDayVolume};';
  const box={module:{exports:{}},exports:{},console,Date,Intl,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp};vm.createContext(box);vm.runInContext(src,box,{filename:'lib/marketSession.js'});return box.module.exports;
}
function loadPerformanceLedger(market){
  let src=fs.readFileSync('lib/performanceLedger.js','utf8').replace(/^import .*$/gm,'').replace(/export const /g,'const ').replace(/export function /g,'function ');
  src+='\nmodule.exports={PERFORMANCE_HORIZONS,PERFORMANCE_SESSION_BASIS,mergeLedgerRecords,normalizeLedgerRecords,applyPerformanceObservation,summarizePerformance};';
  const box={module:{exports:{}},exports:{},console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp,...market};vm.createContext(box);vm.runInContext(src,box,{filename:'lib/performanceLedger.js'});return box.module.exports;
}
function loadGovernor(market){
  let src=fs.readFileSync('lib/portfolioGovernor.js','utf8').replace(/^import .*$/gm,'').replace(/export function /g,'function ');
  src+='\nmodule.exports={signalPersistence,capitalSignalEligible};';
  const box={module:{exports:{}},exports:{},console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp,...market};vm.createContext(box);vm.runInContext(src,box,{filename:'lib/portfolioGovernor.js'});return box.module.exports;
}
function loadExpert(market){
  let src=fs.readFileSync('lib/expertDecision.js','utf8').replace(/^import .*$/gm,'').replace(/export function /g,'function ');
  src=src.slice(0,src.indexOf('function mergerEconomics'))+'\nmodule.exports={quoteFreshness,expertGates};';
  const box={module:{exports:{}},exports:{},console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp,...market};vm.createContext(box);vm.runInContext(src,box,{filename:'lib/expertDecision.js'});return box.module.exports;
}

const market=loadMarketSession(),ledger=loadPerformanceLedger(market),governor=loadGovernor(market),expert=loadExpert(market);
const fridayClose='2026-08-28T20:00:00.000Z';
const fridayLate='2026-08-29T03:43:56.651Z';
const saturday='2026-08-29T16:00:00.000Z';
const mondayPre='2026-08-31T12:00:00.000Z';
const mondayOpen='2026-08-31T13:31:00.000Z';

assert(market.marketObservationSessionDay(fridayLate)==='2026-08-28','UTC midnight must not create a Saturday signal session');
assert(market.marketObservationSessionDay(saturday)==='2026-08-28','weekend refresh must stay on Friday session');
assert(market.marketObservationSessionDay(mondayPre)==='2026-08-28','Monday premarket must not count as a new daily observation');
assert(market.marketObservationSessionDay(mondayOpen)==='2026-08-31','Monday regular session must create the next observation');
assert(market.marketSessionDistance('2026-08-28','2026-08-31')===1,'Friday-to-Monday must be one market session');
assert(market.marketSessionDistance('2026-11-25','2026-11-27')===1,'Thanksgiving must not count as a performance horizon');
assert(market.marketExecutionState('2026-09-07T15:00:00.000Z').phase==='closed','Labor Day must not be treated as an open market');
assert(market.latestCompletedMarketSessionDay(mondayPre)==='2026-08-28'&&market.latestCompletedMarketSessionDay('2026-08-31T20:01:00.000Z')==='2026-08-31','completed-session clock must roll only after the close');

const buyRow=(price=100,extra={})=>({symbol:'TEST',price,finalDecision:{action:'Buy'},fundamentalDataStatus:'complete',fundamentalDataVerified:true,expertDecision:{metrics:{fundamentalsPass:true,quoteFreshnessPass:true}},...extra});
let records=ledger.applyPerformanceObservation([], [buyRow()], fridayClose);
records=ledger.applyPerformanceObservation(records,[buyRow(101)],fridayLate);
records=ledger.applyPerformanceObservation(records,[buyRow(102)],saturday);
records=ledger.applyPerformanceObservation(records,[buyRow(103)],mondayPre);
let p=governor.signalPersistence(records,'TEST');
assert(p.actionableDays===1&&!p.persistent,'after-hours/weekend/premarket refreshes must not satisfy two-session Buy persistence');
const fridaySignal=records.find(r=>r.recordType==='signal');
assert(fridaySignal.daysObserved===0&&fridaySignal.forward?.[1]==null,'weekend refresh must not create a one-day forward return');
records=ledger.applyPerformanceObservation(records,[buyRow(104)],mondayOpen);
p=governor.signalPersistence(records,'TEST');
assert(p.actionableDays===2&&p.persistent,'the next open market session must satisfy ordinary Buy persistence');
assert(Math.abs(records.find(r=>r.recordType==='signal').forward?.[1]-4)<1e-9,'one-session performance must use the Monday observation');

const corrupt=[{id:'bad',recordType:'state',signalState:true,day:'2026-08-29',sessionDay:'2026-08-29',timestamp:fridayLate,symbol:'BAD',action:'Buy'}];
const repaired=ledger.normalizeLedgerRecords(corrupt,saturday)[0];
assert(repaired.day==='2026-08-28'&&repaired.sessionDay==='2026-08-28','legacy UTC-derived sessionDay must be repaired from its timestamp');
const dateOnly=ledger.normalizeLedgerRecords([{id:'date-only',recordType:'signal',day:'2026-08-28',symbol:'OLD',action:'Buy',price:100}],saturday)[0];
assert(dateOnly.day==='2026-08-28','date-only legacy records must not be shifted to the prior ET day without timestamp evidence');
const cleanSummary=ledger.summarizePerformance([dateOnly,records.find(r=>r.recordType==='signal')]);
assert(cleanSummary.signals===1&&cleanSummary.excludedLegacySignals===1&&cleanSummary.sessionBasis===ledger.PERFORMANCE_SESSION_BASIS,'calendar-day legacy returns must be excluded from market-session performance statistics');

let paused=ledger.applyPerformanceObservation([], [buyRow()], fridayClose);
paused=ledger.applyPerformanceObservation(paused,[buyRow(100,{finalDecision:{action:'Watch'},fundamentalDataStatus:'unavailable',fundamentalDataVerified:false,expertDecision:{metrics:{fundamentalsPass:false,quoteFreshnessPass:true}}})],saturday);
paused=ledger.applyPerformanceObservation(paused,[buyRow()],mondayOpen);
assert(governor.signalPersistence(paused,'TEST').persistent,'temporary provider pause must not erase a valid Buy streak');
let interrupted=ledger.applyPerformanceObservation([], [buyRow()], fridayClose);
interrupted=ledger.applyPerformanceObservation(interrupted,[buyRow(99,{finalDecision:{action:'Watch'}})],saturday);
interrupted=ledger.applyPerformanceObservation(interrupted,[buyRow()],mondayOpen);
assert(!governor.signalPersistence(interrupted,'TEST').persistent,'a genuine Watch observation must reset Buy persistence');

const strong=ledger.applyPerformanceObservation([], [{...buyRow(),finalDecision:{action:'Strong Buy'}}],fridayClose);
assert(governor.signalPersistence(strong,'TEST').persistent,'Strong Buy must remain immediately eligible when all hard gates pass');
const staleSnapshot=ledger.applyPerformanceObservation([], [{...buyRow(),dataFeedSnapshotStale:true}],fridayClose);
assert(!staleSnapshot.some(r=>r.recordType==='signal')&&staleSnapshot.some(r=>r.recordType==='state'&&r.action==='Paused'),'stale broad snapshot must not create a Buy record or satisfy persistence');

const fridayQuote=Math.floor(new Date(fridayClose).getTime()/1000),oldQuote=Math.floor(new Date('2026-08-27T20:00:00.000Z').getTime()/1000);
assert(expert.quoteFreshness({timestamp:fridayQuote},new Date(saturday)).pass,'latest completed Friday quote must remain usable on Saturday');
assert(expert.quoteFreshness({timestamp:fridayQuote},new Date(mondayPre)).pass,'latest completed Friday quote must remain usable Monday premarket');
assert(!expert.quoteFreshness({timestamp:fridayQuote},new Date(mondayOpen)).pass,'Friday quote must fail after Monday regular trading begins');
assert(!expert.quoteFreshness({timestamp:oldQuote},new Date(saturday)).pass,'older-session quote must not authorize fresh capital');
assert(!expert.quoteFreshness({},new Date(saturday)).pass,'missing quote timestamp must fail closed outside market hours too');

const baseStock={price:100,priceAvg50:95,priceAvg200:80,volume:1_000_000,avgVolume:1_000_000,timestamp:fridayQuote,fundamentalDataStatus:'complete',fundamentalDataVerified:true};
const baseRecommendation={score:85,fundamentalScore:85,technicalScore:85,momentumScore:75,relativeStrengthScore:80,entryQualityScore:75,riskScore:40,extensionRisk:20,riskPlan:{payoffRatio:2.5},gateSummary:{buyEligible:true,starterEligible:true}};
assert(['Buy','Strong Buy'].includes(expert.expertGates(baseStock,baseRecommendation,new Date(saturday)).action),'fully verified latest-session setup should remain actionable while market is closed');
assert(!expert.expertGates({...baseStock,fundamentalDataVerified:undefined},baseRecommendation,new Date(saturday)).buyPass,'a complete label without explicit verification must not authorize fresh capital');
assert(!expert.expertGates({...baseStock,fundamentalDataStatus:undefined,fundamentalDataVerified:undefined},baseRecommendation,new Date(saturday)).buyPass,'missing fundamental verification must fail closed');
assert(!expert.expertGates({...baseStock,timestamp:oldQuote},baseRecommendation,new Date(saturday)).buyPass,'stale-session market data must fail closed');

console.log('DECISION ENGINE STATE PASS: market-session persistence, weekend/holiday safety, ledger repair, pause continuity, Strong Buy preservation, and hard data gates verified.');
