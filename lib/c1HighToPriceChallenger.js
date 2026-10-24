// One pre-registered, offline Challenger. No application route imports this
// module. It reuses accepted daily sessions and the existing account simulator.
import {simulatePointInTimePortfolio} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS} from './c1SleeveAccounting';
import {isUsMarketSessionDay} from './marketSession';

export const C1_HIGH_TO_PRICE_CONTRACT='c1-high-to-price-single-challenger-v1';
export const C1_HIGH_TO_PRICE_FORMATION_SESSIONS=120;
export const C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS=20;
export const C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS=
 C1_HIGH_TO_PRICE_FORMATION_SESSIONS-C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS+1;
// The existing simulator consumes two pre-start sessions to establish its
// causal persistence state. Retain those sessions in addition to the complete
// high-to-price formation window so a bounded restore is exactly equivalent to
// the full accepted history for the registered evaluation window.
export const C1_HIGH_TO_PRICE_SIMULATOR_WARMUP_SESSIONS=2;
export const C1_HIGH_TO_PRICE_REQUIRED_PRE_EVALUATION_SESSIONS=
 C1_HIGH_TO_PRICE_FORMATION_SESSIONS+C1_HIGH_TO_PRICE_SIMULATOR_WARMUP_SESSIONS;

const clone=value=>JSON.parse(JSON.stringify(value));
const ids=Object.keys(C1_ACCOUNTING_WEIGHTS);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const observed=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

export function c1HighToPriceRetainedStartIndex(sessionDates=[],startDate){
 if(!Array.isArray(sessionDates)||typeof startDate!=='string')throw new Error('High-to-price retained window requires accepted session dates');
 const evaluationStartIndex=sessionDates.indexOf(startDate);
 const retainedStartIndex=evaluationStartIndex-C1_HIGH_TO_PRICE_REQUIRED_PRE_EVALUATION_SESSIONS;
 if(evaluationStartIndex<0||retainedStartIndex<0)throw new Error('High-to-price retained window is unavailable');
 return retainedStartIndex;
}

export function c1HighToPriceObservation(rows=[]){
 if(!Array.isArray(rows)||rows.length!==C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS)
  throw new Error('High-to-price requires the fixed 120-to-20-session formation window');
 if(rows.some(row=>!positive(row?.close)||!positive(row?.high)))throw new Error('High-to-price requires positive accepted closes and highs');
 const startPrice=rows[0].close,endPrice=rows.at(-1).close,formationHigh=Math.max(...rows.map(row=>row.high));
 const prePeakReturnPct=(formationHigh/startPrice-1)*100;
 const postPeakReturnPct=(endPrice/formationHigh-1)*100;
 const totalReturnPct=(endPrice/startPrice-1)*100;
 const logIdentityError=Math.log(endPrice/startPrice)-(Math.log(formationHigh/startPrice)+Math.log(endPrice/formationHigh));
 return {startPrice,formationHigh,endPrice,prePeakReturnPct,postPeakReturnPct,totalReturnPct,logIdentityError};
}

function validateUniqueSessionPrices(sessions){
 for(const session of sessions){
  const symbols=new Set();
  for(const row of session.prices||[]){
   if(symbols.has(row.symbol))throw new Error('Duplicate high-to-price observation for '+row.symbol+' on '+session.date);
   symbols.add(row.symbol);
  }
 }
}

function sessionPriceMap(session){
 const prices=new Map();
 for(const row of session.prices||[])prices.set(row.symbol,row);
 return prices;
}

