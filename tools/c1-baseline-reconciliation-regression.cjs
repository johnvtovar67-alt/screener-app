const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
const originalReconcile=loader.load('lib/c1BaselineReconciliation.js').reconcileC1UnexposedBaseline;
const imports={createHash:crypto.createHash,...loader.load('lib/c1ForwardModel.js'),...loader.load('lib/c1DecisionSnapshot.js'),...loader.load('lib/c1HoldingsComparison.js'),...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js')};
function api(reconcile=originalReconcile){const box={...imports,reconcileC1UnexposedBaseline:reconcile,Date,process};vm.createContext(box);vm.runInContext(fs.readFileSync('lib/c1DatedBook.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.accept=acceptC1DatedInput;',box);return box.accept;}
function reviewFor(prior,input){return {priorRecordHash:prior.recordHash,previousSessionDate:'2026-09-10',currentSessionDate:'2026-09-11',reviewedThrough:input.observedAt,membershipSha256:'fixture',anchorsHash:digest(input.priorSessionPrices),priorEvidenceHash:digest(input.priceEvidence.rows),observations:[],mismatches:[{symbol:'ZZZ',previousClose:100,observedPriorClose:99}]};}
function helper(review){const box={C1_BASELINE_REVISION_REVIEW:review,Date,Number,Set,Map};vm.createContext(box);vm.runInContext(fs.readFileSync('lib/c1BaselineReconciliation.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.reconcile=reconcileC1UnexposedBaseline;',box);return box.reconcile;}
const symbols=['AAA','BBB','CCC','ZZZ'];
function input(date){return {contract:'c1-dated-index-input-v1',universe:'sp500',sourceSessionDate:date,observedAt:date+'T22:00:00.000Z',metadata:{},sourceReceipt:{membershipCheckedTwice:true,membershipSha256:'fixture'},session:{date,decisionAt:date+'T22:00:00.000Z',universeSymbols:symbols,prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date,open:100,close:100,high:101,low:99,volume:10000000,adjusted:true})),signals:symbols.slice(0,3).map((symbol,i)=>({symbol,sector:'Sector'+i,price:100,researchFactors:{momentumPercentile:100-i,volatility60Pct:20},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))}};}
const first=input('2026-09-10'),prior=api()(null,first,new Date(first.observedAt)),next=input('2026-09-11');
next.priorSessionPrices={date:'2026-09-10',closes:Object.fromEntries(first.session.prices.map(r=>[r.symbol,r.symbol==='ZZZ'?99:100]))};
next.priceEvidence={contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',rows:first.session.prices.map(r=>({symbol:r.symbol,date:r.date,adjOpen:r.open,adjHigh:r.high,adjLow:r.low,adjClose:r.symbol==='ZZZ'?99:r.close,volume:r.volume})).sort((a,b)=>a.symbol.localeCompare(b.symbol))};
const review=reviewFor(prior,next),reconcile=helper(review),now=new Date(next.observedAt),before=JSON.stringify(prior),accepted=api(reconcile)(prior,next,now);
assert.equal(JSON.stringify(prior),before);
assert.equal(JSON.stringify(accepted.model.sessions[0]),JSON.stringify(prior.model.sessions[0]));
assert.equal(accepted.reconciliations.length,1);
assert.equal(accepted.reconciliations[0].priorRecordHash,prior.recordHash);
assert.equal(accepted.model.summary.executable,false);
assert.equal(accepted.model.summary.eligibleForAlphaClaim,false);
assert.equal(api(reconcile)(accepted,next,now),accepted,'Same observation retry must be idempotent');
assert.throws(()=>api()(prior,next,now),/reconciliation/,'Synthetic record cannot use production review');
for(const mutate of [x=>x.priorSessionPrices.closes.AAA=99,x=>delete x.priorSessionPrices.closes.AAA,x=>x.priceEvidence.rows[0].volume++,x=>x.sourceReceipt.membershipSha256='different',x=>x.observedAt='2026-09-11T21:00:00.000Z']){const bad=clone(next);mutate(bad);assert.throws(()=>api(reconcile)(prior,bad,now));}
assert.throws(()=>reconcile(prior,next,now,digest,(model,...args)=>{const result=imports.advanceC1ForwardModel(model,...args);if(model.sessions[0].prices.find(r=>r.symbol==='ZZZ').close===99)result.ledger.sleeves.base.cash++;return result;}),/conditions/,'Even a cash difference must reject');
for(const mutate of [x=>x.model.ledger.fills.push({id:'existing'}),x=>x.model.ledger.sleeves.base.positions.ZZZ={shares:1},x=>x.model.pendingBySleeve.base.push({symbol:'ZZZ',side:'buy'})]){const bad=clone(prior);mutate(bad);const {recordHash,...content}=bad;bad.recordHash=digest(content);const h=helper({...review,priorRecordHash:bad.recordHash});assert.throws(()=>h(bad,next,now,digest,imports.advanceC1ForwardModel),/conditions/);}
console.log('PASS: exact review, immutable baseline, idempotency, missing/changed evidence, exposed books, queued exposure and replay differences');
if(process.argv.length>2){const read=p=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)));const b=read(process.argv[2]),o=read(process.argv[3]);assert.equal(crypto.createHash('sha256').update(JSON.stringify(o.payload)).digest('hex'),o.observationHash);const snapshot=JSON.stringify(b),r=api()(b,o.payload,new Date(o.observedAt));assert.equal(JSON.stringify(b),snapshot);assert.equal(JSON.stringify(r.model.sessions[0]),JSON.stringify(b.model.sessions[0]));assert.equal(r.reconciliations.length,1);assert.equal(r.model.summary.executable,false);console.log(JSON.stringify({actualUploadedFixture:'PASS',sourceSessionDate:r.model.summary.sourceSessionDate,simulatedFills:r.model.ledger.fills.length,paperExecutionStatus:r.model.paperExecutionStatus.status,comparisonHash:r.reconciliations[0].comparisonHash,originalInputsPreserved:true}));}
