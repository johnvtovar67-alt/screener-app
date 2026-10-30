// Independent operational examples, never private-account facts or alpha tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
global.fetch=async()=>{throw Error('Live network forbidden');};
const f=createWorkflowFixture();f.setCash(5000);
const {compareC1OpeningPlans:compare,verifiedC1OpeningPlanComparison:verifiedComparison}=f.loader.load('lib/c1OpeningPlanComparison.js');
const review=f.loader.load('lib/c1OpeningPriceReview.js');
const logs=[];
function oldReview(){
 let source=require('./c1-opening-authority-repair-seams.cjs').restore(fs.readFileSync('lib/c1OpeningPriceReview.js','utf8'));
 const deps={};source=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,file)=>{const m=f.loader.load(file,path.resolve('lib/c1OpeningPriceReview.js'));for(const name of names.split(',').map(n=>n.trim()))deps[name]=m[name];return '';}).replace(/export function /g,'function ');
 const box={...deps,Date,console:{warn:(...args)=>logs.push(args)}};vm.createContext(box);vm.runInContext(source+';globalThis.review=reviewC1OpeningPriceRevisions;',box);return box.review;
}
const beforeReview=oldReview();
const template={contract:'c1-actual-account-opening-plan-v1',status:'projection-only',sourceSessionDate:'2026-10-14',date:'2026-10-15',observedAt:f.now.toISOString(),executable:false,
 orders:[{id:'base:buy',sleeve:'base',symbol:'MRNA',side:'buy',shares:10,estimatedPrice:100,phase:3},
  {id:'base:stop',sleeve:'base',symbol:'LLL',side:'sell',shares:20,estimatedPrice:86,condition:'stop-triggered',phase:4}],
 blockedOrders:[{id:'base:blocked',sleeve:'base',symbol:'SCHW',side:'buy',shares:2,estimatedPrice:100,blockReason:'Personal purchase restriction'}],
 openingBooks:{base:{cash:5000,positions:{LLL:{shares:20,avgCost:100,openedAt:'2026-10-14'}}}},
 projectedBooks:{base:{cash:4000,positions:{LLL:{shares:20,avgCost:100,openedAt:'2026-10-14'},MRNA:{shares:10,avgCost:100,openedAt:'2026-10-15'}}}},
 riskBySleeve:{base:{highWater:10000,paused:false}},purchaseFundingPolicy:'brokerage-cash-only-v1',
 additionalSwingCapacity:{contract:'c1-qualified-swing-capacity-v1',sourceSessionDate:'2026-10-14',symbols:['MRNA'],reviews:[{symbol:'MRNA',rating:'Buy',reason:'Selected'},{symbol:'HUM',rating:'Watch',reason:'Rejected'}]},
 entryReviews:[{sleeve:'base',symbol:'HUM',reason:'position-limit'},{sleeve:'base',symbol:'LLL',reason:'target-complete'}]};
const a=clone(template),b=clone(template);b.entryReviews[0].symbol='MET';b.additionalSwingCapacity.reviews[1]={symbol:'MET',rating:'Watch',reason:'Rejected'};
const bytes=JSON.stringify([a,b]),equivalence=compare(a,b);assert(equivalence.equivalent,'Rejected HUM/MET is not an executable difference');assert.equal(equivalence.evidence.nonAuthorizingReviewDifferenceCount,2);assert(!equivalence.evidence.identicalEntryReviews);assert.equal(JSON.stringify([a,b]),bytes);
const reversed=clone(a);reversed.entryReviews.reverse();assert(compare(a,reversed).equivalent,'Review presentation order is not execution order');assert(compare(a,reversed).evidence.orderingOnly);
let negatives=0;
function blocked(label,mutate){const x=clone(b);mutate(x);assert.equal(compare(a,x).equivalent,false,label);negatives++;}
for(const [key,value] of Object.entries({id:'another',symbol:'TGT',side:'sell',shares:11,estimatedPrice:100.01,phase:2,sequence:1,targetShares:30,reason:'other',condition:'stop-triggered',futureAuthority:true}))blocked('Order '+key,p=>p.orders[0][key]=value);
blocked('Order membership',p=>p.orders.pop());blocked('Execution sequence',p=>p.orders.reverse());blocked('Standing stop',p=>p.orders[1].estimatedPrice=85.99);
blocked('Blocked order quantity',p=>p.blockedOrders[0].shares++);blocked('Blocked order membership',p=>p.blockedOrders=[]);
for(const book of ['openingBooks','projectedBooks']){
 blocked(book+' cash',p=>p[book].base.cash++);blocked(book+' shares',p=>p[book].base.positions.LLL.shares++);
 blocked(book+' cost basis',p=>p[book].base.positions.LLL.avgCost++);blocked(book+' date',p=>p[book].base.positions.LLL.openedAt='2026-10-13');
 blocked(book+' membership',p=>delete p[book].base.positions.LLL);
}
blocked('Risk pause',p=>p.riskBySleeve.base.paused=true);blocked('Future risk constraint',p=>p.riskBySleeve.base.futureLimit=1);
blocked('Funding policy',p=>p.purchaseFundingPolicy='other');blocked('Future top-level limit',p=>p.futureLimit=1);
blocked('Completion policy',p=>p.completionPolicy={partialSymbols:['MRNA']});blocked('Gap assumptions',p=>p.priceAssumptions={maxGap:4});
blocked('Selected capacity name',p=>p.additionalSwingCapacity.symbols=['TGT']);blocked('Selected rating',p=>p.additionalSwingCapacity.reviews[0].rating='Watch');
blocked('Future capacity constraint',p=>p.additionalSwingCapacity.futureLimit=1);blocked('Held review reason',p=>p.entryReviews[1].reason='existing-stop-or-exit');
blocked('Selected candidate review',p=>p.entryReviews.push({sleeve:'base',symbol:'MRNA',reason:'entry-gap-limit'}));
blocked('Blocked stock review',p=>p.entryReviews.push({sleeve:'base',symbol:'SCHW',reason:'entry-gap-limit'}));
blocked('Unknown review reason',p=>p.entryReviews[0].reason='future-authority');blocked('Extended review record',p=>p.entryReviews[0].newLimit=true);
blocked('Malformed review record',p=>p.entryReviews[0].symbol='INVALID SYMBOL');
const duplicate=clone(a);duplicate.entryReviews.push(clone(a.entryReviews[1]));assert(!compare(a,duplicate).equivalent,'Protected duplicate count is conserved');
assert(!compare(a,b,{protectedSymbols:['HUM']}).equivalent,'A prior intraday order remains protected');
const highWater=clone(a);highWater.riskBySleeve.base.highWater++;assert(compare(a,highWater).equivalent,'Existing informational high-water exception remains');