function rollingObservation(window,windowStart,symbol){
 let startPrice=null,endPrice=null,formationHigh=-Infinity;
 for(let offset=0;offset<C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS;offset++){
  const row=window[(windowStart+offset)%C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS].get(symbol);
  if(!row)return null;
  if(!positive(row.close)||!positive(row.high))throw new Error('High-to-price requires positive accepted closes and highs');
  if(offset===0)startPrice=row.close;
  if(offset===C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS-1)endPrice=row.close;
  formationHigh=Math.max(formationHigh,row.high);
 }
 const prePeakReturnPct=(formationHigh/startPrice-1)*100;
 const postPeakReturnPct=(endPrice/formationHigh-1)*100;
 const totalReturnPct=(endPrice/startPrice-1)*100;
 const logIdentityError=Math.log(endPrice/startPrice)-(Math.log(formationHigh/startPrice)+Math.log(endPrice/formationHigh));
 return {startPrice,formationHigh,endPrice,prePeakReturnPct,postPeakReturnPct,totalReturnPct,logIdentityError};
}

function recordTransformContract(dataset,includeDiagnostics){
 if(!dataset.metadata||typeof dataset.metadata!=='object'||Array.isArray(dataset.metadata))dataset.metadata={};
 dataset.metadata.c1HighToPriceChallenger={contract:C1_HIGH_TO_PRICE_CONTRACT,
  formationStartSessions:C1_HIGH_TO_PRICE_FORMATION_SESSIONS,
  skipRecentSessions:C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS,
  substitutedFields:['researchFactors.return120Ex20','researchFactors.momentumPercentile'],
  perSignalDiagnostics:includeDiagnostics};
}

// Replace only the conventional 120-ex-20 formation return and its
// cross-sectional momentum percentile. Every other accepted input and every
// account, sizing, entry, exit, cost and execution rule remains untouched.
function applyC1HighToPriceDataset(dataset={},includeDiagnostics){
 if(!Array.isArray(dataset.sessions)||dataset.sessions.length<=C1_HIGH_TO_PRICE_FORMATION_SESSIONS)
  throw new Error('High-to-price requires existing accepted formation history');
 validateUniqueSessionPrices(dataset.sessions);
 recordTransformContract(dataset,includeDiagnostics);
 // Only the exact 101 dated observations used by the current 120-to-20
 // formation are indexed. Each advance replaces one session map in this fixed
 // circular window; no full-dataset symbol/date history or per-symbol price
 // array is accumulated.
 const formationWindow=Array.from({length:C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS},(_,index)=>sessionPriceMap(dataset.sessions[index]));
 let windowStart=0;
 for(let sessionIndex=C1_HIGH_TO_PRICE_FORMATION_SESSIONS;sessionIndex<dataset.sessions.length;sessionIndex++){
  const session=dataset.sessions[sessionIndex],observations=[],formationEligibility=new Map();
  // Compacted accepted datasets partition the original cross-sectional peer
  // set across fresh-capital signals and holding-only position signals.
  // Account-only holdings use a separate live peer-review contract and must
  // never enlarge this offline historical cross-section.
  const rankedFields=['signals','positionSignals'],outputFields=[...rankedFields,'accountHoldingSignals'];
  for(const field of rankedFields)for(const signal of session[field]||[]){
   if(!signal.symbol)continue;
   const eligible=observed(signal?.researchFactors?.return120Ex20);
   if(formationEligibility.has(signal.symbol)&&formationEligibility.get(signal.symbol)!==eligible)
    throw new Error('Champion formation eligibility is inconsistent for '+signal.symbol+' on '+session.date);
   formationEligibility.set(signal.symbol,eligible);
  }
  for(const [symbol,eligible] of formationEligibility){
   // The accepted compiler admits a security after 50 observed bars, while its
   // conventional 120-ex-20 factor remains null until 121 observed closes exist.
   // Apply that same pre-existing eligibility state to this single replacement:
   // do not synthesize a shorter formation window and do not add a late entrant
   // to the percentile denominator.
   if(!eligible)continue;
   const observation=rollingObservation(formationWindow,windowStart,symbol);
   if(!observation)throw new Error('Champion formation factor is observed but high-to-price history is incomplete for '+symbol+' on '+session.date);
   observations.push({symbol,...observation});
  }
  observations.sort((left,right)=>left.prePeakReturnPct-right.prePeakReturnPct||left.symbol.localeCompare(right.symbol));
  const bySymbol=new Map();
  for(let index=0;index<observations.length;index++){
   observations[index].percentile=observations.length<2?50:index/(observations.length-1)*100;
   bySymbol.set(observations[index].symbol,observations[index]);
  }
  for(const field of outputFields)for(const signal of session[field]||[]){
   const eligible=formationEligibility.get(signal.symbol);
   if(eligible===false){
    const factors=signal.researchFactors||(signal.researchFactors={});
    factors.return120Ex20=null;factors.momentumPercentile=null;
    if(includeDiagnostics){factors.highToPricePrePeakReturnPct=null;factors.highToPricePostPeakReturnPct=null;
     factors.highToPriceFormationHigh=null;factors.highToPriceContract=C1_HIGH_TO_PRICE_CONTRACT;}
    continue;
   }
   const observation=bySymbol.get(signal.symbol);
   if(!observation)throw new Error('High-to-price peer evidence is unavailable for '+signal.symbol+' on '+session.date);
   const factors=signal.researchFactors||(signal.researchFactors={});
   factors.return120Ex20=observation.prePeakReturnPct;factors.momentumPercentile=observation.percentile;
   if(includeDiagnostics){factors.highToPricePrePeakReturnPct=observation.prePeakReturnPct;
    factors.highToPricePostPeakReturnPct=observation.postPeakReturnPct;
    factors.highToPriceFormationHigh=observation.formationHigh;factors.highToPriceContract=C1_HIGH_TO_PRICE_CONTRACT;}
  }
  if(sessionIndex+1<dataset.sessions.length){
   const enteringFormationIndex=sessionIndex-C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS+1;
   formationWindow[windowStart]=sessionPriceMap(dataset.sessions[enteringFormationIndex]);
   windowStart=(windowStart+1)%C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS;
  }
 }
 return dataset;
}

