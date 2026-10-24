// Isolated, offline-only reported-thesis tournament. No live application path
// imports this module. It reuses accepted adjusted sessions and the frozen C1
// simulator without changing any account, execution, entry or exit policy.
import {simulatePointInTimePortfolio} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS} from './c1SleeveAccounting';
import {isUsMarketSessionDay} from './marketSession';

export const C1_REPORTED_THESIS_CONTRACT='c1-reported-thesis-tournament-v1';
export const C1_REPORTED_THESIS_FORMATION_SESSIONS=120;
export const C1_REPORTED_THESIS_SKIP_RECENT_SESSIONS=20;
export const C1_REPORTED_THESIS_OBSERVATIONS=101;
export const C1_REPORTED_THESIS_SIMULATOR_WARMUP_SESSIONS=2;
export const C1_REPORTED_THESIS_REQUIRED_PRE_EVALUATION_SESSIONS=122;
export const C1_REPORTED_THESIS_CANDIDATES=Object.freeze([
 {id:'ols-residual-120-ex-20',label:'SPY/QQQ OLS-residual momentum',literatureAdaptation:'Blitz-Huij-Martens (2011)'},
 {id:'downside-resilience-120-ex-20',label:'Down-market-resilient momentum',literatureAdaptation:'downside-aware/partial-moment momentum'},
]);

const clone=value=>JSON.parse(JSON.stringify(value));
const ids=Object.keys(C1_ACCOUNTING_WEIGHTS);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const observed=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));

export function c1ReportedThesisRetainedStartIndex(sessionDates=[],startDate){
 if(!Array.isArray(sessionDates)||typeof startDate!=='string')throw new Error('Reported-thesis retained window requires accepted session dates');
 const evaluationStartIndex=sessionDates.indexOf(startDate);
 const retainedStartIndex=evaluationStartIndex-C1_REPORTED_THESIS_REQUIRED_PRE_EVALUATION_SESSIONS;
 if(evaluationStartIndex<0||retainedStartIndex<0)throw new Error('Reported-thesis retained window is unavailable');
 return retainedStartIndex;
}

function logReturns(rows){
 if(!Array.isArray(rows)||rows.length!==C1_REPORTED_THESIS_OBSERVATIONS)
  throw new Error('Reported-thesis factors require 101 positive accepted closes');
 const output=[];
 for(let index=0;index<rows.length;index++){
  const close=typeof rows[index]==='number'?rows[index]:rows[index]?.close;
  if(!positive(close))throw new Error('Reported-thesis factors require 101 positive accepted closes');
  if(index){const previous=typeof rows[index-1]==='number'?rows[index-1]:rows[index-1]?.close;output.push(Math.log(close/previous));}
 }
 return output;
}

export function c1OlsResidualObservation(stockRows=[],spyRows=[],qqqRows=[]){
 const stock=logReturns(stockRows),spy=logReturns(spyRows),qqq=logReturns(qqqRows);
 let xx=0,xz=0,zz=0,xy=0,zy=0;
 for(let index=0;index<stock.length;index++){
  xx+=spy[index]*spy[index];xz+=spy[index]*qqq[index];zz+=qqq[index]*qqq[index];
  xy+=spy[index]*stock[index];zy+=qqq[index]*stock[index];
 }
 const determinant=xx*zz-xz*xz;
 if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-16)throw new Error('SPY/QQQ residual design is singular');
 const spyBeta=(xy*zz-zy*xz)/determinant,qqqBeta=(zy*xx-xy*xz)/determinant;
 const residuals=stock.map((value,index)=>value-spyBeta*spy[index]-qqqBeta*qqq[index]);
 const residualSum=residuals.reduce((sum,value)=>sum+value,0);
 const residualSd=Math.sqrt(residuals.reduce((sum,value)=>sum+value*value,0)/(residuals.length-2));
 if(!(residualSd>0))throw new Error('OLS residual volatility is unavailable');
 return {score:residualSum/residualSd,residualSum,residualSd,spyBeta,qqqBeta};
}

