// Cached FMP fundamental enrichment shared by broad and single-symbol analysis.
// Fundamentals change on filings, not ticks, so keep this layer slow-moving while quotes stay live.

const FUNDAMENTAL_TTL_MS=6*60*60*1000;
const BULK_RATIO_TTL_MS=6*60*60*1000;
const CACHE_KEY="__fmpFundamentalCacheV1";
const BULK_KEY="__fmpRatiosTtmBulkCacheV1";

const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const asArray=v=>Array.isArray(v)?v:v&&typeof v==="object"?[v]:[];
const num=(v,f=null)=>{if(v===null||v===undefined||v==="")return f;const n=Number(v);return Number.isFinite(n)?n:f;};
const firstNumber=(obj,keys)=>{for(const k of keys){const n=num(obj?.[k],null);if(n!==null)return n;}return null;};
const pct100=v=>{const n=num(v,null);if(n===null)return null;return Math.abs(n)<=2?n*100:n;};

function cache(){if(!globalThis[CACHE_KEY])globalThis[CACHE_KEY]=new Map();return globalThis[CACHE_KEY];}

async function fetchJson(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{signal:controller.signal});
    if(!r.ok){const text=await r.text().catch(()=>"");throw new Error(`FMP fundamentals request failed: ${r.status}${text?` - ${text.slice(0,160)}`:""}`);}
    return await r.json();
  }finally{clearTimeout(timer);}
}

function ratioFields(row={}){
  return{
    grossMargin:pct100(firstNumber(row,["grossProfitMarginTTM","grossMarginTTM","grossProfitMargin"])),
    operatingMargin:pct100(firstNumber(row,["operatingProfitMarginTTM","operatingMarginTTM","operatingProfitMargin"])),
    debtToEquity:firstNumber(row,["debtToEquityRatioTTM","debtToEquityTTM","debtEquityRatioTTM"]),
    pe:firstNumber(row,["priceToEarningsRatioTTM","peRatioTTM","priceEarningsRatioTTM"]),
    pb:firstNumber(row,["priceToBookRatioTTM","pbRatioTTM","priceToBookTTM"]),
    currentRatio:firstNumber(row,["currentRatioTTM"]),
    quickRatio:firstNumber(row,["quickRatioTTM"]),
    freeCashFlowYield:pct100(firstNumber(row,["freeCashFlowYieldTTM"])),
  };
}

function growthFields(row={}){
  return{
    revenueGrowth:pct100(firstNumber(row,["growthRevenue","revenueGrowth","growthRevenuePerShare"])),
    earningsGrowth:pct100(firstNumber(row,["growthEPSDiluted","growthEPS","epsGrowth","growthNetIncome","netIncomeGrowth"])),
    operatingIncomeGrowth:pct100(firstNumber(row,["growthOperatingIncome","operatingIncomeGrowth"])),
  };
}

async function getBulkRatios(key){
  const current=globalThis[BULK_KEY],now=Date.now();
  if(current?.map&&now-current.ts<BULK_RATIO_TTL_MS)return current.map;
  try{
    const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/ratios-ttm-bulk?apikey=${key}`));
    const map=new Map();
    for(const row of rows){const symbol=normalizeSymbol(row?.symbol);if(symbol)map.set(symbol,row);}
    if(map.size){globalThis[BULK_KEY]={ts:now,map};return map;}
  }catch{}
  return null;
}

async function fetchOne(symbol,key,bulkRatios=null){
  const clean=toFmpSymbol(symbol);
  let ratioRow=bulkRatios?.get(normalizeSymbol(symbol))||null,ratiosOk=Boolean(ratioRow),growthRow=null,growthOk=false;
  const jobs=[];
  if(!ratioRow)jobs.push(fetchJson(`https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(clean)}&apikey=${key}`).then(x=>{ratioRow=asArray(x)[0]||{};ratiosOk=true;}).catch(()=>{}));
  jobs.push(fetchJson(`https://financialmodelingprep.com/stable/income-statement-growth?symbol=${encodeURIComponent(clean)}&limit=1&apikey=${key}`).then(x=>{growthRow=asArray(x)[0]||{};growthOk=true;}).catch(()=>{}));
  await Promise.all(jobs);
  const ratios=ratioFields(ratioRow||{}),growth=growthFields(growthRow||{}),status=ratiosOk&&growthOk?"complete":ratiosOk||growthOk?"partial":"unavailable";
  return{symbol:normalizeSymbol(symbol),...ratios,...growth,fundamentalDataStatus:status,fundamentalDataVerified:status==="complete",fundamentalDataAsOf:growthRow?.date||growthRow?.fillingDate||null,fundamentalSources:{ratiosTtm:ratiosOk,incomeGrowth:growthOk}};
}

async function mapLimited(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function worker(){for(;;){const i=next++;if(i>=items.length)return;out[i]=await fn(items[i],i);}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));
  return out;
}

export async function fetchFmpFundamentals(symbols=[]){
  const key=process.env.FMP_API_KEY,requested=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],result=new Map();
  if(!requested.length)return result;
  if(!key){for(const symbol of requested)result.set(symbol,{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalSources:{ratiosTtm:false,incomeGrowth:false}});return result;}
  const now=Date.now(),store=cache(),missing=[];
  for(const symbol of requested){const hit=store.get(symbol);if(hit&&now-hit.ts<FUNDAMENTAL_TTL_MS)result.set(symbol,hit.data);else missing.push(symbol);}
  if(missing.length){
    const bulkRatios=await getBulkRatios(key);
    const rows=await mapLimited(missing,10,s=>fetchOne(s,key,bulkRatios));
    for(const row of rows){store.set(row.symbol,{ts:Date.now(),data:row});result.set(row.symbol,row);}
  }
  return result;
}

export function mergeFundamentals(stock={},fundamentalMap=new Map()){
  const f=fundamentalMap.get(normalizeSymbol(stock.symbol||stock.ticker));
  return f?{...stock,...f}:stock;
}