export function applyC1HighToPriceDatasetInPlace(dataset={}){
 return applyC1HighToPriceDataset(dataset,true);
}

// The simulator reads only the substituted formation return and percentile.
// The disposable preview path records the transform contract once at dataset
// level and avoids adding four diagnostic properties to every signal row.
export function applyC1HighToPriceDecisionDatasetInPlace(dataset={}){
 return applyC1HighToPriceDataset(dataset,false);
}

export function buildC1HighToPriceDataset(dataset={}){
 return applyC1HighToPriceDatasetInPlace(clone(dataset));
}

function detachSimulationResearchFactors(run){
 for(const trade of run.trades||[]){
  const factors=trade.signalSnapshot?.researchFactors;
  if(factors)trade.signalSnapshot.researchFactors={...factors};
 }
 for(const position of run.openPositions||[]){
  const factors=position.stock?.researchFactors;
  if(factors)position.stock={...position.stock,researchFactors:{...factors}};
 }
 return run;
}

function combine(sleeves){
 const reference=sleeves.base.curve;
 for(const id of ids)if(sleeves[id].curve.length!==reference.length||sleeves[id].curve.some((row,index)=>row.date!==reference[index].date))
  throw new Error('Sleeve curves must use identical completed sessions');
 const curve=reference.map((row,index)=>({date:row.date,
  equity:ids.reduce((sum,id)=>sum+C1_ACCOUNTING_WEIGHTS[id]*sleeves[id].curve[index].equity,0),
  cash:ids.reduce((sum,id)=>sum+C1_ACCOUNTING_WEIGHTS[id]*sleeves[id].curve[index].cash,0)}));
 let highWater=100000,maxDrawdownPct=0;
 for(const row of curve){highWater=Math.max(highWater,row.equity);maxDrawdownPct=Math.min(maxDrawdownPct,(row.equity/highWater-1)*100);}
 const trades=ids.flatMap(sleeve=>sleeves[sleeve].trades.map(trade=>({...trade,sleeve,
  portfolioModelShares:trade.shares*C1_ACCOUNTING_WEIGHTS[sleeve]}))).sort((a,b)=>a.date.localeCompare(b.date)||ids.indexOf(a.sleeve)-ids.indexOf(b.sleeve));
 return {sleeves,curve,trades,metrics:{endingEquity:curve.at(-1)?.equity??100000,
  totalReturnPct:((curve.at(-1)?.equity??100000)/100000-1)*100,maxDrawdownPct,transactionCount:trades.length}};
}

