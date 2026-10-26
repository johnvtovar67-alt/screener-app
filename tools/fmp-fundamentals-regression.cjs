const fs=require('fs');
const vm=require('vm');
const {restoreProviderTransport,installProviderTransport}=require('./c1-provider-transport-seams.cjs');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {toFmpSymbol,fromFmpSymbol}=createResearchModuleLoader(process.cwd()).load('lib/fmpSymbols.js');
// Frozen expressions from production cddfe3e. This is a mechanical extraction,
// not permission to improve/validate the legacy spelling contract.
const priorFundamental=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const priorQuote=value=>String(value||'').replace('.', '-').toUpperCase().trim();
const inputs=[undefined,null,false,true,0,-0,NaN,Infinity,-1,1n,Symbol('bf.b'),'',
 ' brk.b ','BF.B','brk-b','a.b.c','a-b-c',' .a.b ',' é.i ',[],['bf.b'],{},
 {toString:()=> ' brk.b '}];
for(const left of ['a','B','.','-',' ','0','ß'])for(const right of ['b','C','.','-',' ','1','ı'])inputs.push(left+'.'+right+'.z');
for(const input of inputs){
 assert(toFmpSymbol(input)===priorFundamental(input),'Shared spelling preserves fundamental normalization');
 assert(toFmpSymbol(input)===priorQuote(input),'Shared spelling preserves quote normalization');
}
assert(toFmpSymbol('a.b.c')==='A-B.C','Only the first dot is replaced; do not broaden aliases');
assert(toFmpSymbol('toString')==='TOSTRING','No prototype/dictionary alias lookup is introduced');
let conversions=0;assert(toFmpSymbol({toString(){conversions++;return 'bf.b';}})==='BF-B'&&conversions===1,'Coercion occurs exactly once');
const coercionFailure=new Error('synthetic coercion');
try{toFmpSymbol({toString(){throw coercionFailure;}});throw new Error('Expected coercion failure');}catch(error){assert(error===coercionFailure,'Existing coercion failure identity is preserved');}
const {createHash}=require('node:crypto');
const blobHash=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
const quoteSource=restoreProviderTransport('lib/fmpQuotes.js',fs.readFileSync('lib/fmpQuotes.js','utf8'));
assert(blobHash(quoteSource.replace("import {toFmpSymbol as norm} from './fmpSymbols';\n",'').replace('const stores=',"const norm=value=>String(value||'').replace('.', '-').toUpperCase().trim();\nconst stores="))==='00e6b3170856577085573b203adfd07e61827fd3','Quote extraction reversal exactly recovers reviewed production source');
const fundamentalSource=restoreProviderTransport('lib/fmpFundamentals.js',fs.readFileSync('lib/fmpFundamentals.js','utf8'));
const priorDeclaration='const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();\n';
assert(blobHash(fundamentalSource.replace('    let nonRetryableResponse=false;\n','').replace('if(r.status<500){nonRetryableResponse=[400,401,404,405,410,422].includes(r.status);throw e;}','if(r.status<500)throw e;').replace('if(nonRetryableResponse||hardFeedError(e?.status))throw e;','if(hardFeedError(e?.status))throw e;').replace("import {toFmpSymbol} from './fmpSymbols';\n",'').replace('const asArray=',priorDeclaration+'const asArray='))==='5dacd7e90008fdcb48b32f1bb57814476f750851','Fundamental retry repair and symbol extraction reversal exactly recover reviewed production source');
let src=fs.readFileSync('lib/fmpFundamentals.js','utf8')
  .replace(/import\s+\{put,list,get\}\s+from\s+'@vercel\/blob';/,'')
  .replace(/^import .*top5Diagnostics.*$/gm,'')
  .replace(/^import .*fmpSymbols.*$/gm,'')
  .replace(/^import .*fmpTransport.*$/gm,'')
  .replace(/export async function /g,'async function ')
  .replace(/export function /g,'function ');
