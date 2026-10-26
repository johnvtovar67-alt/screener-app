const assert=require('node:assert/strict');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
async function main(){
 const f=createWorkflowFixture('buy');f.setCash(5000);
 const execution=f.loader.load('lib/c1AccountExecutionView.js');
 const original=JSON.stringify({account:f.account,book:f.book});
 const normal=await f.prepare();
 assert(normal.openingPlan,'Control opening must be available');
 const opening=f.opening(),saved=f.sessions[220].prices.find(p=>p.symbol==='LLL');
 opening.receipt.previousAdjustedClosesUnchanged=false;
 opening.priceBasisRevisions=[{symbol:'LLL',savedClose:saved.close,rechecked:true,observedBar:{...saved,close:99.9,low:99.8}}];
 const reviewed=await execution.prepareC1AccountExecution({account:f.account,book:f.book,now:f.now,collectOpening:async()=>clone(opening)});
 assert.equal(reviewed.openingError,null,'An unchanged recorded basis must not fail because the comparator drops live plan policies');
 assert(reviewed.openingPlan);
 for(const key of ['orders','blockedOrders','entryReviews','openingBooks','projectedBooks','purchaseFundingPolicy','additionalSwingCapacity'])assert.deepEqual(clone(reviewed.openingPlan[key]),clone(normal.openingPlan[key]),key+' must retain full real-plan parity');
 assert.equal(reviewed.openingPlan.sourceReceipt.priceBasisReview.revisions[0].accountTreatment,'preserved-recorded-basis');
 assert.equal(JSON.stringify({account:f.account,book:f.book}),original);
 assert.equal(f.writes,0);
 const {planC1ContinuedAccountOpening:plan}=f.loader.load('lib/c1AccountExecution.js');
 const review=f.loader.load('lib/c1OpeningPriceReview.js').reviewC1OpeningPriceRevisions;
 const {c1CompletionPolicy}=f.loader.load('lib/c1AccountLedger.js');
 const sessions=f.book.model.sessions.filter(s=>s.date>=f.account.adoption.sourceSessionDate);
 for(const purchaseFundingIndependent of [false,true])for(const additionalSwingCapacity of [false,true]){
  const p=plan({adoption:f.account.adoption,sessions,historySessions:f.book.model.sessions,records:f.account.records,opening,observedAt:opening.receipt.observedAt,completionPolicy:c1CompletionPolicy(f.account.positionContext),purchaseFundingIndependent,additionalSwingCapacity});
  const result=review({account:f.account,sessions,historySessions:f.book.model.sessions,opening,plan:{...p,sourceReceipt:opening.receipt},now:f.now});
  for(const key of ['orders','blockedOrders','openingBooks','projectedBooks'])assert.deepEqual(clone(result[key]),clone(p[key]),'Exact policy combination parity: '+key);
 }
 const invalid=clone(opening);invalid.priceBasisRevisions[0].rechecked=false;
 assert.throws(()=>review({account:f.account,sessions,historySessions:f.book.model.sessions,opening:invalid,plan:normal.openingPlan,now:f.now}),/consistent provider evidence/);
 const boundary=f.opening(),candidate=f.sessions[220].prices.find(p=>p.symbol==='MRNA');
 boundary.prices=boundary.prices.map(p=>p.symbol==='MRNA'?{...p,open:102.5,observedPrice:102.5}:p);
 boundary.receipt.previousAdjustedClosesUnchanged=false;
 boundary.priceBasisRevisions=[{symbol:'MRNA',savedClose:candidate.close,rechecked:true,observedBar:{...candidate,close:99,low:98.9}}];
 const boundaryPlan=plan({adoption:f.account.adoption,sessions,historySessions:f.book.model.sessions,records:f.account.records,opening:boundary,observedAt:boundary.receipt.observedAt,completionPolicy:c1CompletionPolicy(f.account.positionContext),purchaseFundingIndependent:true,additionalSwingCapacity:true});
 assert.throws(()=>review({account:f.account,sessions,historySessions:f.book.model.sessions,opening:boundary,plan:boundaryPlan,now:f.now}),/changes opening orders/,'A genuine gap/order change remains fail-closed with both live policies');
 console.log('PASS: actual execution path accepts repeat-verified held-price correction with identical orders, policies, books and zero writes');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
