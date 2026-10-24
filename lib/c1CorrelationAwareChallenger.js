// Preview-only portfolio-construction challenger. C1 still defines the eligible
// queue and all exits. This module only orders the existing unheld entry queue
// by trailing return correlation to current/selected holdings.
import {simulatePointInTimePortfolio as simulateChampion} from './c1AccountSimulator';
import {simulatePointInTimePortfolio as simulateCorrelationAware} from './c1CorrelationAwareSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {C1_ACCOUNTING_WEIGHTS} from './c1SleeveAccounting';
import {isUsMarketSessionDay} from './marketSession';

export const C1_CORRELATION_CHALLENGER_CONTRACT='c1-correlation-aware-entry-v1';
export const C1_CORRELATION_LOOKBACK_RETURNS=60;
export const C1_CORRELATION_REQUIRED_CLOSES=C1_CORRELATION_LOOKBACK_RETURNS+1;
export const C1_CORRELATION_ARMS=Object.freeze(['champion','correlation-aware-entry-60']);

const clone=value=>JSON.parse(JSON.stringify(value));
const sleeveIds=Object.keys(C1_ACCOUNTING_WEIGHTS);
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const symbolOf=value=>String(value?.symbol||value?.ticker||value||'').trim().toUpperCase();

export function c1CorrelationRetainedStartIndex(sessionDates=[],startDate){
 if(!Array.isArray(sessionDates)||typeof startDate!=='string')throw new Error('Correlation challenger requires accepted session dates');
 const start=sessionDates.indexOf(startDate),retained=start-C1_CORRELATION_LOOKBACK_RETURNS;
 if(start<0||retained<0)throw new Error('Correlation challenger retained window is unavailable');
 return retained;
}

function priceMap(session){
 const map=new Map();
 for(const row of session?.prices||[]){
  const symbol=symbolOf(row);
  if(!symbol)continue;
  if(map.has(symbol))throw new Error('Duplicate correlation price for '+symbol+' on '+session.date);
  if(positive(row.close))map.set(symbol,row.close);
 }
 return map;
}

export function c1PearsonReturnCorrelation(priceMaps=[],leftSymbol,rightSymbol){
 const left=symbolOf(leftSymbol),right=symbolOf(rightSymbol);
 if(!left||!right||priceMaps.length!==C1_CORRELATION_REQUIRED_CLOSES)return null;
 const leftReturns=[],rightReturns=[];
 for(let index=1;index<priceMaps.length;index++){
  const leftNow=priceMaps[index].get(left),leftPrior=priceMaps[index-1].get(left);
  const rightNow=priceMaps[index].get(right),rightPrior=priceMaps[index-1].get(right);
  if(!positive(leftNow)||!positive(leftPrior)||!positive(rightNow)||!positive(rightPrior))return null;
  leftReturns.push(Math.log(leftNow/leftPrior));rightReturns.push(Math.log(rightNow/rightPrior));
 }
 const leftMean=leftReturns.reduce((sum,value)=>sum+value,0)/leftReturns.length;
 const rightMean=rightReturns.reduce((sum,value)=>sum+value,0)/rightReturns.length;
 let covariance=0,leftVariance=0,rightVariance=0;
 for(let index=0;index<leftReturns.length;index++){
  const leftDelta=leftReturns[index]-leftMean,rightDelta=rightReturns[index]-rightMean;
  covariance+=leftDelta*rightDelta;leftVariance+=leftDelta*leftDelta;rightVariance+=rightDelta*rightDelta;
 }
 const denominator=Math.sqrt(leftVariance*rightVariance);
 return denominator>1e-20?covariance/denominator:null;
}