src+='\nmodule.exports={statementRatioFields,statementGrowthFields,fillMissing};';
const sandbox={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Map,Set,Date,setTimeout,clearTimeout,AbortController,toFmpSymbol,fetch:async()=>({ok:true,json:async()=>[]}),top5Phase:(_name,task)=>task(),top5Network:(_url,task)=>task(),top5Fetch:(url,options)=>sandbox.fetch(url,options),assertTop5Active(){},isTop5Deadline:()=>false,top5Count(){}};
installProviderTransport(sandbox);vm.createContext(sandbox);vm.runInContext(src,sandbox);
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
assert(src.includes('refreshAllFmpFundamentalsBulk')&&src.indexOf('ratios-ttm-bulk')>src.indexOf('refreshAllFmpFundamentalsBulk'),'Bulk ratios may exist only in the isolated scheduled cache warmer, never the interactive per-symbol recovery path');
assert(src.includes('providerCalls:1+quarters.length')&&src.includes('mapLimited(quarters,2'),'Bulk cache warming must have an explicit request count and bounded partition concurrency');
assert(src.includes('setCooldown'),'Rate/subscription failures must activate cooldown rather than request storms');
assert(src.includes('MAX_NEW_SYMBOLS_PER_RUN=24'),'A cold broad refresh must keep fundamental fanout well below the Premium rate ceiling');
assert(src.includes('missing.slice(0,MAX_NEW_SYMBOLS_PER_RUN)'),'Only the bounded missing-symbol slice may reach FMP');
assert(src.includes('FUNDAMENTAL_CONCURRENCY=2')&&src.includes('mapLimited(toFetch,FUNDAMENTAL_CONCURRENCY'),'Fundamental enrichment concurrency must remain explicitly bounded');
assert(src.includes('hydratePersistentCache')&&src.includes('persistFundamentalCache'),'Verified fundamentals must survive Vercel cold starts');
assert(src.includes('mergePersistentRows(await readPersistentCacheRows())'),'A warm instance must merge durable rows before writing so it cannot erase another instance’s verified fundamentals');
assert(src.includes('PERSISTENT_REHYDRATE_MS'),'Warm instances must periodically learn fundamentals verified by other instances');
assert(src.includes('fmp-fundamentals-cache-v1.json')&&!src.includes('if(!hasBlobToken())'),'Durable fundamental cache must support Vercel OIDC instead of requiring only a legacy Blob token');
assert(src.includes('fundamentalDataStatus:"deferred"'),'Unfetched breadth names must be marked deferred rather than misreported as provider failures');
assert(src.includes('fundamentalRefreshDeferred:true'),'Previously verified fundamentals inside the stale-safety window must remain usable while bounded refresh is deferred');
const top5=require('./c1-screen-production-extraction.cjs').readLegacyTop5Source();
assert(/fundamentalsComplete\s*===\s*0\s*&&\s*fundamentalsUnavailable\s*>\s*0\s*\?\s*"unavailable"/.test(top5),'Deferred breadth must not be misreported as a provider-wide fundamental outage');
assert(top5.includes('rotatedFundamentalPriority')&&top5.includes('verificationPass'),'Automatic verification passes must rotate through the bounded priority queue');
assert(top5.includes('MAX_AUTOMATIC_VERIFICATION_PASS = 20')&&top5.includes('Math.min(\n        MAX_AUTOMATIC_VERIFICATION_PASS'),'The API must not silently clamp the expanded-universe verification loop below the UI recovery budget');
const page=fs.readFileSync('pages/index.js','utf8');
assert(!page.includes('automaticVerificationPass')&&!page.includes('75000'),'The client must not run timed background screen refreshes');
assert(page.includes('manualVerificationPass.current=Math.min(20,manualVerificationPass.current+1)'),'Manual Reload must advance the bounded verification queue without a background timer');
assert(src.includes('statementFallback:Boolean(fallback?.sourceAvailable)'),'Fundamental source diagnostics must expose statement fallback use');
console.log('FMP FUNDAMENTALS REGRESSION PASS: stable-only, cooldown, low fanout, and fallback checks passed');