export function c1DownsideResilienceObservation(stockRows=[],spyRows=[]){
 const stock=logReturns(stockRows),spy=logReturns(spyRows),down=[];
 for(let index=0;index<stock.length;index++)if(spy[index]<0)down.push(stock[index]-spy[index]);
 if(down.length<10)throw new Error('Downside resilience requires at least ten negative-SPY formation sessions');
 const totalReturnPct=(Math.exp(stock.reduce((sum,value)=>sum+value,0))-1)*100;
 const downsideExcessMeanPct=down.reduce((sum,value)=>sum+value,0)/down.length*100;
 return {totalReturnPct,downsideExcessMeanPct,negativeSpySessions:down.length};
}

function sessionPriceMap(session,includedSymbols){
 const prices=new Map();
 const seen=new Set();
 for(const row of session.prices||[]){
  const symbol=String(row.symbol||row.ticker||'');
  if(seen.has(symbol))throw new Error('Duplicate reported-thesis price for '+symbol+' on '+session.date);
  seen.add(symbol);
  if(includedSymbols.has(symbol))prices.set(symbol,row.close);
 }
 return prices;
}

function rowsFromWindow(window,windowStart,symbol){
 const rows=[];
 for(let offset=0;offset<C1_REPORTED_THESIS_OBSERVATIONS;offset++){
  const row=window[(windowStart+offset)%C1_REPORTED_THESIS_OBSERVATIONS].get(symbol);
  if(!row)return null;
  rows.push(row);
 }
 return rows;
}

function rankedPercentiles(rows,key){
 const ordered=[...rows].sort((left,right)=>left[key]-right[key]||left.symbol.localeCompare(right.symbol));
 return new Map(ordered.map((row,index)=>[row.symbol,ordered.length<2?50:index/(ordered.length-1)*100]));
}

