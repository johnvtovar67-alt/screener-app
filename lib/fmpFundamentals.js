// Resilient FMP fundamental enrichment shared by broad and single-symbol analysis.
// Design goals: never fan out into legacy/restricted endpoints, never retry a hard
// subscription/rate-limit response, and prefer cached verified data over request storms.

import {put,list,get} from '@vercel/blob';

const FUNDAMENTAL_TTL_MS=3*24*60*60*1000;
const FUNDAMENTAL_STALE_MS=30*24*60*60*1000;
const MAX_NEW_SYMBOLS_PER_RUN=24;
const MAX_PERSISTED_SYMBOLS=6000;
const FUNDAMENTAL_CONCURRENCY=2;
const PERSISTENT_REHYDRATE_MS=30*1000;
const CACHE_KEY="__fmpFundamentalCacheV7";
const INFLIGHT_KEY="__fmpFundamentalInflightV4";
const COOLDOWN_KEY="__fmpFundamentalCooldownUntilV3";
const HYDRATE_KEY="__fmpFundamentalBlobHydrateV2";
const PERSIST_KEY="__fmpFundamentalBlobPersistV2";
const FUNDAMENTAL_STORE="fmp-fundamentals-cache-v1.json";

const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const asArray=v=>Array.isArray(v)?v:v&&typeof v==="object"?[v]:[];
const num=(v,f=null)=>{if(v===null||v===undefined||v==="")return f;const n=Number(v);return Number.isFinite(n)?n:f;};
const firstNumber=(obj,keys)=>{for(const k of keys){const n=num(obj?.[k],null);if(n!==null)return n;}return null;};
const pct100=v=>{const n=num(v,null);if(n===null)return null;return Math.abs(n)<=2?n*100:n;};
const present=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
const safeRatio=(a,b,mult=1)=>{const x=num(a,null),y=num(b,null);return x!==null&&y!==null&&y!==0?(x/y)*mult:null;};
const growthPct=(latest,prior)=>{const a=num(latest,null),b=num(prior,null);return a!==null&&b!==null&&b!==0?((a/b)-1)*100:null;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function cache(){if(!globalThis[CACHE_KEY])globalThis[CACHE_KEY]=new Map();return globalThis[CACHE_KEY];}
function inflight(){if(!globalThis[INFLIGHT_KEY])globalThis[INFLIGHT_KEY]=new Map();return globalThis[INFLIGHT_KEY];}
function cooldownUntil(){return Number(globalThis[COOLDOWN_KEY]||0);}
function setCooldown(ms){globalThis[COOLDOWN_KEY]=Math.max(cooldownUntil(),Date.now()+ms);}
function hardFeedError(status){return status===402||status===403||status===429;}
function unavailableRow(symbol,extra={}){return{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalSources:{ratiosTtm:false,incomeGrowth:false,statementFallback:false,ratioFields:0,growthFields:0},...extra};}
function deferredRow(symbol){return unavailableRow(symbol,{fundamentalDataStatus:"deferred",fundamentalDataDeferred:true,fundamentalFeedLimited:false});}
async function readPersistentCacheRows(){
  const{blobs}=await list({prefix:FUNDAMENTAL_STORE,limit:1}),blob=blobs.find(b=>b.pathname===FUNDAMENTAL_STORE)||blobs[0];if(!blob)return[];
  const result=await get(blob.url,{access:'private',useCache:false});if(!result)return[];
  const parsed=JSON.parse(await new Response(result.stream).text());return Array.isArray(parsed?.rows)?parsed.rows:[];
}
function mergePersistentRows(rows=[]){
  const store=cache(),now=Date.now();let loaded=0;
  for(const item of rows){const symbol=normalizeSymbol(item?.symbol),ts=Number(item?.ts||0),data=item?.data;if(!symbol||!data||!ts||now-ts>=FUNDAMENTAL_STALE_MS)continue;const prior=store.get(symbol);if(!prior||Number(prior.ts||0)<ts){store.set(symbol,{ts,data});loaded++;}}
  return loaded;
}
async function hydratePersistentCache(){
  const state=globalThis[HYDRATE_KEY];
  if(state?.promise)return state.promise;
  if(state?.at&&Date.now()-state.at<PERSISTENT_REHYDRATE_MS)return 0;
  const promise=(async()=>{try{return mergePersistentRows(await readPersistentCacheRows());}catch(e){console.warn('fundamental cache hydrate failed:',e?.message||e);return 0;}finally{globalThis[HYDRATE_KEY]={at:Date.now(),promise:null};}})();
  globalThis[HYDRATE_KEY]={at:state?.at||0,promise};return promise;
}
async function persistFundamentalCache(){
  if(globalThis[PERSIST_KEY])return globalThis[PERSIST_KEY];
  globalThis[PERSIST_KEY]=(async()=>{try{
    // A warm Vercel instance can otherwise overwrite fundamentals learned by another
    // instance from an older in-memory snapshot. Merge the latest durable state before
    // every write so verified rows accumulate instead of flickering back to deferred.
    mergePersistentRows(await readPersistentCacheRows());
    const now=Date.now(),rows=[...cache().entries()].filter(([,x])=>x&&now-Number(x.ts||0)<FUNDAMENTAL_STALE_MS).sort((a,b)=>Number(b[1]?.ts||0)-Number(a[1]?.ts||0)).slice(0,MAX_PERSISTED_SYMBOLS).map(([symbol,x])=>({symbol,ts:x.ts,data:x.data}));
    await put(FUNDAMENTAL_STORE,JSON.stringify({version:2,updatedAt:new Date().toISOString(),rows}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});return true;
  }catch(e){console.warn('fundamental cache persist failed:',e?.message||e);return false;}finally{globalThis[PERSIST_KEY]=null;}})();
  return globalThis[PERSIST_KEY];
}

async function fetchJson(url){
  if(Date.now()<cooldownUntil()){
    const e=new Error("FMP feed is in cooldown after a rate/subscription limit response");e.status=429;throw e;
  }
  let last=null;
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
    try{
      const r=await fetch(url,{signal:controller.signal});
      if(r.ok)return await r.json();
      const text=await r.text().catch(()=>"");
      const e=new Error(`FMP fundamentals request failed: ${r.status}${text?` - ${text.slice(0,140)}`:""}`);e.status=r.status;
      if(r.status===429){const retryAfter=Number(r.headers.get("retry-after"));setCooldown(Number.isFinite(retryAfter)&&retryAfter>0?Math.max(30000,retryAfter*1000):60000);throw e;}
      if(r.status===402||r.status===403){setCooldown(5*60*1000);throw e;}
      if(r.status<500)throw e;
      last=e;
    }catch(e){
      last=e;
      if(hardFeedError(e?.status))throw e;
      if(attempt===0)await sleep(450);
    }finally{clearTimeout(timer);}
  }
  throw last||new Error("FMP fundamentals request failed");
}

