// Diagnostic-only characterization through real C1 opening planning/review.
// No acceptance changes, account writes, provider traffic or trading claims.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=value=>JSON.parse(JSON.stringify(value)),logs=[];
const loader=createResearchModuleLoader(process.cwd()),file=path.resolve('lib/c1OpeningPriceReview.js'),source=fs.readFileSync(file,'utf8');
function load(text){
 const deps={};text=text.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=loader.load(request,file);for(const name of names.split(',').map(name=>name.trim()))deps[name]=values[name];return '';
 }).replace(/export function /g,'function ');
 const box={...deps,Date,console:{warn:(...args)=>logs.push(args),info:(...args)=>logs.push(args)}};vm.createContext(box);
 vm.runInContext(text+';globalThis.exports={reviewC1OpeningPriceRevisions,c1OpeningRevisionFailure,c1OpeningRevisionSources,verifiedC1OpeningPriceBasis};',box);return box.exports;
}
const current=load(source),previous=load(require('./c1-opening-diagnostic-seams.cjs').restore('lib/c1OpeningPriceReview.js',source));
const base={orders:[],blockedOrders:[],entryReviews:[],openingBooks:{base:{cash:123456789,positions:{}}},projectedBooks:{base:{cash:123456789,positions:{}}},
 riskBySleeve:{base:{paused:false,historicalHighWater:123456789}},accountPolicy:{identity:'PRIVATE_ID_SENTINEL',purchaseBlocks:{}},
 accountExposure:{holdings:[],candidates:{},maxPositionPct:1/3},entryRecheck:{blocks:[]},actionVersion:'PRIVATE_VERSION_SENTINEL'};
function explain(left,right,options){const before=JSON.stringify([left,right]);const text=current.c1OpeningRevisionFailure('opening',left,right,options);
 assert(text.length+32<=200,'Authenticated rejection remains bounded');assert.equal(JSON.stringify([left,right]),before);return {text,event:JSON.parse(logs.at(-1)[1])};}
const background=clone(base);background.accountPolicy.purchaseBlocks.X20='not-in-entry-queue';
const positive=explain(base,background);
assert.match(positive.text,/accountPolicy purchaseBlocks/);assert.equal(positive.event.backgroundPurchaseBlocksOnly,true);assert.equal(positive.event.backgroundPurchaseBlockDifferenceCount,1);
assert.equal(positive.event.serializationOrderOnly,false);
for(const edit of [
 value=>value.orders.push({symbol:'X20',side:'buy',shares:1}),
 value=>value.blockedOrders.push({symbol:'X20',side:'buy',shares:1}),
 value=>value.openingBooks.base.positions.X20={shares:1},
 value=>value.projectedBooks.base.positions.X20={shares:1},
 value=>value.additionalSwingCapacity={symbols:['X20']},
 ]){const a=clone(base),b=clone(background);edit(a);edit(b);assert.equal(explain(a,b).event.backgroundPurchaseBlocksOnly,false,'Protected current authority cannot be labeled background-only');}
assert.equal(explain(base,background,{protectedSymbols:['X20']}).event.backgroundPurchaseBlocksOnly,false,'Prior recorded intraday order symbols are protected too');
assert.equal(explain(base,background,{protectedSymbols:[' x20 ']}).event.backgroundPurchaseBlocksOnly,false,'Protected symbols normalize conservatively to the canonical account symbol');
const unknown=clone(background);unknown.accountPolicy.purchaseBlocks.X20='unknown-future-rule';assert.equal(explain(base,unknown).event.backgroundPurchaseBlocksOnly,false);
const extra=clone(background);extra.accountPolicy.futureLimit=1;assert.equal(explain(base,extra).event.backgroundPurchaseBlocksOnly,false,'Every other policy field remains part of the exact diagnostic proof');
for(const [category,field,edit] of [
 ['accountPolicy','purchaseEligibilityComplete',value=>value.accountPolicy.purchaseEligibilityComplete=false],
 ['accountExposure','maxPositionPct',value=>value.accountExposure.maxPositionPct=.2],
 ['entryRecheck','blocks',value=>value.entryRecheck.blocks.push({symbol:'X20'})],
 ['actionVersion','identity',value=>value.actionVersion='ANOTHER_PRIVATE_SENTINEL'],
 ['riskBySleeve','historicalHighWater',value=>value.riskBySleeve.base.historicalHighWater=1],
 ['riskBySleeve','operationalRisk',value=>value.riskBySleeve.base.operationalRisk={operationalHighWater:1}],
 ]){const changed=clone(base);edit(changed);const result=explain(base,changed);assert.equal(result.event.category,category);assert.equal(result.event.field,field);assert.equal(result.event.backgroundPurchaseBlocksOnly,false);}
