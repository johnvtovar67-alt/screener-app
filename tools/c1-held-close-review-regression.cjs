// Run against the immutable production index and archived provider observation.
// The files remain in their original private store; do not check them into git.
const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
const [bookPath,observationPath]=process.argv.slice(2);
if(!bookPath||!observationPath)throw new Error('Supply the accepted book and archived observation .json.gz paths');
const prior=read(bookPath),observation=read(observationPath),input=observation.payload;
assert.equal(crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'),observation.observationHash);
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const imports={createHash:crypto.createHash,...loader.load('lib/c1ForwardModel.js'),...loader.load('lib/c1DecisionSnapshot.js'),...loader.load('lib/c1HoldingsComparison.js'),...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js'),...loader.load('lib/c1BaselineReconciliation.js')};
const box={...imports,Date,process};vm.createContext(box);
vm.runInContext(fs.readFileSync('lib/c1DatedBook.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.accept=acceptC1DatedInput;',box);
const now=new Date(input.observedAt),before=JSON.stringify(prior),inputBefore=JSON.stringify(input);
const result=box.accept(prior,input,now),audit=result.reconciliations.at(-1);
assert.equal(result.model.sessions.at(-1).date,'2026-09-15');
assert.equal(audit.mismatches.length,29);
assert.equal(audit.reviewedHeldCloses.length,1);assert.equal(audit.reviewedHeldCloses[0].symbol,'DELL');
assert.equal(JSON.stringify(prior),before);assert.equal(JSON.stringify(input),inputBefore);
assert.equal(JSON.stringify(result.model.sessions.slice(0,-1)),JSON.stringify(prior.model.sessions));
assert.equal(JSON.stringify(result.captures.slice(0,-1)),JSON.stringify(prior.captures));
assert.equal(box.accept(result,input,now),result,'Retry must be idempotent');
const original=imports.advanceC1ForwardModel(prior.model,[input.session],now,{completedCloseQueue:true});
for(const k of ['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'])assert.equal(digest(result.model[k]),digest(original[k]),k+' changed');
for(const change of [
 i=>{i.priorSessionPrices.closes.DELL=534.29;i.priceEvidence.rows.find(r=>r.symbol==='DELL'&&r.date==='2026-09-14').adjClose=534.29;},
 i=>{i.priceEvidence.rows.find(r=>r.symbol==='DELL'&&r.date==='2026-09-14').adjOpen=538.58;},
 i=>{i.priceEvidence.rows.find(r=>r.symbol==='DELL'&&r.date==='2026-09-14').adjLow=500;},
 i=>{i.priceEvidence.rows.find(r=>r.symbol==='DELL'&&r.date==='2026-09-14').volume++;},
 i=>{i.priceEvidence.rows=i.priceEvidence.rows.filter(r=>r.symbol!=='DELL');},
 i=>{i.priceEvidence.rows.push(i.priceEvidence.rows.find(r=>r.symbol==='DELL'&&r.date==='2026-09-14'));},
 i=>{i.sourceReceipt.provider='other';},
 i=>{i.sourceReceipt.membershipCheckedTwice=false;},
 i=>{i.observedAt=i.session.decisionAt='2026-09-15T21:00:00.000Z';},
]){const bad=clone(input);change(bad);assert.throws(()=>box.accept(prior,bad,now));}
const another=clone(prior);another.model.ledger.sleeves.base.cash++;delete another.recordHash;another.recordHash=digest(another);
assert.throws(()=>box.accept(another,input,now),/reconciliation/,'A different prior book is not covered');
assert.throws(()=>imports.reconcileC1UnexposedPrices(prior,input,now,digest,(model,...args)=>{
 const r=imports.advanceC1ForwardModel(model,...args);
 if(model.sessions.at(-1).prices.find(p=>p.symbol==='DELL').close===534.28)r.ledger.sleeves.base.cash++;
 return r;
}),/conditions/,'Even a one-dollar parity failure must reject');
const guard=loader.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage;
const account={adoption:{sourceSessionDate:'2026-09-11',seeds:{base:{positions:[{symbol:'FCX'},{symbol:'NTRA'},{symbol:'STX'}]}}},records:[{date:'2026-09-15',fills:[{symbol:'STX',side:'sell'},{symbol:'DELL',side:'buy'}]}]};
guard(result,account,'2026-09-15');
for(const date of ['2026-09-14','2026-09-11',undefined,'2026-02-31']){
 const exposed=clone(account);exposed.records[0].date=date;assert.throws(()=>guard(result,exposed,'2026-09-15'),/DELL/);
}
const adopted=clone(account);adopted.adoption.seeds.base.positions.push({symbol:'DELL'});assert.throws(()=>guard(result,adopted,'2026-09-15'),/DELL/);
const intraday=clone(account);intraday.records=[];intraday.intradayActivity={date:'2026-09-14',fills:[{symbol:'DELL'}]};assert.throws(()=>guard(result,intraday,'2026-09-15'),/DELL/);
console.log('PASS: reviewed real September 15 rollover, immutable history, exact economic parity, idempotency, strict evidence/book boundaries and date-aware account exposure');
