const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),review=loader.load('lib/c1SessionRevisionReview.js').C1_SESSION_REVISION_REVIEW;
const account={adoption:{sourceSessionDate:'2026-09-15',seeds:{}},records:[],positionContext:{}};
const audit={contract:'c1-reviewed-session-revision-v1',...review,originalInputsPreserved:true,identicalModelEconomics:true,correctedPrices:[{symbol:'AAA',close:99.9}]};
const book={reconciliations:[audit],captures:[{sessionDate:'2026-09-17',observedAt:'2026-09-17T23:47:40Z'}],model:{sessions:[{date:'2026-09-16',prices:[{symbol:'AAA',close:100}]},{date:'2026-09-17',prices:[{symbol:'AAA',close:101}]}]}};
let changedState=false,changedPlan=false;
const box={C1_SESSION_REVISION_REVIEW:review,c1CompletionPolicy:()=>({}),
continueC1ActualAccount:({sessions})=>({books:{cash:100},replay:{},actualCash:100,sleeves:{base:{trades:[],pendingDecisions:[],accountRisk:{paused:changedState&&sessions[0].prices[0].close!==100},actualCash:100,openPositions:[{symbol:'AAA',shares:1,lastPrice:sessions[0].prices[0].close}]}}}),
planC1ContinuedAccountOpening:({sessions})=>({orders:[{shares:changedPlan&&sessions[0].prices[0].close!==100?2:1}]})};
vm.createContext(box);vm.runInContext(fs.readFileSync('lib/c1AccountInput.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.check=assertC1AccountRevisionCoverage;',box);
const before=JSON.stringify({book,account});box.check(book,account,'2026-09-17');assert.equal(JSON.stringify({book,account}),before);
changedState=true;assert.throws(()=>box.check(book,account,'2026-09-17'),/reconciliation/);changedState=false;
changedPlan=true;assert.throws(()=>box.check(book,account,'2026-09-17'),/reconciliation/);changedPlan=false;
for(const key of ['priorRecordHash','evidenceHash','previousSessionDate']){const bad=JSON.parse(JSON.stringify(book));bad.reconciliations[0][key]='different';assert.throws(()=>box.check(bad,account,'2026-09-17'),/reconciliation/);}

// Future FMP finalizations use the same append-only replay proof without a
// date-specific source-code review. Two immutable observations must agree.
const crypto=require('node:crypto'),stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const previous={date:'2026-09-20',prices:[{symbol:'AAA',date:'2026-09-20',open:100,high:102,low:99,close:100,volume:1000}]};
const priorModel={sessions:[previous],ledger:{kind:'virtual-model'},pendingBySleeve:{base:[]},paperExecution:{},paperExecutionStatus:{status:'ready'},summary:{sourceSessionDate:'2026-09-20'}};
const priorContent={contract:'c1-dated-index-book-v1',universe:'sp500',captures:[{sessionDate:'2026-09-20'}],model:priorModel};
const prior={...priorContent,recordHash:digest(priorContent)},observedAt='2026-09-21T22:00:00.000Z';
const input={sourceSessionDate:'2026-09-21',observedAt,priorSessionPrices:{date:'2026-09-20',closes:{AAA:99.9}},
 sourceReceipt:{provider:'FMP',membershipCheckedTwice:true},session:{date:'2026-09-21'},
 priceEvidence:{contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',rows:[
  {symbol:'AAA',date:'2026-09-20',adjOpen:100,adjHigh:102,adjLow:99,adjClose:99.9,volume:1001}]}};
const observation=(at,hash)=>({observedAt:at,observationHash:hash,payload:{...input,observedAt:at}}),observations=[
 observation('2026-09-21T21:58:00.000Z','a'.repeat(64)),observation(observedAt,'b'.repeat(64))];
const advance=model=>({ledger:model.ledger,pendingBySleeve:model.pendingBySleeve,paperExecution:model.paperExecution,
 paperExecutionStatus:model.paperExecutionStatus,summary:model.summary});
const reconcile=loader.load('lib/c1ReviewedSessionRevision.js').reconcileC1VerifiedProviderRevision;
const automatic=reconcile(prior,input,new Date(observedAt),digest,advance,observations);
assert.equal(automatic.audit.contract,'c1-provider-revision-reconciliation-v1');
assert.equal(automatic.audit.mismatches[0].symbol,'AAA');assert.equal(automatic.audit.observations.length,2);
assert.equal(previous.prices[0].close,100,'Original accepted bar remains immutable');
assert.throws(()=>reconcile(prior,input,new Date(observedAt),digest,advance,observations.slice(1)),/evidence/);
const conflicting=JSON.parse(JSON.stringify(observations));conflicting[0].payload.priceEvidence.rows[0].adjClose=100.8;
assert.throws(()=>reconcile(prior,input,new Date(observedAt),digest,advance,conflicting),/evidence/);
assert.throws(()=>reconcile(prior,input,new Date(observedAt),digest,model=>{
 const result=advance(model);if(model.sessions[0].prices[0].close===99.9)result.summary={changed:true};return result;
},observations),/parity/);

const automaticAudit=automatic.audit,automaticBook={reconciliations:[automaticAudit],captures:[{sessionDate:'2026-09-21',observedAt}],
 model:{sessions:[previous,{date:'2026-09-21',prices:[{symbol:'AAA',close:102}]}]}};
const automaticAccount={adoption:{sourceSessionDate:'2026-09-19',seeds:{}},records:[],positionContext:{}};
box.check(automaticBook,automaticAccount,'2026-09-21');
changedPlan=true;assert.throws(()=>box.check(automaticBook,automaticAccount,'2026-09-21'),/reconciliation/);changedPlan=false;
console.log('PASS: reviewed and repeat-verified FMP corrections preserve inputs and reject changed model or private-account economics');
