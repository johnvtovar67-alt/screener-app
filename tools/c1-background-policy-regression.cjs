// Real full-universe account execution and prior exact source, synthetic I/O.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const{createResearchModuleLoader}=require('./research-module-loader.cjs');
const{createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const inverse=require('./c1-background-policy-seams.cjs');
const emitted=[];
for(const level of ['info','warn'])console[level]=(...args)=>{if(args[0]==='C1_OPENING_REVISION_PARITY'||args[0]==='C1_OPENING_REVISION_DIFFERENCE')emitted.push({name:args[0],event:JSON.parse(args[1])});};
const clone=value=>JSON.parse(JSON.stringify(value)),root=process.cwd();
function loadSource(file,source,loader){
 const deps={},names=[];
 source=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,spec,dependency)=>{
  const values=loader.load(dependency,path.resolve(file));for(const name of spec.split(',').map(s=>s.trim()))deps[name]=values[name];return '';
 }).replace(/export function (\w+)/g,(_,name)=>{names.push(name);return 'function '+name;});
 const box={...deps,Date,console,Map,Set,Object,Array,JSON,Number,String,Boolean};vm.createContext(box);
 vm.runInContext(source+'\nglobalThis.exports={'+names.join(',')+'};',box);return box.exports;
}
const live=createResearchModuleLoader(root),comparison=live.load('lib/c1OpeningPlanComparison.js');
const oldComparator=loadSource('lib/c1OpeningPlanComparison.js',inverse.restore('lib/c1OpeningPlanComparison.js',fs.readFileSync('lib/c1OpeningPlanComparison.js','utf8')),live);
const oldReviewSource=inverse.restore('lib/c1OpeningPriceReview.js',fs.readFileSync('lib/c1OpeningPriceReview.js','utf8'));
async function run({legacy=false,symbol='X20',value=99,revision=true}={}){
 const pairs=[],overrides={};let review;
 const comp=legacy?oldComparator:comparison;
 overrides['lib/c1OpeningPlanComparison.js']={...comp,compareC1OpeningPlans:(a,b,o)=>{const result=comp.compareC1OpeningPlans(a,b,o);pairs.push({a:clone(a),b:clone(b),options:clone(o),equivalent:result.equivalent});return result;}};
 if(legacy)overrides['lib/c1OpeningPriceReview.js']=Object.fromEntries(['reviewC1OpeningPriceRevisions','c1OpeningRevisionFailure','c1OpeningRevisionSources','verifiedC1OpeningPriceBasis'].map(name=>[name,(...args)=>review[name](...args)]));
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-12',moduleOverrides:overrides});
 review=legacy?loadSource('lib/c1OpeningPriceReview.js',oldReviewSource,f.loader):f.loader.load('lib/c1OpeningPriceReview.js');
 require('./fixtures/c1-account-policy-universe.cjs').applyAccountPolicyUniverseFixture(f,{count:50});f.setCash(100000);
 const opening=f.opening(),bar=f.sessions[220].prices.find(p=>p.symbol===symbol);
 if(revision){opening.receipt.previousAdjustedClosesUnchanged=false;opening.priceBasisRevisions=[{symbol,savedClose:bar.close,rechecked:true,observedBar:{...bar,close:value,low:Math.min(bar.low,value)}}];}
 const before=JSON.stringify([f.account,f.book]);
 const result=await f.loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution({account:f.account,book:f.book,now:f.now,collectOpening:async()=>clone(opening)});
 assert.equal(JSON.stringify([f.account,f.book]),before,'Comparison must not rewrite actual account or accepted source');assert.equal(f.writes,0);
 return {result:clone(result),review,pairs};
}
(async()=>{
 const old=await run({legacy:true}),next=await run(),baseline=await run({revision:false});
 assert(old.result.openingError.includes('accountPolicy purchaseBlocks'),'Exact diagnostic release reproduces the confirmed failure');
 assert.equal(next.result.openingError,null);assert.equal(next.result.manualRecommendations.status,'ready');
 assert.deepEqual(next.result.openingPlan.orders,baseline.result.openingPlan.orders,'Background explanation cannot change checked symbols, sizing, prices or quantities');
 const receipt=next.result.openingPlan.sourceReceipt,proof=receipt.priceBasisReview;
 assert.equal(proof.contract,'c1-verified-opening-price-review-v4');
 assert.equal(old.review.verifiedC1OpeningPriceBasis(receipt),false,'Old v2/v3 validators do not retrospectively authorize a new proof');
 assert.equal(next.review.verifiedC1OpeningPriceBasis(receipt),true);
 assert.equal(proof.policyBlockComparison.opening.nonAuthorizingDifferenceCount,1);assert.equal(proof.policyBlockComparison.currentPrice.nonAuthorizingDifferenceCount,1);
 assert.equal(next.result.openingPlan.accountPolicy.purchaseBlocks.X20,'not-in-entry-queue','Publish the true revised policy, never the masked comparison copy');
 const positive=emitted.find(row=>row.event.code==='BACKGROUND_POLICY_TRADING_AUTHORITY_UNCHANGED');assert(positive,'Actual v4 path emits its bounded positive branch proof');
 assert.deepEqual(Object.keys(positive.event).sort(),['code','openingBackgroundDifferenceCount','currentPriceBackgroundDifferenceCount','evidenceComplete'].sort());
 assert.equal(positive.event.openingBackgroundDifferenceCount,proof.policyBlockComparison.opening.nonAuthorizingDifferenceCount);
 assert.equal(positive.event.currentPriceBackgroundDifferenceCount,proof.policyBlockComparison.currentPrice.nonAuthorizingDifferenceCount);assert.equal(positive.event.evidenceComplete,true);
 const selected=await run({symbol:'X12'});assert(selected.result.openingError.includes('orders'),'Selected stock/order changes stay rejected');
 const beforeV2=await run({legacy:true,value:99.9}),afterV2=await run({value:99.9});
 assert.deepEqual(afterV2.result,beforeV2.result,'Existing accepted v2/v3 execution outputs remain byte-equivalent');
 const pair=next.pairs.find(pair=>JSON.stringify(pair.a.accountPolicy.purchaseBlocks)!==JSON.stringify(pair.b.accountPolicy.purchaseBlocks));
 assert(pair);assert.equal(pair.a.accountPolicy.identity,pair.b.accountPolicy.identity);assert.equal(pair.a.accountPolicy.decisionId,pair.b.accountPolicy.decisionId);assert.equal(pair.a.actionVersion,pair.b.actionVersion);
 const incompleteA=clone(pair.a),incompleteB=clone(pair.b);
 for(const plan of [incompleteA,incompleteB]){plan.additionalSwingCapacity.scan.evidenceComplete=false;plan.additionalSwingCapacity.scan.unverifiedEventSymbols=['X22'];}
 const failed=comparison.compareC1OpeningPlans(incompleteA,incompleteB,pair.options);assert.equal(failed.equivalent,false);assert.equal(failed.policyBlockRejection.guard,'INCOMPLETE_EVIDENCE');
 const failureText=next.review.c1OpeningRevisionFailure('opening',failed.original,failed.revised,{...pair.options,policyBlockRejection:failed.policyBlockRejection});
 assert.match(failureText,/background purchase verification did not pass \(INCOMPLETE_EVIDENCE\)/,'Unverified background evidence remains a verification failure, not a claim that orders changed');
 const failureEvent=emitted.at(-1).event;assert.equal(failureEvent.backgroundComparisonGuard,'INCOMPLETE_EVIDENCE');assert.equal(failureEvent.backgroundPurchaseBlocksOnly,true);
 assert(!JSON.stringify(positive.event).includes('X20'));assert(!JSON.stringify(failureEvent).includes('X22'));
 let gateNegatives=0;
 function reject(label,edit,options=pair.options){const a=clone(pair.a),b=clone(pair.b);edit(b);assert.equal(comparison.compareC1OpeningPlans(a,b,options).equivalent,false,label);gateNegatives++;}
 for(const field of ['identity','decisionId'])reject('Exact account '+field,b=>b.accountPolicy[field]+='changed');
 reject('Exact action version',b=>b.actionVersion+='changed');
 reject('Unknown future top-level safety field',b=>b.futureLimit=1);reject('Unknown policy limit',b=>b.accountPolicy.futureLimit=1);
 for(const reason of ['account-exposure-unverified','event-verification-unavailable','new-safety-rule'])reject('Unsafe/unknown block '+reason,b=>b.accountPolicy.purchaseBlocks.X20=reason);
 reject('Structured restriction',b=>b.accountPolicy.purchaseBlocks.X20={reason:'not-in-entry-queue'});
 reject('Prior intraday order remains protected',()=>{},{protectedSymbols:[' x20 ']});
 reject('Account action remains protected',b=>b.accountActions=[{symbol:'X20',action:'Sell'}]);
 reject('Selected candidate remains protected',b=>b.additionalSwingCapacity.symbols.push('X20'));
 reject('Eligible candidate remains protected',b=>b.additionalSwingCapacity.eligibleSymbols.push('X20'));
 reject('Changed review becomes Buy',b=>b.additionalSwingCapacity.reviews.find(row=>row.symbol==='X20').rating='Buy');
 reject('Missing review',b=>b.additionalSwingCapacity.reviews=b.additionalSwingCapacity.reviews.filter(row=>row.symbol!=='X20'));
 reject('Duplicate review',b=>b.additionalSwingCapacity.reviews.push(clone(b.additionalSwingCapacity.reviews.find(row=>row.symbol==='X20'))));
 reject('Changed buy shares',b=>b.orders.find(order=>order.side==='buy').shares++);reject('Changed buy price',b=>b.orders.find(order=>order.side==='buy').estimatedPrice++);
 reject('Changed opening cash',b=>b.openingBooks.base.cash++);reject('Changed projected shares',b=>Object.values(b.projectedBooks.base.positions)[0].shares++);
 reject('Risk pause',b=>b.riskBySleeve.base.paused=!b.riskBySleeve.base.paused);
 for(const field of ['complete','purchaseEligibilityComplete'])reject('Unverified account '+field,b=>b.accountPolicy[field]=false);
 for(const field of ['complete','sourceComplete','evidenceComplete','accountEvidenceComplete'])reject('Incomplete source/current scan '+field,b=>b.additionalSwingCapacity.scan[field]=false);
 for(const field of ['unverifiedSymbols','missingQuoteSymbols','unverifiedEventSymbols','unverifiedHistorySymbols','unverifiedAccountSymbols'])reject('Unverified evidence '+field,b=>b.additionalSwingCapacity.scan[field]=['X20']);
 reject('Source date',b=>b.sourceSessionDate='2026-11-11');
 let proofNegatives=0;
 function deny(edit){const bad=clone(receipt);edit(bad.priceBasisReview);assert.equal(next.review.verifiedC1OpeningPriceBasis(bad),false);proofNegatives++;}
 for(const basis of ['opening','currentPrice']){
  for(const key of ['protectedPurchaseBlocksIdentical','otherPolicyAndPlanFieldsIdentical','sourceAndCurrentEvidenceComplete']){deny(p=>p.policyBlockComparison[basis][key]=false);deny(p=>delete p.policyBlockComparison[basis][key]);}
  for(const key of ['originalCount','revisedCount','nonAuthorizingDifferenceCount'])for(const bad of [-1,.5,'1',10001])deny(p=>p.policyBlockComparison[basis][key]=bad);
  deny(p=>p.policyBlockComparison[basis].unknownLimit=true);
  deny(p=>{p.policyBlockComparison[basis].originalCount=0;p.policyBlockComparison[basis].revisedCount=2;p.policyBlockComparison[basis].nonAuthorizingDifferenceCount=1;});
  deny(p=>{p.policyBlockComparison[basis].originalCount=2;p.policyBlockComparison[basis].revisedCount=3;p.policyBlockComparison[basis].nonAuthorizingDifferenceCount=0;});
 }
 for(const field of ['provider','endpoint','originalInputsPreserved','recordedAccountReplayPreserved','identicalOpeningTradingAuthority','identicalCurrentPriceTradingAuthority'])deny(p=>delete p[field]);
 deny(p=>p.contract='future');deny(p=>p.observedAt='2026-11-13T14:00:00Z');deny(p=>delete p.policyBlockComparison.currentPrice);
 deny(p=>p.policyBlockComparison.opening.nonAuthorizingDifferenceCount=10000);
 deny(p=>{p.policyBlockComparison.opening.nonAuthorizingDifferenceCount=0;p.policyBlockComparison.currentPrice.nonAuthorizingDifferenceCount=0;});
 deny(p=>p.entryReviewComparison.opening.protectedReviewsIdentical=false);deny(p=>delete p.entryReviewComparison.currentPrice);
 console.log(JSON.stringify({realFullUniverseExecution:true,confirmedFailureReproduced:true,actualOrdersUnchanged:true,realRevisedPolicyPublished:true,oldAcceptedOutputExact:true,gateNegatives,proofNegatives,accountWrites:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
