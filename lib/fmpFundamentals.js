// Resilient FMP fundamental enrichment shared by broad and single-symbol analysis.
// Design goals: never fan out into legacy/restricted endpoints, never retry a hard
// subscription/rate-limit response, and prefer cached verified data over request storms.

const FUNDAMENTAL_TTL_MS=24*60*60*1000;
const FUNDAMENTAL_STALE_MS=7*24*60*60*1000;
const CACHE_KEY="__fmpFundamentalCacheV5";
const INFLIGHT_KEY="__fmpFundamentalInflightV2";
const COOLDOWN_KEY="__fmpFundamentalCooldownUntilV1";

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
  // Stable endpoints only. Never fall through to retired v3 endpoints.
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
    if(Date.now()<cooldownUntil()){if(stale&&now-stale.ts<FUNDAMENTAL_STALE_MS)return{...stale.data,fundamentalDataStaleFallback:true};return{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalFeedLimited:true,fundamentalSources:{ratiosTtm:false,incomeGrowth:false,statementFallback:false,ratioFields:0,growthFields:0}};}
    const row=await fetchOne(symbol,key);if(row.fundamentalDataStatus!=="unavailable")store.set(row.symbol,{ts:Date.now(),data:row});else if(stale&&now-stale.ts<FUNDAMENTAL_STALE_MS)return{...stale.data,fundamentalDataStaleFallback:true};return row;
  }catch(e){if(stale&&now-stale.ts<FUNDAMENTAL_STALE_MS)return{...stale.data,fundamentalDataStaleFallback:true};return{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalFeedLimited:hardFeedError(e?.status),fundamentalSources:{ratiosTtm:false,incomeGrowth:false,statementFallback:false,ratioFields:0,growthFields:0}};}finally{pending.delete(symbol);}})();pending.set(symbol,p);return p;
}

export async function fetchFmpFundamentals(symbols=[]){
  const key=process.env.FMP_API_KEY,requested=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],result=new Map();if(!requested.length)return result;
  if(!key){for(const symbol of requested)result.set(symbol,{symbol,fundamentalDataStatus:"unavailable",fundamentalDataVerified:false,fundamentalSources:{ratiosTtm:false,incomeGrowth:false,statementFallback:false,ratioFields:0,growthFields:0}});return result;}
  const now=Date.now(),store=cache(),missing=[];for(const symbol of requested){const hit=store.get(symbol);if(hit&&now-hit.ts<FUNDAMENTAL_TTL_MS)result.set(symbol,hit.data);else missing.push(symbol);}
  if(missing.length){const fetched=await mapLimited(missing,1,s=>resilientOne(s,key,store,now));for(const row of fetched)result.set(row.symbol,row);}
  return result;
}
export function mergeFundamentals(stock={},fundamentalMap=new Map()){const f=fundamentalMap.get(normalizeSymbol(stock.symbol||stock.ticker));return f?{...stock,...f}:stock;}