async function fetchBulkJson(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok){const text=await response.text().catch(()=>"");const error=new Error(`FMP bulk fundamentals request failed: ${response.status}${text?` - ${text.slice(0,140)}`:""}`);error.status=response.status;throw error;}
    const data=await response.json(),rows=asArray(data).filter(row=>row&&typeof row==='object'&&normalizeSymbol(row.symbol));
    if(!rows.length)throw new Error('FMP bulk fundamentals returned no symbol rows');
    return rows;
  }finally{clearTimeout(timer);}
}

async function oneRow(url,accept=()=>true){
  const rows=asArray(await fetchJson(url));
  return rows.find(x=>x&&typeof x==="object"&&accept(x))||null;
}
async function rows(url,minRows=1){
  const out=asArray(await fetchJson(url)).filter(x=>x&&typeof x==="object");
  return out.length>=minRows?out:[];
}

function ratioFields(row={}){return{
  grossMargin:pct100(firstNumber(row,["grossProfitMarginTTM","grossMarginTTM","grossProfitMargin"])),
  operatingMargin:pct100(firstNumber(row,["operatingProfitMarginTTM","operatingMarginTTM","operatingProfitMargin"])),
  debtToEquity:firstNumber(row,["debtToEquityRatioTTM","debtToEquityTTM","debtEquityRatioTTM"]),
  pe:firstNumber(row,["priceToEarningsRatioTTM","peRatioTTM","priceEarningsRatioTTM"]),
  pb:firstNumber(row,["priceToBookRatioTTM","pbRatioTTM","priceToBookTTM"]),
  currentRatio:firstNumber(row,["currentRatioTTM"]),
  quickRatio:firstNumber(row,["quickRatioTTM"]),
  freeCashFlowYield:pct100(firstNumber(row,["freeCashFlowYieldTTM"])),
};}
function growthFields(row={}){return{
  revenueGrowth:pct100(firstNumber(row,["growthRevenue","revenueGrowth","revenueGrowthTTM","growthRevenuePerShare"])),
  earningsGrowth:pct100(firstNumber(row,["growthEPSDiluted","growthEPS","epsGrowth","epsGrowthTTM","growthNetIncome","netIncomeGrowth"])),
  operatingIncomeGrowth:pct100(firstNumber(row,["growthOperatingIncome","operatingIncomeGrowth"])),
};}
function statementRatioFields(income={},balance={},cashflow={}){
  const revenue=firstNumber(income,["revenue"]),grossProfit=firstNumber(income,["grossProfit"]),operatingIncome=firstNumber(income,["operatingIncome"]),netIncome=firstNumber(income,["netIncome"]),marketCap=firstNumber(income,["marketCap"]);
  const totalDebt=firstNumber(balance,["totalDebt","shortTermDebt","longTermDebt"]),equity=firstNumber(balance,["totalStockholdersEquity","totalEquity","stockholdersEquity"]),currentAssets=firstNumber(balance,["totalCurrentAssets"]),currentLiabilities=firstNumber(balance,["totalCurrentLiabilities"]),cash=firstNumber(balance,["cashAndCashEquivalents","cashAndShortTermInvestments"]),receivables=firstNumber(balance,["netReceivables","accountsReceivables"]),fcf=firstNumber(cashflow,["freeCashFlow"]);
  return{grossMargin:safeRatio(grossProfit,revenue,100),operatingMargin:safeRatio(operatingIncome,revenue,100),debtToEquity:safeRatio(totalDebt,equity),pe:safeRatio(marketCap,netIncome),pb:null,currentRatio:safeRatio(currentAssets,currentLiabilities),quickRatio:safeRatio((cash||0)+(receivables||0),currentLiabilities),freeCashFlowYield:safeRatio(fcf,marketCap,100)};
}
function statementGrowthFields(incomeRows=[]){const latest=incomeRows[0]||{},prior=incomeRows[1]||{};return{revenueGrowth:growthPct(firstNumber(latest,["revenue"]),firstNumber(prior,["revenue"])),earningsGrowth:growthPct(firstNumber(latest,["epsDiluted","eps","netIncome"]),firstNumber(prior,["epsDiluted","eps","netIncome"])),operatingIncomeGrowth:growthPct(firstNumber(latest,["operatingIncome"]),firstNumber(prior,["operatingIncome"]))};}
function fillMissing(primary={},fallback={}){const out={...primary};for(const[k,v]of Object.entries(fallback))if(!present(out[k])&&present(v))out[k]=v;return out;}
function ratioCoverage(r={}){return[r.grossMargin,r.operatingMargin,r.debtToEquity,r.pe,r.pb,r.currentRatio,r.quickRatio,r.freeCashFlowYield].filter(present).length;}
function growthCoverage(g={}){return[g.revenueGrowth,g.earningsGrowth,g.operatingIncomeGrowth].filter(present).length;}