export function applyC1ReportedThesisCandidateInPlace(dataset={},candidateId){
 if(!C1_REPORTED_THESIS_CANDIDATES.some(row=>row.id===candidateId))throw new Error('Unknown reported-thesis candidate');
 if(!Array.isArray(dataset.sessions)||dataset.sessions.length<=C1_REPORTED_THESIS_FORMATION_SESSIONS)
  throw new Error('Reported-thesis tournament requires accepted formation history');
 if(!dataset.metadata||typeof dataset.metadata!=='object'||Array.isArray(dataset.metadata))dataset.metadata={};
 dataset.metadata.c1ReportedThesisCandidate={contract:C1_REPORTED_THESIS_CONTRACT,candidateId,
  formationStartSessions:C1_REPORTED_THESIS_FORMATION_SESSIONS,skipRecentSessions:C1_REPORTED_THESIS_SKIP_RECENT_SESSIONS,
  substitutedFields:['researchFactors.return120Ex20','researchFactors.momentumPercentile']};
 // Keep scalar closes only for symbols that can join a historical peer set.
 // Retaining every accepted price-row object in 101 Maps exhausts the preview
 // worker's remaining headroom immediately after the Champion simulation.
 const includedSymbols=new Set(['SPY','QQQ']);
 for(const session of dataset.sessions)for(const field of ['signals','positionSignals'])
  for(const signal of session[field]||[]){const symbol=String(signal.symbol||signal.ticker||'');if(symbol)includedSymbols.add(symbol);}
 const window=Array.from({length:C1_REPORTED_THESIS_OBSERVATIONS},(_,index)=>sessionPriceMap(dataset.sessions[index],includedSymbols));
 let windowStart=0;
 for(let sessionIndex=C1_REPORTED_THESIS_FORMATION_SESSIONS;sessionIndex<dataset.sessions.length;sessionIndex++){
  const session=dataset.sessions[sessionIndex],rankedFields=['signals','positionSignals'];
  // The accepted compact replay partitions the historical cross-section across
  // these two fields. Any account-only rows belong to a separate live review
  // contract and must neither enlarge nor be rewritten by this tournament.
  const outputFields=rankedFields,eligibility=new Map(),observations=[];
  for(const field of rankedFields)for(const signal of session[field]||[]){
   const symbol=String(signal.symbol||signal.ticker||'');if(!symbol)continue;
   const eligible=observed(signal?.researchFactors?.return120Ex20);
   if(eligibility.has(symbol)&&eligibility.get(symbol)!==eligible)
    throw new Error('Champion formation eligibility is inconsistent for '+symbol+' on '+session.date);
   eligibility.set(symbol,eligible);
  }
  const spyRows=rowsFromWindow(window,windowStart,'SPY'),qqqRows=rowsFromWindow(window,windowStart,'QQQ');
  if(!spyRows||!qqqRows)throw new Error('Accepted SPY/QQQ formation rows are unavailable on '+session.date);
  for(const [symbol,eligible] of eligibility){
   if(!eligible)continue;
   const stockRows=rowsFromWindow(window,windowStart,symbol);
   if(!stockRows)throw new Error('Observed Champion factor contradicts reported-thesis price history for '+symbol+' on '+session.date);
   observations.push(candidateId==='ols-residual-120-ex-20'?{symbol,...c1OlsResidualObservation(stockRows,spyRows,qqqRows)}:
    {symbol,...c1DownsideResilienceObservation(stockRows,spyRows)});
  }
  let bySymbol;
  if(candidateId==='ols-residual-120-ex-20'){
   const percentiles=rankedPercentiles(observations,'score');
   bySymbol=new Map(observations.map(row=>[row.symbol,{factor:row.score,percentile:percentiles.get(row.symbol)}]));
  }else{
   const formation=rankedPercentiles(observations,'totalReturnPct'),resilience=rankedPercentiles(observations,'downsideExcessMeanPct');
   bySymbol=new Map(observations.map(row=>[row.symbol,{factor:row.totalReturnPct,
    percentile:.7*formation.get(row.symbol)+.3*resilience.get(row.symbol)}]));
  }
  for(const field of outputFields)for(const signal of session[field]||[]){
   const symbol=String(signal.symbol||signal.ticker||''),eligible=eligibility.get(symbol);
   const factors=signal.researchFactors||(signal.researchFactors={});
   if(eligible===false){factors.return120Ex20=null;factors.momentumPercentile=null;continue;}
   const row=bySymbol.get(symbol);
   if(!row)throw new Error('Reported-thesis peer evidence is unavailable for '+symbol+' on '+session.date);
   factors.return120Ex20=row.factor;factors.momentumPercentile=row.percentile;
  }
  if(sessionIndex+1<dataset.sessions.length){
   const enteringIndex=sessionIndex-C1_REPORTED_THESIS_SKIP_RECENT_SESSIONS+1;
   window[windowStart]=sessionPriceMap(dataset.sessions[enteringIndex],includedSymbols);
   windowStart=(windowStart+1)%C1_REPORTED_THESIS_OBSERVATIONS;
  }
 }
 return dataset;
}

export function buildC1ReportedThesisCandidate(dataset={},candidateId){
 return applyC1ReportedThesisCandidateInPlace(clone(dataset),candidateId);
}

function combineSummary(curve,sleeveSummaries,transactionCount){
 let highWater=100000,maxDrawdownPct=0;
 for(const row of curve){highWater=Math.max(highWater,row.equity);maxDrawdownPct=Math.min(maxDrawdownPct,(row.equity/highWater-1)*100);}
 const daily=[];for(let index=1;index<curve.length;index++)daily.push(curve[index].equity/curve[index-1].equity-1);
 const mean=daily.reduce((sum,value)=>sum+value,0)/(daily.length||1);
 const variance=daily.length>1?daily.reduce((sum,value)=>sum+(value-mean)**2,0)/(daily.length-1):0;
 return {metrics:{endingEquity:curve.at(-1)?.equity??100000,totalReturnPct:((curve.at(-1)?.equity??100000)/100000-1)*100,
  maxDrawdownPct,sharpe:variance>0?mean/Math.sqrt(variance)*Math.sqrt(252):null,
  transactionCount},sleeves:sleeveSummaries};
}

function validateComparison(dataset,startDate,endDate){
 if(!dataset||!Array.isArray(dataset.sessions))throw new Error('Existing accepted daily sessions are required');
 const dates=dataset.sessions.map(session=>session?.date);
 if(dates.some((date,index)=>typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!isUsMarketSessionDay(date)||(index&&date<=dates[index-1])))
  throw new Error('Existing sessions must have unique chronological exchange dates');
 if(dates.indexOf(startDate)<C1_REPORTED_THESIS_FORMATION_SESSIONS||!dates.includes(endDate)||endDate<startDate)
  throw new Error('Comparison dates require the complete fixed formation window');
}

