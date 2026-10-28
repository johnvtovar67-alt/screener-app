const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs'),l=createResearchModuleLoader(process.cwd());
const {proveC1RecordedSaleFinalization:prove,C1_RECORDED_SALE_FINALIZATION:r}=l.load('lib/c1RecordedSaleFinalization.js');
const {createC1SleeveAccounting:create,applyC1SleeveFill:fill,restoreC1SleeveAccounting:restore,valueC1SleeveAccounting:value}=l.load('lib/c1SleeveAccounting.js');
const {c1CombinedPortfolio:combined}=l.load('lib/c1CombinedPortfolio.js');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex'),clone=v=>JSON.parse(JSON.stringify(v));
let ledger=create(100000,'2026-09-10');
for(let i=0;i<20;i++){
 const sale=r.sales.find(s=>s.index===i),sleeve=sale?.sleeve||['base','cooldown15','sector40'][i%3];
 ledger=fill(ledger,{id:'fill'+i,sleeve,date:r.previousSessionDate,symbol:sale||i<3?'ZZZ':'NNN',side:sale?'sell':'buy',shares:sale?.shares||(i<3?200:1),price:sale?r.recordedPrice:100,fee:0});
}
const session={date:r.previousSessionDate,prices:[{symbol:'ZZZ',close:170},{symbol:'NNN',close:100}]},input={sourceSessionDate:r.currentSessionDate,session:{date:r.currentSessionDate,prices:[{symbol:'ZZZ',close:180},{symbol:'NNN',close:101}]}},marks={ZZZ:180,NNN:101};
const summary=(state,status)=>{const v=value(state,marks);return {cash:v.cash,equity:v.equity,virtualShares:v.virtualShares,combinedPortfolio:combined(state,marks,r.currentSessionDate),sleeves:Object.fromEntries(Object.entries(state.sleeves).map(([id,s])=>[id,{cash:s.cash,positions:s.positions,tradeCount:state.fills.filter(f=>f.sleeve===id).length}])),paperExecution:status,unchanged:'sentinel'};};
const status={status:'unchanged',reason:null,proposedOrderCount:0,executable:false,basis:'retrospective-model-event-paper-mapping'};
const prior={recordHash:r.priorRecordHash,model:{sessions:[session],ledger,paperExecution:{records:['accepted']}}};
const original={...clone(prior.model),sessions:[clone(session),clone(input.session)],pendingBySleeve:{base:[{symbol:'ZZZ',side:'buy',shares:1}]},pendingDecisionStatus:{status:'research-queue-only'},paperExecutionStatus:status,summary:summary(ledger,status)};
const corrected=clone(original);for(const s of r.sales)corrected.ledger.fills[s.index].price=r.revisedPrice;
corrected.ledger=restore(corrected.ledger);corrected.paperExecutionStatus={...status,status:'blocked',reason:'Model history changed'};corrected.summary=summary(corrected.ledger,corrected.paperExecutionStatus);
const before=JSON.stringify({prior,input,original,corrected}),proof=prove(prior,input,original,corrected,digest);
assert.ok(proof);assert.equal(proof.recordedFillsPreserved,true);assert.equal(proof.pendingDecisionsIdentical,true);assert.equal(proof.newModelFills,0);assert.equal(JSON.stringify({prior,input,original,corrected}),before);
for(const mutate of [x=>x.ledger.fills[15].shares++,x=>x.ledger.fills[0].price++,x=>x.ledger.fills[15].price+=.01,x=>x.ledger.fills[15].date='2026-10-27',x=>x.ledger.sleeves.base.positions.ZZZ++,x=>x.pendingBySleeve.base[0].shares++,x=>x.pendingDecisionStatus.status='changed',x=>x.paperExecution.records.push('new'),x=>x.summary.unchanged='different',x=>x.paperExecutionStatus.reason='different']){const bad=clone(corrected);mutate(bad);assert.equal(prove(prior,input,original,bad,digest),null);}
assert.equal(prove({...prior,recordHash:'different'},input,original,corrected,digest),null);
assert.equal(prove(prior,{...input,sourceSessionDate:'2026-10-28'},original,corrected,digest),null);
const changedOriginal=clone(original);changedOriginal.ledger.fills.push({id:'new'});assert.equal(prove(prior,input,changedOriginal,corrected,digest),null);
const guard=l.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage;
const audit={contract:'c1-recorded-sale-finalization-v1',priorRecordHash:r.priorRecordHash,previousSessionDate:r.previousSessionDate,currentSessionDate:r.currentSessionDate,provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',observations:['a'.repeat(64),'b'.repeat(64)],privateAccountTreatment:'preserved-recorded-basis',originalInputsPreserved:true,identicalModelEconomics:false,economicAdjustments:[],executable:false,eligibleForAlphaClaim:false,comparisonHash:digest(original),recordedSaleProof:proof};
const account={adoption:{sourceSessionDate:'2026-09-10'}};guard({reconciliations:[audit]},account,r.currentSessionDate);
for(const mutate of [a=>a.identicalModelEconomics=true,a=>a.economicAdjustments.push({amount:1}),a=>a.recordedSaleProof.recordedCashPreserved=false,a=>a.recordedSaleProof.pendingDecisionsIdentical=false,a=>a.priorRecordHash='different',a=>a.recordedSaleProof.recordedLedgerHash='bad']){const bad=clone(audit);mutate(bad);assert.throws(()=>guard({reconciliations:[bad]},account,r.currentSessionDate),/reconciliation/);}
console.log('PASS: exact recorded-sale proof, complete counterfactual reconstruction, immutable originals, altered holdings/queues/fills/cash/metadata rejected, private recorded-basis guard');
