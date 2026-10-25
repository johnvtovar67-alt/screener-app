// Bounded access to FMP's supported stable quote endpoint. This helper avoids
// retry storms when multiple app surfaces ask for the same symbol together.
import {toFmpSymbol as norm} from './fmpSymbols';
const CACHE_KEY='__screenerFmpQuoteCacheV1';
const INFLIGHT_KEY='__screenerFmpQuoteInflightV1';
const COOLDOWN_KEY='__screenerFmpQuoteCooldownV1';
const ATTEMPT_KEY='__screenerFmpQuoteAttemptV1';
const FRESH_MS=60*1000;
const STALE_MS=24*60*60*1000;
const FAILURE_COOLDOWN_MS=20*1000;
const REFRESH_MIN_INTERVAL_MS=20*1000;
const MAX_CACHE=300;
const stores=()=>({cache:globalThis[CACHE_KEY]||(globalThis[CACHE_KEY]=new Map()),inflight:globalThis[INFLIGHT_KEY]||(globalThis[INFLIGHT_KEY]=new Map()),cooldown:globalThis[COOLDOWN_KEY]||(globalThis[COOLDOWN_KEY]=new Map()),attempts:globalThis[ATTEMPT_KEY]||(globalThis[ATTEMPT_KEY]=new Map())});
function trim(cache){while(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);}
function usable(row,symbol){return row&&norm(row.symbol)===symbol&&Number.isFinite(Number(row.price??row.currentPrice??row.lastPrice))&&Number(row.price??row.currentPrice??row.lastPrice)>0;}
function observed(row,entry,cacheStatus,request){
  const fetchedAt=new Date(entry.fetchedAt).toISOString();
  return {...row,_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteCache:cacheStatus,
    _fmpQuoteFetchedAt:fetchedAt,_fmpQuoteRequest:request,
    _fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol:norm(row.symbol).replace('-','.'),
      price:Number(row.price??row.currentPrice??row.lastPrice),timestamp:Number(row.timestamp),fetchedAt}};
}

export async function fetchFmpQuote(symbol,{timeoutMs=8000,forceRefresh=false}={}){
  const apiKey=process.env.FMP_API_KEY;if(!apiKey)throw new Error('Missing FMP_API_KEY in environment variables.');
  const clean=norm(symbol);if(!clean)throw new Error('Missing quote symbol.');
  const{cache,inflight,cooldown,attempts}=stores(),now=Date.now(),cached=cache.get(clean);
  const requestInfo={requestedAt:new Date(now).toISOString(),refreshRequested:forceRefresh===true,providerAttempted:false,newDataAccepted:false};
  if(inflight.has(clean))return inflight.get(clean).then(row=>forceRefresh?{...row,
    _fmpQuoteRequest:{...row._fmpQuoteRequest,refreshRequested:true}}:row);
  if((cooldown.get(clean)||0)>now){if(cached&&now-cached.fetchedAt<STALE_MS)return observed(cached.row,cached,'stale-cooldown',{...requestInfo,refreshStatus:'failure-cooldown',retryAt:new Date(cooldown.get(clean)).toISOString()});throw new Error(`FMP quote for ${clean} is in a bounded retry cooldown.`);}
  if(forceRefresh&&cached&&now-(attempts.get(clean)||0)<REFRESH_MIN_INTERVAL_MS)
    return observed(cached.row,cached,now-cached.fetchedAt<FRESH_MS?'fresh-memory':'stale-rate-limited',
      {...requestInfo,refreshStatus:'rate-limited',retryAt:new Date(attempts.get(clean)+REFRESH_MIN_INTERVAL_MS).toISOString()});
  if(!forceRefresh&&cached&&now-cached.fetchedAt<FRESH_MS)return observed(cached.row,cached,'fresh-memory',{...requestInfo,refreshStatus:'memory-cache'});
  attempts.set(clean,now);trim(attempts);
  const request=(async()=>{
    try{
      const url=`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${apiKey}`,response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});
      if(!response.ok)throw new Error(`FMP stable quote failed: ${response.status}`);
      const body=await response.json(),row=Array.isArray(body)?body[0]:body;if(!usable(row,clean))throw new Error(`No matching usable stable quote returned for ${clean}.`);
      const priorStamp=Number(cached?.row.timestamp),nextStamp=Number(row.timestamp);
      const priorMs=priorStamp>1e12?priorStamp:priorStamp*1000,nextMs=nextStamp>1e12?nextStamp:nextStamp*1000;
      if(Number.isFinite(priorMs)&&priorMs>0&&priorMs<=Date.now()&&Number.isFinite(nextMs)&&nextMs>0&&nextMs<priorMs)
        throw new Error('FMP returned an older quote observation');
      const entry={fetchedAt:Date.now(),row},changed=!cached||Number(cached.row.timestamp)!==Number(row.timestamp)||Number(cached.row.price)!==Number(row.price);
      cache.set(clean,entry);trim(cache);cooldown.delete(clean);
      return observed(row,entry,'live',{...requestInfo,providerAttempted:true,newDataAccepted:changed,refreshStatus:changed?'provider-updated':'provider-unchanged'});
    }catch(error){
      cooldown.set(clean,Date.now()+FAILURE_COOLDOWN_MS);
      if(cached&&Date.now()-cached.fetchedAt<STALE_MS)return {...observed(cached.row,cached,'stale-fallback',
        {...requestInfo,providerAttempted:true,refreshStatus:'provider-failed'}),_fmpQuoteWarning:'Fresh provider verification failed; the retained quote is unverified.'};
      throw error;
    }finally{inflight.delete(clean);}
  })();
  inflight.set(clean,request);return request;
}