export function runC1ReportedThesisTournamentMemoryBound({dataset,startDate,endDate,onProgress}={}){
 validateComparison(dataset,startDate,endDate);
 const progress=typeof onProgress==='function'?onProgress:()=>{},runArm=(arm)=>{
  const sleeveSummaries={};let curve=null,transactionCount=0;
  for(const sleeve of ids){
   progress({phase:'sleeve-start',arm,sleeve});
   const options={...clone(C1_FROZEN_OPTIONS[sleeve]),startDate,endDate,liquidateAtEnd:false};
   let simulation=simulatePointInTimePortfolio(dataset,options,null);
   if(curve===null)curve=simulation.curve.map(row=>({date:row.date,equity:C1_ACCOUNTING_WEIGHTS[sleeve]*row.equity}));
   else{
    if(simulation.curve.length!==curve.length||simulation.curve.some((row,index)=>row.date!==curve[index].date))
     throw new Error('Sleeve curves must use identical completed sessions');
    for(let index=0;index<curve.length;index++)curve[index].equity+=C1_ACCOUNTING_WEIGHTS[sleeve]*simulation.curve[index].equity;
   }
   const metrics=simulation.metrics||{},sleeveTransactions=simulation.trades?.length||0;
   transactionCount+=sleeveTransactions;
   sleeveSummaries[sleeve]={totalReturnPct:metrics.totalReturnPct??null,sharpe:metrics.sharpe??null,
    maxDrawdownPct:metrics.maxDrawdownPct??null,closedTrades:metrics.closedTrades??null,winRatePct:metrics.winRatePct??null,
    annualizedTurnoverPct:metrics.annualizedTurnoverPct??null,
    simpleDifferenceVsSpyPct:metrics.benchmarkComparisons?.SPY?.excessReturnPct??null,
    simpleDifferenceVsQqqPct:metrics.benchmarkComparisons?.QQQ?.excessReturnPct??null};
   progress({phase:'sleeve-end',arm,sleeve,transactionCount:sleeveTransactions});
   simulation=null;
  }
  return combineSummary(curve,sleeveSummaries,transactionCount);
 };
 const champion=runArm('champion'),challengers={};
 for(const candidate of C1_REPORTED_THESIS_CANDIDATES){
  progress({phase:'candidate-transform-start',candidateId:candidate.id});
  applyC1ReportedThesisCandidateInPlace(dataset,candidate.id);
  progress({phase:'candidate-transform-end',candidateId:candidate.id});
  challengers[candidate.id]=runArm(candidate.id);
 }
 const comparisons=Object.fromEntries(Object.entries(challengers).map(([candidateId,result])=>[candidateId,{
  returnDifferencePercentagePoints:result.metrics.totalReturnPct-champion.metrics.totalReturnPct,
  endingEquityDifference:result.metrics.endingEquity-champion.metrics.endingEquity,
  maxDrawdownDifferencePercentagePoints:result.metrics.maxDrawdownPct-champion.metrics.maxDrawdownPct,
  sharpeDifference:(result.metrics.sharpe??0)-(champion.metrics.sharpe??0),
  transactionCountDifference:result.metrics.transactionCount-champion.metrics.transactionCount,
} ]));
 return {contract:C1_REPORTED_THESIS_CONTRACT,scope:'offline-simulation-only',executable:false,productionChanged:false,
  startDate,endDate,preRegistration:{formationStartSessions:120,skipRecentSessions:20,parameterGrid:false,newProvider:false,
   candidateIds:C1_REPORTED_THESIS_CANDIDATES.map(row=>row.id),downsideBlend:{formation:.7,resilience:.3}},
  champion,challengers,comparisons,limitations:[
   'Both candidates are constrained daily-price adaptations, not exact replications of the cited published portfolios.',
   'Historical results can reject but cannot validate a candidate.',
   'No application path imports this module and this result cannot authorize a recommendation or trade.',
  ]};
}