export function createC1CorrelationAwareEntryOrder(dataset={}){
 if(!Array.isArray(dataset.sessions)||dataset.sessions.length<C1_CORRELATION_REQUIRED_CLOSES)
  throw new Error('Correlation challenger requires accepted daily history');
 const indexByDate=new Map(dataset.sessions.map((session,index)=>[session.date,index]));
 if(indexByDate.size!==dataset.sessions.length)throw new Error('Correlation challenger requires unique session dates');
 let recent=[],lastIndex=-1;
 const diagnostics={sessions:0,reorderedSessions:0,unchangedSessions:0,incompleteFallbackSessions:0,
  selectedPairCount:0,selectedCorrelationSum:0,minSelectedCorrelation:null,maxSelectedCorrelation:null};
 const advance=sessionDate=>{
  const index=indexByDate.get(sessionDate);
  if(!Number.isInteger(index))throw new Error('Correlation session is absent from accepted history');
  if(index<=lastIndex){recent=[];lastIndex=-1;}
  const first=lastIndex<0?Math.max(0,index-C1_CORRELATION_LOOKBACK_RETURNS):lastIndex+1;
  for(let cursor=first;cursor<=index;cursor++){
   recent.push(priceMap(dataset.sessions[cursor]));
   if(recent.length>C1_CORRELATION_REQUIRED_CLOSES)recent.shift();
  }
  lastIndex=index;
 };
 const complete=symbol=>recent.length===C1_CORRELATION_REQUIRED_CLOSES&&recent.every(map=>positive(map.get(symbol)));
 const correlation=(left,right)=>c1PearsonReturnCorrelation(recent,left,right);
 const order=({signals=[],heldSymbols=[],sessionDate,rankedEntryQueueCount}={})=>{
  advance(sessionDate);diagnostics.sessions++;
  const original=[...signals],held=new Set(heldSymbols.map(symbolOf));
  const unheld=original.filter(signal=>!held.has(symbolOf(signal)));
  const heldRows=original.filter(signal=>held.has(symbolOf(signal)));
  const queueCount=Math.max(1,Math.floor(Number(rankedEntryQueueCount)||1));
  const pool=unheld.slice(0,queueCount),tail=unheld.slice(queueCount);
  if(pool.length<2){diagnostics.unchangedSessions++;return [...pool,...tail,...heldRows];}
  const originalIndex=new Map(pool.map((signal,index)=>[symbolOf(signal),index]));
  const incompleteSlots=new Map(),completeSignals=[];
  for(let index=0;index<pool.length;index++){
   const signal=pool[index],symbol=symbolOf(signal);
   if(complete(symbol))completeSignals.push(signal);else incompleteSlots.set(index,signal);
  }
  const completeHeld=[...held].filter(complete);
  if(completeHeld.length!==held.size)diagnostics.incompleteFallbackSessions++;
  const anchors=[...completeHeld],remaining=[...completeSignals],orderedComplete=[];
  while(remaining.length){
   let chosen=remaining[0],chosenAverage=null;
   if(anchors.length){
    const scored=remaining.map(signal=>{
     const symbol=symbolOf(signal),values=anchors.map(anchor=>correlation(symbol,anchor));
     return {signal,average:values.every(Number.isFinite)?values.reduce((sum,value)=>sum+value,0)/values.length:null};
    });
    const available=scored.filter(row=>Number.isFinite(row.average)).sort((left,right)=>
     left.average-right.average||originalIndex.get(symbolOf(left.signal))-originalIndex.get(symbolOf(right.signal))||
     symbolOf(left.signal).localeCompare(symbolOf(right.signal)));
    if(available.length){chosen=available[0].signal;chosenAverage=available[0].average;}
   }
   orderedComplete.push(chosen);anchors.push(symbolOf(chosen));remaining.splice(remaining.indexOf(chosen),1);
   if(Number.isFinite(chosenAverage)){
    diagnostics.selectedPairCount++;diagnostics.selectedCorrelationSum+=chosenAverage;
    diagnostics.minSelectedCorrelation=diagnostics.minSelectedCorrelation===null?chosenAverage:Math.min(diagnostics.minSelectedCorrelation,chosenAverage);
    diagnostics.maxSelectedCorrelation=diagnostics.maxSelectedCorrelation===null?chosenAverage:Math.max(diagnostics.maxSelectedCorrelation,chosenAverage);
   }
  }
  const selected=[];let completeIndex=0;
  for(let index=0;index<pool.length;index++)selected.push(incompleteSlots.get(index)||orderedComplete[completeIndex++]);
  if(incompleteSlots.size)diagnostics.incompleteFallbackSessions++;
  const changed=selected.some((signal,index)=>symbolOf(signal)!==symbolOf(pool[index]));
  if(changed)diagnostics.reorderedSessions++;else diagnostics.unchangedSessions++;
  return [...selected,...tail,...heldRows];
 };
 const summary=()=>({...diagnostics,
  meanSelectedCorrelation:diagnostics.selectedPairCount?diagnostics.selectedCorrelationSum/diagnostics.selectedPairCount:null,
  lookbackReturnSessions:C1_CORRELATION_LOOKBACK_RETURNS,queueRule:'existing-C1-unheld-entry-queue',threshold:null});
 return {order,summary};
}

