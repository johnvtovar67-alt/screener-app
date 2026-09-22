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
// date-specific source-code review. Every changed bar needs an independent
// repeat observation, while unrelated bars may settle at different times.
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
assert.equal(automatic.audit.confirmationCount,1);assert.match(automatic.audit.confirmationHash,/^[a-f0-9]{64}$/);
assert.equal(previous.prices[0].close,100,'Original accepted bar remains immutable');
assert.throws(()=>reconcile(prior,input,new Date(observedAt),digest,advance,observations.slice(1)),error=>
 error.providerRevisionDiagnostic?.stage==='confirmation'&&error.providerRevisionDiagnostic.unconfirmedCount===1);
const conflicting=JSON.parse(JSON.stringify(observations));conflicting[0].payload.priceEvidence.rows[0].adjClose=100.8;
assert.throws(()=>reconcile(prior,input,new Date(observedAt),digest,advance,conflicting),error=>
 error.providerRevisionDiagnostic?.stage==='confirmation');
assert.throws(()=>reconcile(prior,input,new Date(observedAt),digest,model=>{
 const result=advance(model);if(model.sessions[0].prices[0].close===99.9)result.summary={changed:true};return result;
},observations),/parity/);

// Confirmation is based only on the adjusted OHLCV fields C1 consumes.
const irrelevantProviderChange=JSON.parse(JSON.stringify(observations));
irrelevantProviderChange[0].payload.priceEvidence.rows[0].unadjustedClose=777;
assert.equal(reconcile(prior,input,new Date(observedAt),digest,advance,irrelevantProviderChange).audit.confirmationCount,1);

// Different archived captures may independently confirm different symbols.
const previousTwo={date:'2026-09-20',prices:[...previous.prices,{symbol:'BBB',date:'2026-09-20',open:50,high:52,low:49,close:50,volume:500}]};
const priorTwoContent={...priorContent,model:{...priorModel,sessions:[previousTwo]}};
const priorTwo={...priorTwoContent,recordHash:digest(priorTwoContent)};
const inputTwo={...input,priorSessionPrices:{date:'2026-09-20',closes:{AAA:99.9,BBB:49.5}},priceEvidence:{...input.priceEvidence,rows:[
 ...input.priceEvidence.rows,{symbol:'BBB',date:'2026-09-20',adjOpen:50,adjHigh:52,adjLow:49,adjClose:49.5,volume:501}]}};
const splitObservation=(at,hash,aaaClose,bbbClose)=>({observedAt:at,observationHash:hash,payload:{...inputTwo,observedAt:at,
 priceEvidence:{...inputTwo.priceEvidence,rows:inputTwo.priceEvidence.rows.map(row=>row.symbol==='AAA'?{...row,adjClose:aaaClose}:{...row,adjClose:bbbClose})}}});
const splitObservations=[splitObservation('2026-09-21T21:56:00.000Z','c'.repeat(64),99.9,49.7),
 splitObservation('2026-09-21T21:57:00.000Z','d'.repeat(64),99.8,49.5),
 splitObservation(observedAt,'e'.repeat(64),99.9,49.5)];
const split=reconcile(priorTwo,inputTwo,new Date(observedAt),digest,advance,splitObservations);
assert.equal(split.audit.confirmationCount,2);assert.equal(split.audit.observations.length,3);
assert.equal(JSON.stringify(split.audit.mismatches.map(row=>row.symbol)),JSON.stringify(['AAA','BBB']));

const automaticAudit=automatic.audit,automaticBook={reconciliations:[automaticAudit],captures:[{sessionDate:'2026-09-21',observedAt}],
 model:{sessions:[previous,{date:'2026-09-21',prices:[{symbol:'AAA',close:102}]}]}};
const automaticAccount={adoption:{sourceSessionDate:'2026-09-19',seeds:{}},records:[],positionContext:{}};
box.check(automaticBook,automaticAccount,'2026-09-21');
changedPlan=true;assert.throws(()=>box.check(automaticBook,automaticAccount,'2026-09-21'),/reconciliation/);changedPlan=false;
console.log('PASS: reviewed and repeat-verified FMP corrections preserve inputs and reject changed model or private-account economics');
