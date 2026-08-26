// Cached FMP fundamental enrichment shared by broad and single-symbol analysis.
// Fundamentals change on filings, not ticks, so keep this layer slow-moving while quotes stay live.

const FUNDAMENTAL_TTL_MS=6*60*60*1000;
const BULK_RATIO_TTL_MS=6*60*60*1000;
const CACHE_KEY="__fmpFundamentalCacheV3";
const BULK_KEY="__fmpRatiosTtmBulkCacheV1";

const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const asArray=v=>Array.isArray(v)?v:v&&typeof v==="object"?[v]:[];
const num=(v,f=null)=>{if(v===null||v===undefined||v==="")return f;const n=Number(v);return Number.isFinite(n)?n:f;};
const firstNumber=(obj,keys)=>{for(const k of keys){const n=num(obj?.[k],null);if(n!==null)return n;}return null;};
const pct100=v=>{const n=num(v,null);if(n===null)return null;return Math.abs(n)<=2?n*100:n;};
const present=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
const safeRatio=(a,b,mult=1)=>{const x=num(a,null),y=num(b,null);return x!==null&&y!==null&&y!==0?(x/y)*mult:null;};
const growthPct=(latest,prior)=>{const a=num(latest,null),b=num(prior,null);return a!==null&&b!==null&&b!==0?((a/b)-1)*100:null;};

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
  let lastError=null;
  for(const url of urls){
    try{
      const rows=asArray(await fetchJson(url));
      const row=rows.find(x=>x&&typeof x==="object"&&accept(x));
      if(row)return row;
    }catch(e){lastError=e;}
  }
  if(lastError)console.warn("FMP fundamentals endpoint fallback exhausted:",lastError.message);
  return null;
}

async function firstRows(urls=[],minRows=1){
  let lastError=null;
  for(const url of urls){
    try{
      const rows=asArray(await fetchJson(url)).filter(x=>x&&typeof x==="object");
      if(rows.length>=minRows)return rows;
    }catch(e){lastError=e;}
  }
  if(lastError)console.warn("FMP statement fallback exhausted:",lastError.message);
  return [];
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

function statementRatioFields(income={},balance={},cashflow={}){
  const revenue=firstNumber(income,["revenue"]),grossProfit=firstNumber(income,["grossProfit"]),operatingIncome=firstNumber(income,["operatingIncome"]),netIncome=firstNumber(income,["netIncome"]),marketCap=firstNumber(income,["marketCap"]);
  const totalDebt=firstNumber(balance,["totalDebt","shortTermDebt","longTermDebt"]),equity=firstNumber(balance,["totalStockholdersEquity","totalEquity","stockholdersEquity"]),currentAssets=firstNumber(balance,["totalCurrentAssets"]),currentLiabilities=firstNumber(balance,["totalCurrentLiabilities"]),cash=firstNumber(balance,["cashAndCashEquivalents","cashAndShortTermInvestments"]),receivables=firstNumber(balance,["netReceivables","accountsReceivables"]),fcf=firstNumber(cashflow,["freeCashFlow"]);
  return{
    grossMargin:safeRatio(grossProfit,revenue,100),
    operatingMargin:safeRatio(operatingIncome,revenue,100),
    debtToEquity:safeRatio(totalDebt,equity,1),
    pe:safeRatio(marketCap,netIncome,1),
    pb:null,
    currentRatio:safeRatio(currentAssets,currentLiabilities,1),
    quickRatio:safeRatio((cash||0)+(receivables||0),currentLiabilities,1),
    freeCashFlowYield:safeRatio(fcf,marketCap,100),
  };
}

function statementGrowthFields(rows=[]){
  const latest=rows[0]||{},prior=rows[1]||{};
  return{
    revenueGrowth:growthPct(firstNumber(latest,["revenue"]),firstNumber(prior,["revenue"])),
    earningsGrowth:growthPct(firstNumber(latest,["epsDiluted","eps","netIncome"]),firstNumber(prior,["epsDiluted","eps","netIncome"])),
    operatingIncomeGrowth:growthPct(firstNumber(latest,["operatingIncome"]),firstNumber(prior,["operatingIncome"])),
  };
}

function fillMissing(primary={},fallback={}){const out={...primary};for(const[k,v]of Object.entries(fallback)){if(!present(out[k])&&present(v))out[k]=v;}return out;}
function ratioCoverage(r={}){return [r.grossMargin,r.operatingMargin,r.debtToEquity,r.pe,r.pb,r.currentRatio,r.quickRatio,r.freeCashFlowYield].filter(present).length;}
function growthCoverage(g={}){return [g.revenueGrowth,g.earningsGrowth,g.operatingIncomeGrowth].filter(present).length;}

async function getBulkRatios(key){
  const current=globalThis[BULK_KEY],now=Date.now();
  if(current?.map&&now-current.ts<BULK_RATIO_TTL_MS)return current.map;
  try{
    const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/ratios-ttm-bulk?apikey=${key}`));
    const map=new Map();
    for(const row of rows){const symbol=normalizeSymbol(row?.symbol);if(symbol)map.set(symbol,row);}
    if(map.size){globalThis[BULK_KEY]={ts:now,map};return map;}
  }catch(e){console.warn("FMP bulk ratios unavailable:",e.message)}
  return null;
}

async function fetchStatementFallback(clean,key){
  const [incomeRows,balanceRows,cashRows]=await Promise.all([
    firstRows([
      `https://financialmodelingprep.com/stable/income-statement?symbol=${encodeURIComponent(clean)}&period=annual&limit=2&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/income-statement/${encodeURIComponent(clean)}?period=annual&limit=2&apikey=${key}`
    ],1),
    firstRows([
      `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${encodeURIComponent(clean)}&period=annual&limit=1&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${encodeURIComponent(clean)}?period=annual&limit=1&apikey=${key}`
    ],1),
    firstRows([
      `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${encodeURIComponent(clean)}&period=annual&limit=1&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/cash-flow-statement/${encodeURIComponent(clean)}?period=annual&limit=1&apikey=${key}`
    ],1)
  ]);
  return{
    ratios:statementRatioFields(incomeRows[0]||{},balanceRows[0]||{},cashRows[0]||{}),
    growth:statementGrowthFields(incomeRows),
    asOf:incomeRows[0]?.date||incomeRows[0]?.fillingDate||balanceRows[0]?.date||null,
    sourceAvailable:incomeRows.length>0||balanceRows.length>0||cashRows.length>0,
  };
}