function combineSummary(curve,sleeves,transactionCount){
 let highWater=100000,maxDrawdownPct=0;
 for(const row of curve){highWater=Math.max(highWater,row.equity);maxDrawdownPct=Math.min(maxDrawdownPct,(row.equity/highWater-1)*100);}
 const daily=[];for(let index=1;index<curve.length;index++)daily.push(curve[index].equity/curve[index-1].equity-1);
 const mean=daily.reduce((sum,value)=>sum+value,0)/(daily.length||1);
 const variance=daily.length>1?daily.reduce((sum,value)=>sum+(value-mean)**2,0)/(daily.length-1):0;
 return {metrics:{endingEquity:curve.at(-1)?.equity??100000,totalReturnPct:((curve.at(-1)?.equity??100000)/100000-1)*100,
  maxDrawdownPct,sharpe:variance>0?mean/Math.sqrt(variance)*Math.sqrt(252):null,transactionCount},sleeves};
}

function validate(dataset,startDate,endDate){
 if(!dataset||!Array.isArray(dataset.sessions))throw new Error('Existing accepted daily sessions are required');
 const dates=dataset.sessions.map(session=>session?.date);
 if(dates.some((date,index)=>typeof date!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!isUsMarketSessionDay(date)||(index&&date<=dates[index-1])))
  throw new Error('Existing sessions must have unique chronological exchange dates');
 if(dates.indexOf(startDate)<C1_CORRELATION_LOOKBACK_RETURNS||!dates.includes(endDate)||endDate<startDate)
  throw new Error('Correlation comparison dates require the fixed lookback');
}

export function runC1CorrelationArm({dataset,arm,startDate,endDate,onProgress}={}){
 validate(dataset,startDate,endDate);
 if(!C1_CORRELATION_ARMS.includes(arm))throw new Error('Unknown correlation challenger arm');
 const progress=typeof onProgress==='function'?onProgress:()=>{};
 const sleeveSummaries={},constructionDiagnostics={};let curve=null,transactionCount=0;
 for(const sleeve of sleeveIds){
  progress({phase:'sleeve-start',arm,sleeve});
  const options={...clone(C1_FROZEN_OPTIONS[sleeve]),startDate,endDate,liquidateAtEnd:false};
  let simulator=simulateChampion;
  if(arm==='correlation-aware-entry-60'){
   const selector=createC1CorrelationAwareEntryOrder(dataset);
   options.correlationAwareEntryOrder=selector.order;simulator=simulateCorrelationAware;
   constructionDiagnostics[sleeve]=selector;
  }
  let simulation=simulator(dataset,options,null);
  if(curve===null)curve=simulation.curve.map(row=>({date:row.date,equity:C1_ACCOUNTING_WEIGHTS[sleeve]*row.equity}));
  else{
   if(simulation.curve.length!==curve.length||simulation.curve.some((row,index)=>row.date!==curve[index].date))
    throw new Error('Sleeve curves must use identical completed sessions');
   for(let index=0;index<curve.length;index++)curve[index].equity+=C1_ACCOUNTING_WEIGHTS[sleeve]*simulation.curve[index].equity;
  }
  const metrics=simulation.metrics||{},count=simulation.trades?.length||0;transactionCount+=count;
  sleeveSummaries[sleeve]={totalReturnPct:metrics.totalReturnPct??null,sharpe:metrics.sharpe??null,
   maxDrawdownPct:metrics.maxDrawdownPct??null,closedTrades:metrics.closedTrades??null,winRatePct:metrics.winRatePct??null,
   annualizedTurnoverPct:metrics.annualizedTurnoverPct??null,
   simpleDifferenceVsSpyPct:metrics.benchmarkComparisons?.SPY?.excessReturnPct??null,
   simpleDifferenceVsQqqPct:metrics.benchmarkComparisons?.QQQ?.excessReturnPct??null};
  if(constructionDiagnostics[sleeve])constructionDiagnostics[sleeve]=constructionDiagnostics[sleeve].summary();
  progress({phase:'sleeve-end',arm,sleeve,transactionCount:count});simulation=null;
 }
 return {contract:C1_CORRELATION_CHALLENGER_CONTRACT,scope:'offline-simulation-only',executable:false,productionChanged:false,
  arm,startDate,endDate,preRegistration:{lookbackReturnSessions:60,entryQueueCount:9,threshold:null,
   originalC1RankEligibility:true,originalExitRanks:true,parameterGrid:false,newProvider:false},
  summary:combineSummary(curve,sleeveSummaries,transactionCount),constructionDiagnostics,
  limitations:['This changes entry ordering only; it does not change C1 rank eligibility or exit ranks.',
   'Historical results can reject but cannot validate a candidate.',
   'No application path imports this module and this result cannot authorize a recommendation or trade.']};
}