async function statementFallback(clean,key){
  const [incomeRows,balanceRows,cashRows]=await Promise.all([
    rows(`https://financialmodelingprep.com/stable/income-statement?symbol=${encodeURIComponent(clean)}&period=annual&limit=2&apikey=${key}`,1),
    rows(`https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${encodeURIComponent(clean)}&period=annual&limit=1&apikey=${key}`,1),
    rows(`https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${encodeURIComponent(clean)}&period=annual&limit=1&apikey=${key}`,1),
  ]);
  return{ratios:statementRatioFields(incomeRows[0]||{},balanceRows[0]||{},cashRows[0]||{}),growth:statementGrowthFields(incomeRows),asOf:incomeRows[0]?.date||incomeRows[0]?.fillingDate||balanceRows[0]?.date||null,sourceAvailable:incomeRows.length>0||balanceRows.length>0||cashRows.length>0};
}

async function fetchOne(symbol,key){
  const clean=toFmpSymbol(symbol),norm=normalizeSymbol(symbol);
  let ratioRow=null,growthRow=null,fallback=null,ratios={},growth={};
  try{ratioRow=await oneRow(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(clean)}&apikey=${key}`,x=>ratioCoverage(ratioFields(x))>=2);}catch(e){if(hardFeedError(e?.status))throw e;}
  try{growthRow=await oneRow(`https://financialmodelingprep.com/stable/income-statement-growth?symbol=${encodeURIComponent(clean)}&limit=1&apikey=${key}`,x=>growthCoverage(growthFields(x))>=1);}catch(e){if(hardFeedError(e?.status))throw e;}
  ratios=ratioFields(ratioRow||{});growth=growthFields(growthRow||{});
  if((ratioCoverage(ratios)<2||growthCoverage(growth)<1)&&Date.now()>=cooldownUntil()){
    try{fallback=await statementFallback(clean,key);ratios=fillMissing(ratios,fallback.ratios);growth=fillMissing(growth,fallback.growth);}catch(e){if(hardFeedError(e?.status))throw e;}
  }
  const ratiosCount=ratioCoverage(ratios),growthCount=growthCoverage(growth),ratiosVerified=ratiosCount>=2&&(present(ratios.grossMargin)||present(ratios.operatingMargin)||present(ratios.debtToEquity)),growthVerified=growthCount>=1&&(present(growth.revenueGrowth)||present(growth.earningsGrowth)),status=ratiosVerified&&growthVerified?"complete":ratiosVerified||growthVerified?"partial":"unavailable";
  return{symbol:norm,...ratios,...growth,fundamentalDataStatus:status,fundamentalDataVerified:status==="complete",fundamentalDataAsOf:growthRow?.date||growthRow?.fillingDate||ratioRow?.date||fallback?.asOf||null,fundamentalSources:{ratiosTtm:ratioCoverage(ratioFields(ratioRow||{}))>=2,incomeGrowth:growthCoverage(growthFields(growthRow||{}))>=1,statementFallback:Boolean(fallback?.sourceAvailable),ratioFields:ratiosCount,growthFields:growthCount}};
}

async function mapLimited(items,limit,fn){const out=new Array(items.length);let next=0;async function worker(){for(;;){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));return out;}
async function resilientOne(symbol,key,store,now){
  const pending=inflight(),stale=store.get(symbol);if(pending.has(symbol))return pending.get(symbol);
  const p=(async()=>{try{
    if(Date.now()<cooldownUntil()){if(stale&&now-stale.ts<FUNDAMENTAL_STALE_MS)return{...stale.data,fundamentalDataStaleFallback:true};return unavailableRow(symbol,{fundamentalFeedLimited:true});}
    const row=await fetchOne(symbol,key);if(row.fundamentalDataStatus!=="unavailable")store.set(row.symbol,{ts:Date.now(),data:row});else if(stale&&now-stale.ts<FUNDAMENTAL_STALE_MS)return{...stale.data,fundamentalDataStaleFallback:true};return row;
  }catch(e){if(stale&&now-stale.ts<FUNDAMENTAL_STALE_MS)return{...stale.data,fundamentalDataStaleFallback:true};return unavailableRow(symbol,{fundamentalFeedLimited:hardFeedError(e?.status)});}finally{pending.delete(symbol);}})();pending.set(symbol,p);return p;
}

export async function fetchFmpFundamentals(symbols=[]){
  const key=process.env.FMP_API_KEY,requested=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],result=new Map();if(!requested.length)return result;
  if(!key){for(const symbol of requested)result.set(symbol,unavailableRow(symbol));return result;}
  await hydratePersistentCache();
  const now=Date.now(),store=cache(),missing=[];
  for(const symbol of requested){const hit=store.get(symbol);if(hit&&now-hit.ts<FUNDAMENTAL_TTL_MS)result.set(symbol,hit.data);else missing.push(symbol);}

  // Fundamental ratios and growth do not need intraday refresh. Keep each serverless
  // invocation far below the Premium 750 calls/min ceiling; repeated user reloads can
  // no longer multiply into a 700+ call burst. Deferred rows remain eligible for the
  // market/technical screen and are re-verified on later passes rather than causing a storm.
  const toFetch=missing.slice(0,MAX_NEW_SYMBOLS_PER_RUN),deferred=missing.slice(MAX_NEW_SYMBOLS_PER_RUN);
  if(toFetch.length){const fetched=await mapLimited(toFetch,FUNDAMENTAL_CONCURRENCY,s=>resilientOne(s,key,store,now));for(const row of fetched)result.set(row.symbol,row);await persistFundamentalCache();}
  for(const symbol of deferred){
    const stale=store.get(symbol);
    if(stale&&now-Number(stale.ts||0)<FUNDAMENTAL_STALE_MS)result.set(symbol,{...stale.data,fundamentalDataStaleFallback:true,fundamentalRefreshDeferred:true});
    else result.set(symbol,deferredRow(symbol));
  }
  return result;
}
export async function refreshAllFmpFundamentalsBulk(requestedSymbols=[]){
  const key=process.env.FMP_API_KEY||process.env.FMP_KEY;
  if(!key)throw new Error('FMP_API_KEY is required for bulk fundamental refresh');
  // Six stable bulk requests replace thousands of per-symbol requests: one TTM
  // ratio snapshot plus the five most recent fiscal-quarter growth partitions.
  // A subscription or rate-limit failure stops here; it never fans out.
  const nowDate=new Date(),startQuarter=Math.floor(nowDate.getUTCMonth()/3)+1,startYear=nowDate.getUTCFullYear(),quarters=[];
  for(let offset=0;offset<5;offset++){const zeroBased=startQuarter-1-offset,year=startYear+Math.floor(zeroBased/4),quarter=((zeroBased%4)+4)%4+1;quarters.push({year,period:`Q${quarter}`});}
  const ratioRows=await fetchBulkJson(`https://financialmodelingprep.com/stable/ratios-ttm-bulk?apikey=${key}`);
  const growthPartitions=await mapLimited(quarters,2,({year,period})=>fetchBulkJson(`https://financialmodelingprep.com/stable/income-statement-growth-bulk?year=${year}&period=${period}&apikey=${key}`));
  const growthRows=growthPartitions.flat();
  await hydratePersistentCache();
  const ratiosBySymbol=new Map(ratioRows.map(row=>[normalizeSymbol(row.symbol),row]));
  const growthBySymbol=new Map();for(const row of growthRows){const symbol=normalizeSymbol(row.symbol),prior=growthBySymbol.get(symbol),rowTime=new Date(row.acceptedDate||row.fillingDate||row.date||0).getTime(),priorTime=new Date(prior?.acceptedDate||prior?.fillingDate||prior?.date||0).getTime();if(!prior||rowTime>priorTime)growthBySymbol.set(symbol,row);}
  const requested=new Set(requestedSymbols.map(normalizeSymbol).filter(Boolean)),availableSymbols=[...new Set([...ratiosBySymbol.keys(),...growthBySymbol.keys()])],symbols=new Set(requested.size?availableSymbols.filter(symbol=>requested.has(symbol)):availableSymbols);
  const store=cache(),now=Date.now();let complete=0,partial=0;
  for(const symbol of symbols){
    const ratioRow=ratiosBySymbol.get(symbol)||{},growthRow=growthBySymbol.get(symbol)||{},ratios=ratioFields(ratioRow),growth=growthFields(growthRow),ratiosCount=ratioCoverage(ratios),growthCount=growthCoverage(growth),ratiosVerified=ratiosCount>=2&&(present(ratios.grossMargin)||present(ratios.operatingMargin)||present(ratios.debtToEquity)),growthVerified=growthCount>=1&&(present(growth.revenueGrowth)||present(growth.earningsGrowth)),status=ratiosVerified&&growthVerified?'complete':ratiosVerified||growthVerified?'partial':'unavailable';
    if(status==='unavailable')continue;
    const row={symbol,...ratios,...growth,fundamentalDataStatus:status,fundamentalDataVerified:status==='complete',fundamentalDataAsOf:growthRow.date||growthRow.fillingDate||ratioRow.date||null,fundamentalBulkRefreshedAt:new Date(now).toISOString(),fundamentalSources:{ratiosTtm:ratiosVerified,incomeGrowth:growthVerified,statementFallback:false,bulk:true,ratioFields:ratiosCount,growthFields:growthCount}};
    store.set(symbol,{ts:now,data:row});if(status==='complete')complete++;else partial++;
  }
  if(!complete)throw new Error('FMP bulk fundamentals returned no fully verified rows');
  await persistFundamentalCache();
  return{symbolsObserved:availableSymbols.length,symbolsRequested:requested.size,symbolsEvaluated:symbols.size,complete,partial,persistedLimit:MAX_PERSISTED_SYMBOLS,providerCalls:1+quarters.length,growthPartitions:quarters,refreshedAt:new Date(now).toISOString()};
}
export function mergeFundamentals(stock={},fundamentalMap=new Map()){const f=fundamentalMap.get(normalizeSymbol(stock.symbol||stock.ticker));return f?{...stock,...f}:stock;}
