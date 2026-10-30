// Diagnostic provenance is private to object identity; financial JSON and
// authorization remain byte-for-byte independent of this optional observation.
const receipts=new WeakMap(),reported=new WeakSet();
export function bindC1JourneyReceipt(view,response){
 try{const token=response?.headers?.get?.('x-c1-operational-receipt');
  if(view&&typeof view==='object'&&typeof token==='string'&&/^c1jo1\.[-_A-Za-z0-9]+\.[-_A-Za-z0-9]{43}$/.test(token)&&token.length<=1800)receipts.set(view,token);
 }catch{}
 return view;
}
export function inheritC1JourneyReceipt(view,source){
 if(view&&typeof view==='object'&&source&&receipts.has(source))receipts.set(view,receipts.get(source));return view;
}
export function reportC1PublishedJourney(view,{generation=0,paused=false,fetcher=globalThis.fetch}={}){
 if(!view||!receipts.has(view)||reported.has(view)||typeof fetcher!=='function'||!Number.isSafeInteger(generation)||generation<0||generation>1000000)return;
 reported.add(view);
 try{Promise.resolve(fetcher('/api/c1-journey-observation',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({token:receipts.get(view),generation,outcome:paused?'PAUSED':'PUBLISHED'}),
  signal:AbortSignal.timeout(5000),cache:'no-store'})).catch(()=>{});}catch{}
}