const reordered=Object.fromEntries(Object.entries(base).reverse()),orderOnly=explain(base,reordered);
assert.equal(orderOnly.event.serializationOrderOnly,true);assert.equal(orderOnly.event.field,'serialization-order');assert.equal(orderOnly.event.backgroundPurchaseBlocksOnly,false);
const hostile=clone(background);hostile.accountPolicy.purchaseBlocks.PRIVATE_SYNC_SENTINEL='not-in-entry-queue';hostile.accountExposure.privateValue='PRIVATE_ACCOUNT_SENTINEL';explain(base,hostile);
for(const [,serialized] of logs){const event=JSON.parse(serialized);
 assert.deepEqual(Object.keys(event).sort(),['basis','category','field','backgroundPurchaseBlocksOnly','backgroundPurchaseBlockDifferenceCount','serializationOrderOnly'].sort());
 for(const secret of ['X20','123456789','PRIVATE_ID_SENTINEL','PRIVATE_VERSION_SENTINEL','ANOTHER_PRIVATE_SENTINEL','PRIVATE_SYNC_SENTINEL','PRIVATE_ACCOUNT_SENTINEL'])assert(!serialized.includes(secret),'No symbol/value/account evidence enters telemetry');}
async function main(){
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-12'});require('./fixtures/c1-account-policy-universe.cjs').applyAccountPolicyUniverseFixture(f,{count:50});f.setCash(100000);
 const oldExecution=createResearchModuleLoader(process.cwd(),{'lib/c1OpeningPriceReview.js':previous}).load('lib/c1AccountExecutionView.js');
 const newExecution=createResearchModuleLoader(process.cwd(),{'lib/c1OpeningPriceReview.js':current}).load('lib/c1AccountExecutionView.js');
 const originalBytes=JSON.stringify({account:f.account,book:f.book});
 const opening=(symbol,close)=>{const value=f.opening();if(!symbol)return value;const bar=f.sessions[220].prices.find(row=>row.symbol===symbol);
  value.receipt.previousAdjustedClosesUnchanged=false;value.priceBasisRevisions=[{symbol,savedClose:bar.close,rechecked:true,observedBar:{...bar,close,low:Math.min(bar.low,close)}}];return value;};
 const call=(execution,value)=>execution.prepareC1AccountExecution({account:f.account,book:f.book,now:f.now,collectOpening:async()=>clone(value)});
 for(const value of [opening(),opening('LLL',99.9),opening('X20',99.99)]){
  const before=await call(oldExecution,value),after=await call(newExecution,value);
  assert.equal(before.openingError,null);assert.equal(after.openingError,null);assert.deepEqual(clone(after),clone(before),'Every successful full response/receipt/order remains identical');
 }
 const rejected=opening('X20',99),before=await call(oldExecution,rejected),after=await call(newExecution,rejected);
 assert.match(before.openingError,/comparison unavailable/);assert.match(after.openingError,/accountPolicy purchaseBlocks/);
 assert.equal(before.openingPlan,null);assert.equal(after.openingPlan,null);assert.equal(after.manualRecommendations.status,'waiting');assert.equal(after.manualRecommendations.orders.length,0,'Diagnostic-only release still rejects the exact background case');
 const observed=logs.filter(row=>row[0]==='C1_OPENING_REVISION_DIFFERENCE').map(row=>JSON.parse(row[1]));assert(observed.some(event=>event.category==='accountPolicy'&&event.field==='purchaseBlocks'&&event.backgroundPurchaseBlocksOnly));
 const changed=opening('X12',99),oldChanged=await call(oldExecution,changed),newChanged=await call(newExecution,changed);
 assert.match(oldChanged.openingError,/orders/);assert.equal(newChanged.openingError,oldChanged.openingError,'Real trade changes remain rejected identically');assert.equal(newChanged.openingPlan,null);
 assert.equal(JSON.stringify({account:f.account,book:f.book}),originalBytes);assert.equal(f.writes,0);
 console.log('PASS: exact background-policy revision remains rejected with precise allowlisted diagnostics; protected/future/real-trade changes stay blocked; serialization-order diagnosed; successful full outputs and financial inputs identical; telemetry contains no symbols, values or identifiers.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
