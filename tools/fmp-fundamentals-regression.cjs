const fs=require('fs');
const vm=require('vm');
const assert=(c,m)=>{if(!c)throw new Error(m)};
let src=fs.readFileSync('lib/fmpFundamentals.js','utf8')
  .replace(/export async function /g,'async function ')
  .replace(/export function /g,'function ');
src+='\nmodule.exports={statementRatioFields,statementGrowthFields,fillMissing};';
const sandbox={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Map,Set,Date};
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
assert(src.includes('/stable/key-metrics-ttm?symbol='),'Key-metrics fallback endpoint must remain available');
assert(src.includes('/stable/income-statement?symbol='),'Income-statement fallback endpoint must remain available');
assert(src.includes('statementFallback:Boolean(fallback?.sourceAvailable)'),'Fundamental source diagnostics must expose statement fallback use');
console.log('FMP FUNDAMENTALS REGRESSION PASS: 9 checks passed');
