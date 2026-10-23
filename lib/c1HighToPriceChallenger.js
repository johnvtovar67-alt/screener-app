// One pre-registered, offline Challenger. No application route imports this
// module. It reuses accepted daily sessions and the existing account simulator.
import {simulatePointInTimePortfolio} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS} from './c1SleeveAccounting';
import {isUsMarketSessionDay} from './marketSession';

export const C1_HIGH_TO_PRICE_CONTRACT='c1-high-to-price-single-challenger-v1';
export const C1_HIGH_TO_PRICE_FORMATION_SESSIONS=120;
export const C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS=20;

const clone=value=>JSON.parse(JSON.stringify(value));
const ids=Object.keys(C1_ACCOUNTING_WEIGHTS);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;

export function c1HighToPriceObservation(rows=[]){
 if(!Array.isArray(rows)||rows.length!==C1_HIGH_TO_PRICE_FORMATION_SESSIONS-C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS+1)
  throw new Error('High-to-price requires the fixed 120-to-20-session formation window');
 if(rows.some(row=>!positive(row?.close)||!positive(row?.high)))throw new Error('High-to-price requires positive accepted closes and highs');
 const startPrice=rows[0].close,endPrice=rows.at(-1).close,formationHigh=Math.max(...rows.map(row=>row.high));
 const prePeakReturnPct=(formationHigh/startPrice-1)*100;
 const postPeakReturnPct=(endPrice/formationHigh-1)*100;
 const totalReturnPct=(endPrice/startPrice-1)*100;
 const logIdentityError=Math.log(endPrice/startPrice)-(Math.log(formationHigh/startPrice)+Math.log(endPrice/formationHigh));
 return {startPrice,formationHigh,endPrice,prePeakReturnPct,postPeakReturnPct,totalReturnPct,logIdentityError};
}

function priceHistory(dataset){
 const bySymbol=new Map();
 for(const session of dataset.sessions)for(const row of session.prices||[]){
  if(!bySymbol.has(row.symbol))bySymbol.set(row.symbol,new Map());
  if(bySymbol.get(row.symbol).has(session.date))throw new Error('Duplicate high-to-price observation for '+row.symbol+' on '+session.date);
  bySymbol.get(row.symbol).set(session.date,row);
 }
 return bySymbol;
}

// Replace only the conventional 120-ex-20 formation return and its
// cross-sectional momentum percentile. Every other accepted input and every
// account, sizing, entry, exit, cost and execution rule remains untouched.
export function buildC1HighToPriceDataset(dataset={}){
 if(!Array.isArray(dataset.sessions)||dataset.sessions.length<=C1_HIGH_TO_PRICE_FORMATION_SESSIONS)
  throw new Error('High-to-price requires existing accepted formation history');
 const transformed=clone(dataset),history=priceHistory(transformed);
 for(let sessionIndex=C1_HIGH_TO_PRICE_FORMATION_SESSIONS;sessionIndex<transformed.sessions.length;sessionIndex++){
  const session=transformed.sessions[sessionIndex],observations=[];
  const formationDates=transformed.sessions.slice(sessionIndex-C1_HIGH_TO_PRICE_FORMATION_SESSIONS,sessionIndex-C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS+1).map(row=>row.date);
  for(const signal of session.signals||[]){
   const rows=formationDates.map(date=>history.get(signal.symbol)?.get(date));
   if(rows.some(row=>!row))throw new Error('High-to-price history is incomplete for '+signal.symbol+' on '+session.date);
   observations.push({symbol:signal.symbol,...c1HighToPriceObservation(rows)});
  }
  const ordered=[...observations].sort((left,right)=>left.prePeakReturnPct-right.prePeakReturnPct||left.symbol.localeCompare(right.symbol));
  const bySymbol=new Map(ordered.map((row,index)=>[row.symbol,{...row,percentile:ordered.length<2?50:index/(ordered.length-1)*100}]));
  for(const field of ['signals','positionSignals','accountHoldingSignals'])for(const signal of session[field]||[]){
   const observation=bySymbol.get(signal.symbol);
   if(!observation)continue;
   signal.researchFactors={...(signal.researchFactors||{}),return120Ex20:observation.prePeakReturnPct,
    momentumPercentile:observation.percentile,highToPricePrePeakReturnPct:observation.prePeakReturnPct,
    highToPricePostPeakReturnPct:observation.postPeakReturnPct,highToPriceFormationHigh:observation.formationHigh,
    highToPriceContract:C1_HIGH_TO_PRICE_CONTRACT};
  }
 }
 return transformed;
}

function cashSeed(sleeve,date){
 return {contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:date,prospectiveAdoptionConfirmed:true,
  cash:100000,highWater:100000,remainingCooldownSessions:0,resumeAtNextOpen:false,positions:[]};
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
 const challengerDataset=buildC1HighToPriceDataset(dataset),champion={},challenger={};
 for(const sleeve of ids){
  const seed=openingAccounts?.[sleeve]??cashSeed(sleeve,startDate);
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
