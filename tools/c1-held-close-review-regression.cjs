// Default: deterministic synthetic evidence and the real frozen forward engine.
// Optional archived audit: supply immutable book and provider-observation .json.gz
// paths. Private files stay in their original store and are never checked in.
const assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),crypto=require('node:crypto'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));
const [bookPath,observationPath]=process.argv.slice(2);
if(Boolean(bookPath)!==Boolean(observationPath))throw new Error('Supply both accepted-book and archived-observation .json.gz paths');
const clone=v=>JSON.parse(JSON.stringify(v));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const imports={createHash:crypto.createHash,...loader.load('lib/c1ForwardModel.js'),...loader.load('lib/c1DecisionSnapshot.js'),...loader.load('lib/c1HoldingsComparison.js'),...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js'),...loader.load('lib/c1BaselineReconciliation.js')};
function datedApi(reconciliation=imports){
 const box={...imports,...reconciliation,Date,process};vm.createContext(box);
 vm.runInContext(fs.readFileSync('lib/c1DatedBook.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.accept=acceptC1DatedInput;',box);
 return box;
}
function syntheticFixture(){
 const symbols=['DELL','AAA','BBB'];
 const make=(date,previous)=>({contract:'c1-dated-index-input-v1',universe:'sp500',sourceSessionDate:date,
  observedAt:date+'T22:30:00.000Z',metadata:{fixture:'synthetic-held-close-review'},
  sourceReceipt:{provider:'FMP',membershipCheckedTwice:true,membershipSha256:'synthetic-membership'},
  priorSessionPrices:{date:previous,closes:{DELL:534.08,AAA:100,BBB:100,SPY:100,QQQ:100}},
  session:{date,decisionAt:date+'T22:30:00.000Z',universeSymbols:symbols,
   prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date,adjusted:true,...(symbol==='DELL'?
    {open:538.57,high:546.29,low:525.85,close:534.08,volume:9173800}:
    {open:100,high:101,low:99,close:100,volume:10000000})})),
   signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i,price:symbol==='DELL'?534.08:100,
    researchFactors:{momentumPercentile:100-i,volatility60Pct:20},
    entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))}});
 const first=make('2026-09-11','2026-09-10'),second=make('2026-09-14','2026-09-11'),api=datedApi();
 const prior=api.accept(api.accept(null,first,new Date(first.observedAt)),second,new Date(second.observedAt));
 assert.ok(prior.model.ledger.fills.some(fill=>fill.symbol==='DELL'),'Synthetic fixture must contain held DELL exposure');
 assert.ok(Object.values(prior.model.ledger.sleeves).some(s=>s.positions.DELL),'DELL must still be held before the correction');
 const input=make('2026-09-15','2026-09-14');input.priorSessionPrices.closes.DELL=534.28;
 input.priceEvidence={contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',
  rows:[...prior.model.sessions.at(-1).prices,...input.session.prices].map(p=>({symbol:p.symbol,date:p.date,
   adjOpen:p.open,adjHigh:p.high,adjLow:p.low,adjClose:p.symbol==='DELL'&&p.date==='2026-09-14'?534.28:p.close,volume:p.volume}))};
 // Bind the exact-review exception to this artificial book only. The production
 // authority is unchanged, and must reject the same synthetic input below.
 const review={...loader.load('lib/c1HeldCloseRevisionReview.js').C1_HELD_CLOSE_REVISION_REVIEW,
  priorRecordHash:prior.recordHash,observations:['synthetic-review-one','synthetic-review-two']};
 const box={...loader.load('lib/c1ReviewedSessionRevision.js'),
  ...loader.load('lib/c1BaselineRevisionReview.js'),C1_HELD_CLOSE_REVISION_REVIEW:review,Date};vm.createContext(box);
 vm.runInContext(fs.readFileSync('lib/c1BaselineReconciliation.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+
  '\nglobalThis.api={reconcileC1UnexposedBaseline,reconcileC1UnexposedPrices};',box);
 assert.throws(()=>api.accept(prior,input,new Date(input.observedAt)),/reconciliation/,'Production review must reject a synthetic prior book');
 return {prior,input,box:datedApi(box.api),reconcile:box.api.reconcileC1UnexposedPrices,expectedMismatches:1};
}
const observation=bookPath?read(observationPath):null;
const fixture=bookPath?{prior:read(bookPath),input:observation.payload,box:datedApi(),
 reconcile:imports.reconcileC1UnexposedPrices,expectedMismatches:29}:syntheticFixture();