export function runC1HighToPriceComparison({dataset,startDate,endDate,openingAccounts,completionRules={}}={}){
 if(!dataset||!Array.isArray(dataset.sessions))throw new Error('Existing accepted daily sessions are required');
 const dates=dataset.sessions.map(session=>session?.date);
 if(dates.some((date,index)=>typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!isUsMarketSessionDay(date)||(index&&date<=dates[index-1])))
  throw new Error('Existing sessions must have unique chronological exchange dates');
 startDate=startDate??dates[C1_HIGH_TO_PRICE_FORMATION_SESSIONS];endDate=endDate??dates.at(-1);
 const startIndex=dates.indexOf(startDate);
 if(startIndex<C1_HIGH_TO_PRICE_FORMATION_SESSIONS||!dates.includes(endDate)||endDate<startDate)throw new Error('Comparison dates require the complete fixed formation window');
 if(openingAccounts&&(Object.keys(openingAccounts).length!==ids.length||ids.some(id=>!openingAccounts[id])))throw new Error('Provide all three normalized opening sleeve accounts');
 const challengerDataset=clone(dataset),champion={},challenger={};
 applyC1HighToPriceDecisionDatasetInPlace(challengerDataset);
 for(const sleeve of ids){
  const seed=openingAccounts?.[sleeve]??null;
  const options={...clone(C1_FROZEN_OPTIONS[sleeve]),startDate,endDate,liquidateAtEnd:false,
   ...(completionRules[sleeve]?{accountCompletionRules:clone(completionRules[sleeve])}:{})};
  champion[sleeve]=simulatePointInTimePortfolio(clone(dataset),clone(options),clone(seed));
  challenger[sleeve]=simulatePointInTimePortfolio(clone(challengerDataset),clone(options),clone(seed));
 }
 const championResult=combine(champion),challengerResult=combine(challenger);
 return {contract:C1_HIGH_TO_PRICE_CONTRACT,scope:'offline-simulation-only',executable:false,productionChanged:false,startDate,endDate,
  preRegistration:{formationStartSessions:C1_HIGH_TO_PRICE_FORMATION_SESSIONS,skipRecentSessions:C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS,
   substitution:['researchFactors.return120Ex20','researchFactors.momentumPercentile'],parameterGrid:false,newProvider:false},
  champion:championResult,challenger:challengerResult,
  comparison:{returnDifferencePercentagePoints:challengerResult.metrics.totalReturnPct-championResult.metrics.totalReturnPct,
   endingEquityDifference:challengerResult.metrics.endingEquity-championResult.metrics.endingEquity,
   maxDrawdownDifferencePercentagePoints:challengerResult.metrics.maxDrawdownPct-championResult.metrics.maxDrawdownPct,
   transactionCountDifference:challengerResult.metrics.transactionCount-championResult.metrics.transactionCount},
  limitations:['Historical results can reject but cannot validate this inspected challenger.',
   'No live recommendation, account, provider, route or execution authority imports this module.',
   'A survivor requires at least 30 prospective closed trades and 90 calendar days before any policy review.']};
}

