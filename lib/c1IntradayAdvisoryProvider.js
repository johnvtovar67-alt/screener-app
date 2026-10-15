import {c1IntradaySymbol,validateC1IntradaySymbols,c1IntradayTimestamp} from './c1IntradayAdvisory';

const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const toProviderSymbol=symbol=>symbol.replace('.', '-');
const clone=snapshot=>({...snapshot,quotes:snapshot.quotes.map(row=>({...row}))});

export function sanitizeC1IntradayQuotes(body,symbols){
 if(!Array.isArray(body))throw new Error('Intraday quote source returned an invalid response.');
 const requested=new Set(symbols),seen=new Set(),duplicates=new Set(),quotes=[];
 for(const row of body){
  const symbol=c1IntradaySymbol(row?.symbol);if(!symbol||!requested.has(symbol))continue;
  if(seen.has(symbol))duplicates.add(symbol);seen.add(symbol);
  if(!positive(row.price))continue;
  const timestamp=c1IntradayTimestamp(row.timestamp);
  quotes.push({symbol,price:row.price,open:positive(row.open)?row.open:null,
   previousClose:positive(row.previousClose)?row.previousClose:null,dayHigh:positive(row.dayHigh)?row.dayHigh:null,
   dayLow:positive(row.dayLow)?row.dayLow:null,timestamp});
 }
 return quotes.filter(row=>!duplicates.has(row.symbol));
}

// Bounded process-memory cache only. Errors intentionally exclude provider
// response bodies, request URLs and credentials. No retry or storage is used.
export function createC1IntradayQuoteProvider({fetchImpl=fetch,nowMs=()=>Date.now(),apiKey=()=>process.env.FMP_API_KEY,timeoutMs=8000}={}){
 const cache=new Map(),inflight=new Map();let cooldownUntil=0;
 const trim=()=>{while(cache.size>24)cache.delete(cache.keys().next().value);};
 return async function getC1IntradayQuotes(input){
  const symbols=validateC1IntradaySymbols(input),key=symbols.join(','),now=nowMs(),cached=cache.get(key);
  if(cached&&now-cached.fetchedAt>=0&&now-cached.fetchedAt<60000)return {...clone(cached.snapshot),cacheStatus:'fresh-memory'};
  if(inflight.has(key)){
   const snapshot=clone(await inflight.get(key));return {...snapshot,cacheStatus:snapshot.cacheStatus==='live'?'inflight':snapshot.cacheStatus};
  }
  if(now<cooldownUntil){
   if(cached&&now-cached.fetchedAt<900000)return {...clone(cached.snapshot),cacheStatus:'stale-cooldown',warning:'Quote source is in a bounded retry cooldown; cached observations are retained.'};
   throw new Error('Intraday quote source is in a bounded retry cooldown.');
  }
  if(inflight.size>=8)throw new Error('Intraday quote requests are busy; retry after the current refresh.');
  const secret=apiKey();if(typeof secret!=='string'||!secret)throw new Error('Intraday quote source is not configured.');
  const request=Promise.resolve().then(async()=>{
   try{
    const url=new URL('https://financialmodelingprep.com/stable/batch-quote');
    url.searchParams.set('symbols',symbols.map(toProviderSymbol).join(','));url.searchParams.set('apikey',secret);
    const response=await fetchImpl(url.toString(),{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok)throw new Error('Intraday quote source is unavailable.');
    const quotes=sanitizeC1IntradayQuotes(await response.json(),symbols);
    if(!quotes.length)throw new Error('Intraday quote source returned no usable observations.');
    const received=nowMs(),snapshot={contract:'c1-intraday-quotes-v1',receivedAt:new Date(received).toISOString(),cacheStatus:'live',quotes,
     ...(quotes.length<symbols.length?{warning:'Some requested symbols have no unique usable quote observation.'}:{})};
    cache.set(key,{fetchedAt:received,snapshot});trim();cooldownUntil=0;return clone(snapshot);
   }catch{
    cooldownUntil=nowMs()+20000;
    if(cached&&nowMs()-cached.fetchedAt<900000)return {...clone(cached.snapshot),cacheStatus:'stale-fallback',warning:'Quote source refresh failed; cached observations are retained.'};
    throw new Error('Intraday quote source is unavailable; refresh later.');
   }finally{inflight.delete(key);}
  });
  inflight.set(key,request);return request;
 };
}

let provider;
export async function fetchC1IntradayQuotes(symbols){
 if(!provider)provider=createC1IntradayQuoteProvider();
 return provider(symbols);
}
