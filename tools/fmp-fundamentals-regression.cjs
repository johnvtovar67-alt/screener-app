const fs=require('fs');
const vm=require('vm');
const assert=(c,m)=>{if(!c)throw new Error(m)};
let src=fs.readFileSync('lib/fmpFundamentals.js','utf8')
  .replace(/export async function /g,'async function ')
  .replace(/export function /g,'function ');
src+='\nmodule.exports={statementRatioFields,statementGrowthFields,fillMissing};';
const sandbox={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Map,Set,Date,setTimeout,clearTimeout,AbortController,fetch:async()=>({ok:true,json:async()=>[]})};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {statementRatioFields,statementGrowthFields,fillMissing}=sandbox.module.exports;
const ratios=statementRatioFields(
  {revenue:1000,grossProfit:400,operatingIncome:150,netIncome:100,marketCap:2000},
  {totalDebt:300,totalStockholdersEquity:600,totalCurrentAssets:500,totalCurrentLiabilities:250,cashAndCashEquivalents:100,netReceivables:150},
  {freeCashFlow:120}
);
assert(Math.abs(ratios.grossMargin-40)<.001,'Statement fallback must derive gross margin');
assert(Math.abs(ratios.operatingMargin-15)<.001,'Statement fallback must derive operating margin');
assert(Math.abs(ratios.debtToEquity-.5)<.001,'Statement fallback must derive debt/equity');
assert(Math.abs(ratios.currentRatio-2)<.001,'Statement fallback must derive current ratio');
assert(Math.abs(ratios.freeCashFlowYield-6)<.001,'Statement fallback must derive FCF yield');
const growth=statementGrowthFields([{revenue:120,epsDiluted:2.4,operatingIncome:30},{revenue:100,epsDiluted:2,operatingIncome:25}]);
assert(Math.abs(growth.revenueGrowth-20)<.001,'Statement fallback must derive revenue growth');
assert(Math.abs(growth.earningsGrowth-20)<.001,'Statement fallback must derive earnings growth');
const merged=fillMissing({grossMargin:null,pe:18},{grossMargin:42,pe:21,debtToEquity:.4});
assert(merged.grossMargin===42&&merged.pe===18&&merged.debtToEquity===.4,'Fallback must fill only missing fields');
assert(src.includes('/stable/ratios-ttm?symbol='),'Stable ratios endpoint must remain available');
assert(src.includes('/stable/income-statement-growth?symbol='),'Stable growth endpoint must remain available');
assert(src.includes('/stable/income-statement?symbol='),'Stable statement fallback must remain available');
assert(!src.includes('/api/v3/'),'Retired v3 endpoints must not return');
assert(!src.includes('ratios-ttm-bulk'),'Restricted bulk-ratios endpoint must not return');
assert(src.includes('setCooldown'),'Rate/subscription failures must activate cooldown rather than request storms');
assert(src.includes('MAX_NEW_SYMBOLS_PER_RUN=12'),'A cold broad refresh must keep fundamental fanout well below the Premium rate ceiling');
assert(src.includes('missing.slice(0,MAX_NEW_SYMBOLS_PER_RUN)'),'Only the bounded missing-symbol slice may reach FMP');
assert(src.includes('mapLimited(toFetch,1'),'Fundamental enrichment concurrency must remain capped at one request lane');
assert(src.includes('fundamentalDataStatus:"deferred"'),'Unfetched breadth names must be marked deferred rather than misreported as provider failures');
const top5=fs.readFileSync('pages/api/top5.js','utf8');
assert(/fundamentalsComplete\s*===\s*0\s*&&\s*fundamentalsUnavailable\s*>\s*0\s*\?\s*"unavailable"/.test(top5),'Deferred breadth must not be misreported as a provider-wide fundamental outage');
assert(top5.includes('rotatedFundamentalPriority')&&top5.includes('verificationPass'),'Automatic verification passes must rotate through the bounded priority queue');
const page=fs.readFileSync('pages/index.js','utf8');
assert(page.includes('automaticVerificationPass')&&page.includes('75000'),'Degraded fundamental coverage must trigger bounded, spaced automatic rechecks');
assert(src.includes('statementFallback:Boolean(fallback?.sourceAvailable)'),'Fundamental source diagnostics must expose statement fallback use');
console.log('FMP FUNDAMENTALS REGRESSION PASS: stable-only, cooldown, low fanout, and fallback checks passed');