// Recreate the observed failure class using actual planning and execution.
const rename=value=>Array.isArray(value)?value.map(rename):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,rename(v)])):value==='DDD'?'HUM':value==='EEE'?'MET':value;
const account=rename(clone(f.account)),book=rename(clone(f.book)),sessions=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate);
const originalBytes=JSON.stringify({account,book});
const execution=f.loader.load('lib/c1AccountExecutionView.js'),{planC1ContinuedAccountOpening:plan}=f.loader.load('lib/c1AccountExecution.js'),{c1CompletionPolicy}=f.loader.load('lib/c1AccountLedger.js');
function opening(close,symbol='HUM'){
 const o=rename(f.opening());if(close===undefined)return o;
 const old=sessions.at(-1).prices.find(p=>p.symbol===symbol);o.receipt.previousAdjustedClosesUnchanged=false;
 o.priceBasisRevisions=[{symbol,savedClose:old.close,rechecked:true,observedBar:{...old,close,low:Math.min(old.low,close),high:Math.max(old.high,close)}}];return o;
}
const raw=(o,funding=true,capacity=true)=>plan({adoption:account.adoption,sessions,historySessions:book.model.sessions,records:account.records,cashReconciliations:account.cashReconciliations,opening:o,observedAt:o.receipt.observedAt,completionPolicy:c1CompletionPolicy(account.positionContext),purchaseFundingIndependent:funding,additionalSwingCapacity:capacity});
const args=o=>({account,sessions,historySessions:book.model.sessions,opening:o,plan:{...raw(o),providerVerified:true,sourceReceipt:o.receipt,quoteValidUntil:new Date(f.now.getTime()+600000).toISOString()},now:f.now});
assert.throws(()=>beforeReview(args(opening(99.9))),/entryReviews HUM MET symbol/,'Pinned old source reproduces the screenshot failure class');
(async()=>{
 const normal=await execution.prepareC1AccountExecution({account,book,now:f.now,collectOpening:async()=>opening(),includePurchaseDiagnostics:true});
 const repaired=await execution.prepareC1AccountExecution({account,book,now:f.now,collectOpening:async()=>opening(99.9),includePurchaseDiagnostics:true});
 assert.equal(repaired.openingError,null);assert.equal(repaired.manualRecommendations.status,'ready');
 assert.deepEqual(clone(repaired.manualRecommendations.orders),clone(normal.manualRecommendations.orders),'Full manually checked orders unchanged');
 for(const key of ['orders','blockedOrders','openingBooks','projectedBooks','riskBySleeve','purchaseFundingPolicy','quoteValidUntil'])assert.deepEqual(clone(repaired.openingPlan[key]),clone(normal.openingPlan[key]),key);
 assert.deepEqual(clone(repaired.openingPlan.additionalSwingCapacity.symbols),clone(normal.openingPlan.additionalSwingCapacity.symbols));
 const onlyReport=view=>{const v=clone(view),active=new Set(['MRNA','BBB','CCC','LLL']);for(const p of [v.openingPlan,v.intradaySession?.plan].filter(Boolean)){delete p.sourceReceipt;p.entryReviews=p.entryReviews.filter(r=>active.has(r.symbol));p.additionalSwingCapacity.reviews=p.additionalSwingCapacity.reviews.filter(r=>active.has(r.symbol));}return v;};
 assert.deepEqual(onlyReport(repaired),onlyReport(normal),'Complete response differs only in declared non-authorizing reports and audited receipt');
 const receipt=clone(repaired.openingPlan.sourceReceipt),proof=receipt.priceBasisReview;
 assert.equal(proof.contract,'c1-verified-opening-price-review-v3');assert.equal(proof.identicalOpeningPlan,undefined,'Do not claim identical raw reports');assert.equal(proof.entryReviewComparison.opening.nonAuthorizingReviewDifferenceCount,6);
 assert(verifiedComparison(proof.entryReviewComparison));assert(review.verifiedC1OpeningPriceBasis(receipt));
 // Existing v2 successes keep their entire serialized plan and receipt.
 for(const [symbol,close] of [['LLL',99.9],['HUM',99.99]])for(const funding of [false,true])for(const capacity of [false,true]){
  const o=opening(close,symbol),input={...args(o),plan:{...raw(o,funding,capacity),providerVerified:true,sourceReceipt:o.receipt}};
  assert.equal(JSON.stringify(review.reviewC1OpeningPriceRevisions(input)),JSON.stringify(beforeReview(input)),'Unchanged v2 complete serialized output');
 }
 for(const mutate of [r=>r.priceBasisReview.identicalOpeningTradingAuthority=false,r=>r.priceBasisReview.identicalCurrentPriceTradingAuthority=false,
  r=>r.priceBasisReview.recordedAccountReplayPreserved=false,r=>r.priceBasisReview.observedAt='2026-10-15T16:59:00Z',
  r=>r.priceBasisReview.revisions[0].rechecked=false,r=>r.priceBasisReview.entryReviewComparison.opening.protectedReviewsIdentical=false,
  r=>r.priceBasisReview.entryReviewComparison.currentPrice.nonAuthorizingReviewDifferenceCount=-1,
  r=>delete r.priceBasisReview.entryReviewComparison,r=>r.priceBasisReview.entryReviewComparison.contract='other',
  r=>r.priceBasisReview.entryReviewComparison.currentPrice.orderingOnly=true]){const tampered=clone(receipt);mutate(tampered);assert.equal(review.verifiedC1OpeningPriceBasis(tampered),false,'Incomplete/tampered v3 evidence');}
 // Genuine source and current-price changes still reject the complete plan.
 const changed=await execution.prepareC1AccountExecution({account,book,now:f.now,collectOpening:async()=>opening(99.9,'MRNA')});assert.match(changed.openingError,/changes opening orders/);assert.equal(changed.openingPlan,null);assert.equal(changed.manualRecommendations.orders.length,0);
 const currentOnly=opening(99.99,'MRNA');currentOnly.prices=currentOnly.prices.map(p=>p.symbol==='MRNA'?{...p,observedPrice:102.87}:p);
 const currentInput={...args(currentOnly),plan:{...raw(currentOnly,true,false),sourceReceipt:currentOnly.receipt}};
 assert.throws(()=>review.reviewC1OpeningPriceRevisions(currentInput),/changes current-price orders/,'Independent current-price comparison is enforced');
 for(const mutate of [o=>o.priceBasisRevisions[0].rechecked=false,o=>o.priceBasisRevisions[0].observedBar.date='2026-10-13']){const invalid=opening(99.9);mutate(invalid);assert.throws(()=>review.reviewC1OpeningPriceRevisions(args(invalid)),/consistent provider evidence/);}
 const events=opening(99.9);events.currentEventEvidence=[];
 const unavailable=await execution.prepareC1AccountExecution({account,book,now:f.now,collectOpening:async()=>events});assert.equal(unavailable.manualRecommendations.orders.filter(o=>o.side==='buy').length,0,'Accepted report-only revision cannot bypass missing event evidence');
 const {buildC1ManualRecommendations}=f.loader.load('lib/c1ManualRecommendations.js');
 const expired=buildC1ManualRecommendations({decision:repaired.decision,openingPlan:{...repaired.openingPlan,quoteValidUntil:new Date(f.now.getTime()-1).toISOString()},now:f.now});
 assert.equal(expired.status,'waiting');assert.equal(expired.orders.length,0,'A valid v3 basis does not extend quote authority');
 const zero=f.service.updateC1BrokerageCash({account,brokerageCash:0,expectedRevision:account.revision,now:f.now});
 const unfunded=await execution.prepareC1AccountExecution({account:zero,book,now:f.now,collectOpening:async()=>opening(99.9)});
 assert.equal(unfunded.manualRecommendations.orders.filter(o=>o.side==='buy').length,0,'A valid v3 basis cannot supply brokerage cash');
 assert.equal(JSON.stringify({account,book}),originalBytes);assert.equal(f.writes,0);
 assert(logs.every(row=>!JSON.stringify(row).includes('HUM')&&!JSON.stringify(row).includes('MET')),'Historical diagnostics do not log tickers');
 console.log('PASS: real HUM/MET failure-before, full successful response/trade/account parity after, '+negatives+' changed-authority controls, protected reviews/duplicates/future fields, explicit v3 tamper controls, independent current-price rejection, missing events and immutable records; zero writes/live network');
})().catch(error=>{console.error(error);process.exitCode=1;});
