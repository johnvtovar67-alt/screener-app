// Bounded access to FMP's supported stable quote endpoint. This helper avoids
// retry storms when multiple app surfaces ask for the same symbol together.
const CACHE_KEY='__screenerFmpQuoteCacheV1';
const INFLIGHT_KEY='__screenerFmpQuoteInflightV1';
const COOLDOWN_KEY='__screenerFmpQuoteCooldownV1';
const FRESH_MS=60*1000;
const STALE_MS=24*60*60*1000;
const FAILURE_COOLDOWN_MS=20*1000;
const MAX_CACHE=300;
const norm=value=>String(value||'').replace('.', '-').toUpperCase().trim();
const stores=()=>({cache:globalThis[CACHE_KEY]||(globalThis[CACHE_KEY]=new Map()),inflight:globalThis[INFLIGHT_KEY]||(globalThis[INFLIGHT_KEY]=new Map()),cooldown:globalThis[COOLDOWN_KEY]||(globalThis[COOLDOWN_KEY]=new Map())});
function trim(cache){while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);}
function usable(row){return row&&Number(row.price??row.currentPrice??row.lastPrice)>0;}

export async function fetchFmpQuote(symbol,{timeoutMs=8000}={}){
  const apiKey=process.env.FMP_API_KEY;if(!apiKey)throw new Error('Missing FMP_API_KEY in environment variables.');
  const clean=norm(symbol);if(!clean)throw new Error('Missing quote symbol.');
  const{cache,inflight,cooldown}=stores(),now=Date.now(),cached=cache.get(clean);
  if(cached&&now-cached.fetchedAt<FRESH_MS)return{...cached.row,_fmpQuoteCache:'fresh-memory'};
  if(inflight.has(clean))return inflight.get(clean);
  if((cooldown.get(clean)||0)>now){if(cached&&now-cached.fetchedAt<STALE_MS)return{...cached.row,_fmpQuoteCache:'stale-cooldown'};throw new Error(`FMP quote for ${clean} is in a bounded retry cooldown.`);}
  const request=(async()=>{
    try{
      const url=`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${apiKey}`,response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw new Error(`FMP stable quote failed: ${response.status}`);
      const body=await response.json(),row=Array.isArray(body)?body[0]:body;if(!usable(row))throw new Error(`No usable stable quote returned for ${clean}.`);
      cache.set(clean,{fetchedAt:Date.now(),row});trim(cache);cooldown.delete(clean);return{...row,_fmpQuoteCache:'live'};
    }catch(error){
      cooldown.set(clean,Date.now()+FAILURE_COOLDOWN_MS);
      if(cached&&Date.now()-cached.fetchedAt<STALE_MS)return{...cached.row,_fmpQuoteCache:'stale-fallback',_fmpQuoteWarning:error?.message||'Live quote failed'};
      throw error;
    }finally{inflight.delete(clean);}
  })();
  inflight.set(clean,request);return request;
}