// The accepted S&P replay is hundreds of compressed megabytes. This one-time
// preview runner executes Champion first, then transforms that same private,
// disposable restore in place for Challenger. The simulator only reads the
// replay, so the paired result is identical without cloning the replay six
// times. The immutable public helper above remains the default research API.
export function runC1HighToPriceComparisonMemoryBound({dataset,startDate,endDate,openingAccounts,completionRules={},onProgress}={}){
 if(!dataset||!Array.isArray(dataset.sessions))throw new Error('Existing accepted daily sessions are required');
 const dates=dataset.sessions.map(session=>session?.date);
 if(dates.some((date,index)=>typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!isUsMarketSessionDay(date)||(index&&date<=dates[index-1])))
  throw new Error('Existing sessions must have unique chronological exchange dates');
 startDate=startDate??dates[C1_HIGH_TO_PRICE_FORMATION_SESSIONS];endDate=endDate??dates.at(-1);
 const startIndex=dates.indexOf(startDate);
 if(startIndex<C1_HIGH_TO_PRICE_FORMATION_SESSIONS||!dates.includes(endDate)||endDate<startDate)throw new Error('Comparison dates require the complete fixed formation window');
 if(openingAccounts&&(Object.keys(openingAccounts).length!==ids.length||ids.some(id=>!openingAccounts[id])))throw new Error('Provide all three normalized opening sleeve accounts');
 const champion={},challenger={},progress=typeof onProgress==='function'?onProgress:()=>{};
 for(const sleeve of ids){
  progress({phase:'champion-sleeve-start',sleeve});
  const seed=openingAccounts?.[sleeve]??null;
  const options={...clone(C1_FROZEN_OPTIONS[sleeve]),startDate,endDate,liquidateAtEnd:false,
   ...(completionRules[sleeve]?{accountCompletionRules:clone(completionRules[sleeve])}:{})};
  champion[sleeve]=detachSimulationResearchFactors(simulatePointInTimePortfolio(dataset,clone(options),clone(seed)));
  progress({phase:'champion-sleeve-end',sleeve,transactionCount:champion[sleeve].trades?.length??0});
 }
 progress({phase:'challenger-transform-start'});
 applyC1HighToPriceDecisionDatasetInPlace(dataset);
 progress({phase:'challenger-transform-end'});
 for(const sleeve of ids){
  progress({phase:'challenger-sleeve-start',sleeve});
  const seed=openingAccounts?.[sleeve]??null;
  const options={...clone(C1_FROZEN_OPTIONS[sleeve]),startDate,endDate,liquidateAtEnd:false,
   ...(completionRules[sleeve]?{accountCompletionRules:clone(completionRules[sleeve])}:{})};
  challenger[sleeve]=simulatePointInTimePortfolio(dataset,clone(options),clone(seed));
  progress({phase:'challenger-sleeve-end',sleeve,transactionCount:challenger[sleeve].trades?.length??0});
 }
 const championResult=combine(champion),challengerResult=combine(challenger);
 return {contract:C1_HIGH_TO_PRICE_CONTRACT,scope:'offline-simulation-only',executable:false,productionChanged:false,startDate,endDate,
  preRegistration:{formationStartSessions:C1_HIGH_TO_PRICE_FORMATION_SESSIONS,skipRecentSessions:C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS,
   substitution:['researchFactors.return120Ex20','researchFactors.momentumPercentile'],parameterGrid:false,newProvider:false},
  champion:championResult,challenger:challengerResult,
  comparison:{returnDifferencePercentagePoints:challengerResult.metrics.totalReturnPct-championResult.metrics.totalReturnPct,
   endingEquityDifference:challengerResult.metrics.endingEquity-championResult.metrics.endingEquity,
   maxDrawdownDifferencePercentagePoints:challengerResult.metrics.maxDrawdownPct-championResult.metrics.maxDrawdownPct,
   transactionCountDifference:challengerResult.metrics.transactionCount-championResult.metrics.transactionCount},
  limitations:['Historical results can reject but cannot validate this inspected challenger.',
   'No live recommendation, account, provider, route or execution authority imports this module.',
   'A survivor requires at least 30 prospective closed trades and 90 calendar days before any policy review.']};
}
