import {isUsMarketSessionDay,previousMarketSessionDay} from './marketSession';
import {readC1RecentMomentum} from './c1RecentMomentumGate';

// Owner-authorized November 9 enhancement. Apply after this completed close;
// no already accepted opening, holding or financial record is reinterpreted.
export const C1_QUALIFIED_SELECTION='c1-momentum-qualified-selection-v1';
export const C1_QUALIFIED_SELECTION_SOURCE_DATE='2026-11-09';
export const C1_QUALIFIED_SELECTION_QUEUE_COUNT=9;

export const c1QualifiedSelectionApplies=date=>typeof date==='string'&&
 date>=C1_QUALIFIED_SELECTION_SOURCE_DATE&&isUsMarketSessionDay(date);

// Rank only against completed-session inputs, never intraday quotes/events,
// account cash, ownership or the browser's displayed subset. Absolute research
// scores remain intact. Missing evidence cannot qualify a candidate.
export function c1MomentumQualifiedPool(rankedPool,review,date){
 return rankedPool.filter(candidate=>{
  const evidence=review(candidate);
  return evidence?.sourceSessionDate===date&&evidence.available===true&&evidence.entryAllowed===true;
 });
}

// Existing/adopted holdings retain their original rank basis. Only purchases
// actually initialized by the new live engine opt into the qualified basis.
export function c1QualifiedPurchaseApplies(date){
 return isUsMarketSessionDay(date)&&c1QualifiedSelectionApplies(previousMarketSessionDay(date));
}

// Invocation-local indexes avoid repeatedly scanning every price/signal row
// for every peer on every replayed close. Preserve duplicate rows and every
// session flag; the existing gate remains the sole evidence validator. No
// result survives an invocation or a change to the accepted input history.
export function createC1QualifiedMomentumReview(history){
 const indexes=new Map(history.map((session,index)=>[session.date,index]));
 const rows=new WeakMap(),results=new Map();
 const symbolOf=row=>String(row?.symbol||row?.ticker||row||'').toUpperCase().trim();
 const fields=['prices','signals','positionSignals','accountHoldingSignals','legacyHoldingSignals'];
 function forSymbol(session,symbol){
  if(!rows.has(session)){
   const maps={};
   for(const field of fields){
    const map=new Map();
    for(const row of Array.isArray(session[field])?session[field]:[]){
     const key=symbolOf(row);if(!map.has(key))map.set(key,[]);map.get(key).push(row);
    }
    maps[field]=map;
   }
   rows.set(session,maps);
  }
  return {...session,...Object.fromEntries(fields.map(field=>[field,rows.get(session)[field].get(symbol)||[]]))};
 }
 return (date,symbol)=>{
  const key=date+':'+symbol;
  if(!results.has(key)){
   const index=indexes.get(date),window=Number.isSafeInteger(index)?history.slice(Math.max(0,index-5),index+1):[];
   results.set(key,readC1RecentMomentum({sessions:window.map(session=>forSymbol(session,symbol)),sessionIndex:window.length-1,symbol}));
  }
  return results.get(key);
 };
}
