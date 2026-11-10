import {readC1CurrentEventEvidence} from './c1CurrentEventEvidence';
import {assertTop5Active} from './top5Diagnostics';

const CACHE_KEY='__c1FullUniverseVerificationV2';
const BATCH_SIZE=32;
const UNVERIFIED_RETRY_MS=30_000;
const normalize=value=>String(value||'').replace('-','.').toUpperCase().trim();

// A batch is a transport budget, never a ranking cutoff. The exact accepted
// source identity owns its continuation, and every refresh advances unchecked
// names before retrying temporarily unavailable earlier names.
export async function collectC1UniverseEvents({sourceIdentity,symbols=[],collect,now=new Date(),cache}={}){
 const wanted=[...new Set(symbols.map(normalize).filter(Boolean))];
 if(typeof sourceIdentity!=='string'||!sourceIdentity||typeof collect!=='function')throw new Error('Dated universe verification requires its source and collector');
 const store=cache||(globalThis[CACHE_KEY]||(globalThis[CACHE_KEY]=new Map()));
 const key=sourceIdentity+':'+wanted.join('|'),time=new Date(now).getTime();
 let entry=store.get(key);
 if(!entry||entry.expiresAt<=time){entry={events:new Map(),attempted:new Set(),expiresAt:time+5*60_000};store.set(key,entry);}
 let evaluatedAt=time;
 const valid=risk=>readC1CurrentEventEvidence(risk,new Date(evaluatedAt))!=='UNVERIFIED';
 const unchecked=wanted.filter(symbol=>!entry.attempted.has(symbol));
 const retry=wanted.filter(symbol=>entry.attempted.has(symbol)&&!valid(entry.events.get(symbol))&&time-(entry.lastAttempt?.get(symbol)||0)>=UNVERIFIED_RETRY_MS);
 const batch=[...unchecked,...retry].slice(0,BATCH_SIZE);
 if(batch.length){
  const collected=await collect(batch);
  assertTop5Active();
  evaluatedAt=Math.max(time,Date.now());
  if(!(collected instanceof Map))throw new Error('Current event collector returned an invalid universe batch');
  entry.expiresAt=time+5*60_000;
  entry.lastAttempt ||= new Map();
  for(const symbol of batch){entry.attempted.add(symbol);entry.lastAttempt.set(symbol,time);if(collected.has(symbol))entry.events.set(symbol,collected.get(symbol));}
 }
 const events=new Map(wanted.filter(symbol=>entry.events.has(symbol)).map(symbol=>{
  const risk=entry.events.get(symbol);
  return [symbol,valid(risk)?risk:{...risk,symbol,status:'Manual',blockNewCapital:true,checkComplete:false,manualCheckRequired:true}];
 }));
 const pending=wanted.filter(symbol=>!entry.attempted.has(symbol));
 const unverified=wanted.filter(symbol=>entry.attempted.has(symbol)&&!valid(entry.events.get(symbol)));
 while(store.size>8)store.delete(store.keys().next().value);
 return {events,scan:{contract:'c1-current-universe-scan-v2',sourceIdentity,total:wanted.length,
  scanned:wanted.length-pending.length,pending:pending.length,complete:pending.length===0,
  evidenceComplete:pending.length===0&&unverified.length===0,unverifiedSymbols:unverified,
  nextCursor:pending.length?wanted.indexOf(pending[0]):null,
  status:pending.length?'incomplete':unverified.length?'evidence-incomplete':'complete'}};
}

const OPENING_CACHE_KEY='__c1OpeningAnchorScanV2';
// Only immutable, dated market anchors are cached. Quotes, account balances,
// order targets and authorization never enter this continuation cache.
export async function collectC1OpeningAnchorScan({sourceIdentity,symbols=[],collect,now=new Date(),cache}={}){
 const wanted=[...new Set(symbols.map(normalize).filter(Boolean))];
 const store=cache||(globalThis[OPENING_CACHE_KEY]||(globalThis[OPENING_CACHE_KEY]=new Map()));
 const time=new Date(now).getTime();let entry=store.get(sourceIdentity);
 if(!entry||entry.expiresAt<=time){entry={anchors:new Map(),expiresAt:time+5*60_000};store.set(sourceIdentity,entry);}
 const missing=wanted.filter(symbol=>!entry.anchors.has(symbol)),batch=missing.slice(0,BATCH_SIZE);
 let cursor=0;
 const workers=Array.from({length:Math.min(8,batch.length)},async()=>{
  while(cursor<batch.length){const symbol=batch[cursor++],anchor=await collect(symbol);assertTop5Active();entry.anchors.set(symbol,anchor);}
 });
 const settled=await Promise.allSettled(workers),failure=settled.find(result=>result.status==='rejected');
 if(failure)throw failure.reason;
 if(batch.length)entry.expiresAt=time+5*60_000;
 const pending=wanted.filter(symbol=>!entry.anchors.has(symbol));
 while(store.size>8)store.delete(store.keys().next().value);
 return {anchors:new Map(wanted.filter(symbol=>entry.anchors.has(symbol)).map(symbol=>[symbol,entry.anchors.get(symbol)])),
  scan:{contract:'c1-dated-universe-scan-v1',sourceIdentity,total:wanted.length,completed:wanted.length-pending.length,
   remaining:pending.length,complete:pending.length===0,nextCursor:pending.length?wanted.indexOf(pending[0]):null,status:pending.length?'incomplete':'complete'}};
}