const {prior,input,box,reconcile,expectedMismatches}=fixture;
if(observation)assert.equal(crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex'),observation.observationHash);
const now=new Date(input.observedAt),before=JSON.stringify(prior),inputBefore=JSON.stringify(input);
const result=box.accept(prior,input,now),audit=result.reconciliations.at(-1);
assert.equal(result.model.sessions.at(-1).date,'2026-09-15');
assert.equal(audit.mismatches.length,expectedMismatches);
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
assert.throws(()=>reconcile(prior,input,now,digest,(model,...args)=>{
 const r=imports.advanceC1ForwardModel(model,...args);
 if(model.sessions.at(-1).prices.find(p=>p.symbol==='DELL').close===534.28)r.ledger.sleeves.base.cash++;
 return r;
}),/conditions/,'Even a one-dollar parity failure must reject');
const guard=loader.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage;
const account={adoption:{sourceSessionDate:'2026-09-11',actualCash:15000,seeds:{base:{cash:60000,highWater:120000,
 remainingCooldownSessions:2,positions:['FCX','NTRA','STX'].map(symbol=>({symbol,shares:5,entryPrice:100,openedAt:'2026-09-10',
 stopPrice:86,highWatermark:110}))}}},records:[{date:'2026-09-15',fills:[{symbol:'STX',side:'sell',shares:5,price:100},
 {symbol:'DELL',side:'buy',shares:2,price:538.57}]}],capitalRecord:{highWater:50000,triggerDay:'2026-09-10'}};
// PR #216 authorized append-only provider evidence for these older audits too.
// Historical ownership does not rebase the private account. Its accepted cash,
// cost, fills, stops and retained capital state must remain byte-for-byte intact.
function preservesAccount(exposed){const before=JSON.stringify(exposed);guard(result,exposed,'2026-09-15');
 assert.equal(JSON.stringify(exposed),before,'Provider review must preserve the recorded account basis');}
preservesAccount(account);
for(const date of ['2026-09-14','2026-09-11',undefined,'2026-02-31']){
 const exposed=clone(account);exposed.records[0].date=date;preservesAccount(exposed);
}
const adopted=clone(account);adopted.adoption.seeds.base.positions.push({symbol:'DELL',shares:2,entryPrice:500,
 openedAt:'2026-09-10',stopPrice:430,highWatermark:550});preservesAccount(adopted);
const intraday=clone(account);intraday.records=[];intraday.intradayActivity={date:'2026-09-14',fills:[{symbol:'DELL',side:'buy',shares:2,price:538.57}]};preservesAccount(intraday);
for(const corrupt of [a=>delete a.priorRecordHash,a=>delete a.previousSessionDate,a=>delete a.comparisonHash,
 a=>a.mismatches=[],a=>a.originalInputsPreserved=false,a=>a.economicAdjustments=[{symbol:'DELL',cash:1}],
 a=>delete a.economicAdjustments,a=>a.executable=true,a=>a.eligibleForAlphaClaim=true]){
 const bad=clone(result);corrupt(bad.reconciliations.at(-1));
 assert.throws(()=>guard(bad,adopted,'2026-09-15'),/reviewed account reconciliation/,'Malformed or economically adjusted audits must fail closed');
}
console.log('PASS: '+(bookPath?'archived September 15':'synthetic held-close')+' rollover, immutable history, exact economic parity, idempotency, strict evidence/book boundaries, retained account basis and invalid-audit rejection');