async function fetchOne(symbol,key,bulkRatios=null){
  const clean=toFmpSymbol(symbol),norm=normalizeSymbol(symbol);
  let ratioRow=bulkRatios?.get(norm)||null;
  if(!ratioRow||ratioCoverage(ratioFields(ratioRow))<2){
    ratioRow=await firstUsable([
      `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${encodeURIComponent(clean)}&apikey=${key}`,
      `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${encodeURIComponent(clean)}&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/ratios-ttm/${encodeURIComponent(clean)}?apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodeURIComponent(clean)}?apikey=${key}`
    ],x=>ratioCoverage(ratioFields(x))>=2);
  }

  const growthRow=await firstUsable([
    `https://financialmodelingprep.com/stable/income-statement-growth?symbol=${encodeURIComponent(clean)}&limit=1&apikey=${key}`,
    `https://financialmodelingprep.com/stable/financial-growth?symbol=${encodeURIComponent(clean)}&limit=1&apikey=${key}`,
    `https://financialmodelingprep.com/api/v3/financial-growth/${encodeURIComponent(clean)}?limit=1&apikey=${key}`
  ],x=>growthCoverage(growthFields(x))>=1);

  let ratios=ratioFields(ratioRow||{}),growth=growthFields(growthRow||{}),fallback=null;
  if(ratioCoverage(ratios)<2||growthCoverage(growth)<1){
    fallback=await fetchStatementFallback(clean,key);
    ratios=fillMissing(ratios,fallback.ratios);
    growth=fillMissing(growth,fallback.growth);
  }

  const ratiosCount=ratioCoverage(ratios),growthCount=growthCoverage(growth);
  // Verify the fields scoring actually consumes, but tolerate endpoint-specific gaps when
  // standard financial statements provide enough independent data to reconstruct them.
  const ratiosVerified=ratiosCount>=2&&(present(ratios.grossMargin)||present(ratios.operatingMargin)||present(ratios.debtToEquity));
  const growthVerified=growthCount>=1&&(present(growth.revenueGrowth)||present(growth.earningsGrowth));
  const status=ratiosVerified&&growthVerified?"complete":ratiosVerified||growthVerified?"partial":"unavailable";
  return{
    symbol:norm,...ratios,...growth,
    fundamentalDataStatus:status,
    fundamentalDataVerified:status==="complete",
    fundamentalDataAsOf:growthRow?.date||growthRow?.fillingDate||ratioRow?.date||fallback?.asOf||null,
    fundamentalSources:{ratiosTtm:ratioCoverage(ratioFields(ratioRow||{}))>=2,incomeGrowth:growthCoverage(growthFields(growthRow||{}))>=1,statementFallback:Boolean(fallback?.sourceAvailable),ratioFields:ratiosCount,growthFields:growthCount}
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
  if(!key){for(const symbol of requested)result.set(symbol,{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalSources:{ratiosTtm:false,incomeGrowth:false,statementFallback:false,ratioFields:0,growthFields:0}});return result;}
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
