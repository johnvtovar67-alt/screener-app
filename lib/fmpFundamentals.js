// Cached FMP fundamental enrichment shared by broad and single-symbol analysis.
// Fundamentals change on filings, not ticks, so keep this layer slow-moving while quotes stay live.

const FUNDAMENTAL_TTL_MS=6*60*60*1000;
const BULK_RATIO_TTL_MS=6*60*60*1000;
const CACHE_KEY="__fmpFundamentalCacheV2";
const BULK_KEY="__fmpRatiosTtmBulkCacheV1";

const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const asArray=v=>Array.isArray(v)?v:v&&typeof v==="object"?[v]:[];
const num=(v,f=null)=>{if(v===null||v===undefined||v==="")return f;const n=Number(v);return Number.isFinite(n)?n:f;};
const firstNumber=(obj,keys)=>{for(const k of keys){const n=num(obj?.[k],null);if(n!==null)return n;}return null;};
const pct100=v=>{const n=num(v,null);if(n===null)return null;return Math.abs(n)<=2?n*100:n;};
const present=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));

function cache(){if(!globalThis[CACHE_KEY])globalThis[CACHE_KEY]=new Map();return globalThis[CACHE_KEY];}

async function fetchJson(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{
    const r=await fetch(url,{signal:controller.signal});
    if(!r.ok){const text=await r.text().catch(()=>"");throw new Error(`FMP fundamentals request failed: ${r.status}${text?` - ${text.slice(0,160)}`:""}`);}
    return await r.json();
  }finally{clearTimeout(timer);}
}

async function firstUsable(urls=[],accept=()=>true){
  for(const url of urls){
    try{
      const rows=asArray(await fetchJson(url));
      const row=rows.find(x=>x&&typeof x==="object"&&accept(x));
      if(row)return row;
    }catch{}
  }
  return null;
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
    revenueGrowth:pct100(firstNumber(row,["growthRevenue","revenueGrowth","revenueGrowthTTM","growthRevenuePerShare"])),
    earningsGrowth:pct100(firstNumber(row,["growthEPSDiluted","growthEPS","epsGrowth","epsGrowthTTM","growthNetIncome","netIncomeGrowth"])),
    operatingIncomeGrowth:pct100(firstNumber(row,["growthOperatingIncome","operatingIncomeGrowth"])),
  };
}

function ratioCoverage(r={}){
  return [r.grossMargin,r.operatingMargin,r.debtToEquity,r.pe,r.pb,r.currentRatio,r.quickRatio,r.freeCashFlowYield].filter(present).length;
}
function growthCoverage(g={}){
  return [g.revenueGrowth,g.earningsGrowth,g.operatingIncomeGrowth].filter(present).length;
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
  const clean=toFmpSymbol(symbol),norm=normalizeSymbol(symbol);
  let ratioRow=bulkRatios?.get(norm)||null;
  if(!ratioRow||ratioCoverage(ratioFields(ratioRow))<2){
    ratioRow=await firstUsable([
      `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(clean)}&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(clean)}?apikey=${key}`
    ],x=>ratioCoverage(ratioFields(x))>=2);
  }

  const growthRow=await firstUsable([
    `https://financialmodelingprep.com/stable/income-statement-growth?symbol=${encodeURIComponent(clean)}&limit=1&apikey=${key}`,
    `https://financialmodelingprep.com/stable/financial-growth?symbol=${encodeURIComponent(clean)}&limit=1&apikey=${key}`,
    `https://financialmodelingprep.com/api/v3/financial-growth/${encodeURIComponent(clean)}?limit=1&apikey=${key}`
  ],x=>growthCoverage(growthFields(x))>=1);

  const ratios=ratioFields(ratioRow||{}),growth=growthFields(growthRow||{});
  const ratiosCount=ratioCoverage(ratios),growthCount=growthCoverage(growth);
  // Scoring actually consumes margins, leverage/valuation and revenue/EPS growth. Verify
  // the fields themselves rather than treating a successful HTTP response as completeness.
  const ratiosVerified=ratiosCount>=2&&(present(ratios.grossMargin)||present(ratios.operatingMargin)||present(ratios.debtToEquity));
  const growthVerified=growthCount>=1&&(present(growth.revenueGrowth)||present(growth.earningsGrowth));
  const status=ratiosVerified&&growthVerified?"complete":ratiosVerified||growthVerified?"partial":"unavailable";
  return{
    symbol:norm,...ratios,...growth,
    fundamentalDataStatus:status,
    fundamentalDataVerified:status==="complete",
    fundamentalDataAsOf:growthRow?.date||growthRow?.fillingDate||ratioRow?.date||null,
    fundamentalSources:{ratiosTtm:ratiosVerified,incomeGrowth:growthVerified,ratioFields:ratiosCount,growthFields:growthCount}
  };
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
  if(!key){for(const symbol of requested)result.set(symbol,{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalSources:{ratiosTtm:false,incomeGrowth:false,ratioFields:0,growthFields:0}});return result;}
  const now=Date.now(),store=cache(),missing=[];
  for(const symbol of requested){const hit=store.get(symbol);if(hit&&now-hit.ts<FUNDAMENTAL_TTL_MS)result.set(symbol,hit.data);else missing.push(symbol);}
  if(missing.length){
    const bulkRatios=await getBulkRatios(key);
    const rows=await mapLimited(missing,8,s=>fetchOne(s,key,bulkRatios));
    for(const row of rows){store.set(row.symbol,{ts:Date.now(),data:row});result.set(row.symbol,row);}
  }
  return result;
}

export function mergeFundamentals(stock={},fundamentalMap=new Map()){
  const f=fundamentalMap.get(normalizeSymbol(stock.symbol||stock.ticker));
  return f?{...stock,...f}:stock;
}
