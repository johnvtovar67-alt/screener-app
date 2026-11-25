// Inspect the actual browser import graph. No account, provider or live request.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{builtinModules}=require('node:module'),{createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const root=process.cwd(),builtins=new Set(builtinModules.map(name=>name.replace(/^node:/,''))),visited=new Set(),queue=[['pages/index.js']];
while(queue.length){
 const chain=queue.shift(),file=chain.at(-1);if(visited.has(file))continue;visited.add(file);
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of source.matchAll(/(?:\bimport\s+(?:[^'";]+?\s+from\s+)?|\bexport\s+[^'";]+?\s+from\s+)['"]([^'"]+)['"]/g)){
  const request=match[1];assert(!request.startsWith('node:')&&!builtins.has(request),'Server builtin reached from browser: '+[...chain,request].join(' -> '));
  if(!request.startsWith('.'))continue;
  const stem=path.resolve(root,path.dirname(file),request),resolved=[stem,stem+'.js',stem+'.jsx',path.join(stem,'index.js')].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
  assert(resolved,'Local browser dependency resolves: '+request);if(!/\.jsx?$/.test(resolved))continue;
  queue.push([...chain,path.relative(root,resolved)]);
 }
}
assert(visited.has('lib/c1OpeningPriceBasis.js'),'Actual client uses the pure receipt validator');
for(const file of ['lib/c1BrokerCashJournal.js','lib/c1CashAccounting.js','lib/c1AccountLedger.js'])assert(!visited.has(file),'Server financial replay stays outside browser: '+file);
const loader=createResearchModuleLoader(root),pure=loader.load('lib/c1OpeningPriceBasis.js'),server=loader.load('lib/c1OpeningPriceReview.js');
assert.equal(server.verifiedC1OpeningPriceBasis,pure.verifiedC1OpeningPriceBasis,'Server compatibility export shares one validator implementation');
assert.equal(pure.verifiedC1OpeningPriceBasis({previousAdjustedClosesUnchanged:true}),true);
for(const receipt of [null,{}, {previousAdjustedClosesUnchanged:false}, {previousAdjustedClosesUnchanged:false,priceBasisReview:{contract:'c1-verified-opening-price-review-v4',identicalOpeningTradingAuthority:true}}])assert.equal(Boolean(pure.verifiedC1OpeningPriceBasis(receipt)),false,'Missing or forged receipt proof stays rejected');
const source=fs.readFileSync(path.join(root,'lib/c1OpeningPriceBasis.js'),'utf8'),body=source.slice(source.indexOf('export function verifiedC1OpeningPriceBasis'));
assert.equal(createHash('sha256').update(body).digest('hex'),'e073627804c98de10b4abcb88f22e242e6ad1b806d8b2b4e467f2050fa1d0345','Published validator body remains byte-identical');
console.log('PASS: actual Home browser dependency graph excludes server financial replay and Node builtins; one unchanged receipt validator preserves server compatibility and fail-closed proof checks.');
