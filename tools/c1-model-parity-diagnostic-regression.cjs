const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const digest=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
const {buildC1ModelParityDiagnostic:build,safeC1ModelParityDiagnostic:safe}=loader.load('lib/c1ModelParityDiagnostic.js');
function reconciliation(diagnosticOverride){
 if(!process.env.C1_PARITY_BASELINE_FILE&&!diagnosticOverride)return loader.load('lib/c1ReviewedSessionRevision.js').reconcileC1VerifiedProviderRevision;
 const box={...loader.load('lib/c1RecordedSaleFinalization.js'),...loader.load('lib/c1RecordedSaleRevision.js'),...loader.load('lib/c1SessionRevisionReview.js'),buildC1ModelParityDiagnostic:diagnosticOverride||build};
 vm.createContext(box);vm.runInContext(fs.readFileSync(process.env.C1_PARITY_BASELINE_FILE||'lib/c1ReviewedSessionRevision.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+';this.run=reconcileC1VerifiedProviderRevision;',box);return box.run;
}
const fields=['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'];
const bar={symbol:'AAA',date:'2026-11-03',open:100,high:102,low:98,close:100,volume:1000};
const prior={universe:'sp500',model:{sessions:[{date:bar.date,prices:[bar]}],ledger:{kind:'virtual-model'}}};prior.recordHash=digest(prior);
const input={sourceSessionDate:'2026-11-04',observedAt:'2026-11-04T22:00:00Z',session:{date:'2026-11-04'},
 sourceReceipt:{provider:'FMP',membershipCheckedTwice:true},priorSessionPrices:{date:bar.date},priceEvidence:{contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',
 rows:[{symbol:'AAA',date:bar.date,adjOpen:100,adjHigh:102,adjLow:98,adjClose:100.1,volume:1000}]}};
const observations=[{observationHash:'a'.repeat(64),observedAt:'2026-11-04T21:00:00Z',payload:{...clone(input),observedAt:'2026-11-04T21:00:00Z'}},
 {observationHash:'b'.repeat(64),observedAt:input.observedAt,payload:input}];
const original={ledger:{sleeves:{base:{cash:100}},fills:[{shares:4,price:100}]},pendingBySleeve:{base:[{symbol:'AAA',shares:2}]},
 paperExecution:{cash:100,modelHistory:'PRIVATE_SENTINEL original serialized history'},paperExecutionStatus:{status:'unchanged'},summary:{cash:100,modelRevision:2}};
const revised=clone(original);revised.ledger.sleeves.base.cash=100.4;revised.ledger.fills[0].price=100.1;
revised.pendingBySleeve.base[0].shares=3;revised.paperExecution.cash=100.4;revised.paperExecution.modelHistory='PRIVATE_SENTINEL revised history';
revised.paperExecutionStatus.status='blocked';revised.summary.cash=100.4;revised.summary.modelRevision=3;
let error;
try{reconciliation()(prior,input,new Date(input.observedAt),digest,model=>clone(model.sessions[0].prices[0].close===100?original:revised),observations);}catch(cause){error=cause;}
assert.equal(error?.providerRevisionDiagnostic?.stage,'model-parity');
const report=error.providerRevisionDiagnostic.modelParity;
assert(report,'A model-parity failure must retain a complete-field economic diagnostic');
assert.equal(report.changedPathCount,8);assert.equal(report.truncated,false);
assert.deepEqual(Array.from(report.comparedFields,row=>row.field),fields);
assert.deepEqual(Array.from(report.comparedFields,row=>row.changedPathCount),[2,1,2,1,2]);
assert.equal(report.sample.find(row=>row.path==='/ledger/fills/0/price').before.value,100);
assert.equal(report.sample.find(row=>row.path==='/ledger/fills/0/price').after.value,100.1);
assert.equal(report.sample.find(row=>row.path==='/paperExecution/modelHistory').before.value,undefined,'Serialized histories must remain hash-only');
assert.equal(report.interpretation,'requires-evidence-review');assert.equal(report.simulatorStops,'not-present-in-compared-model');
assert.equal(report.privateAccounts,'not-compared');assert.equal(canonical(safe(report)),canonical(report));
assert.doesNotMatch(JSON.stringify(report),/PRIVATE_SENTINEL|serialized history|revised history/);
assert.equal(canonical(prior.model.sessions[0].prices[0]),canonical(bar),'Diagnostic cannot rewrite accepted evidence');
let diagnosticFailure;
try{reconciliation(()=>{throw new Error('Diagnostic unavailable');})(prior,input,new Date(input.observedAt),digest,model=>clone(model.sessions[0].prices[0].close===100?original:revised),observations);}catch(cause){diagnosticFailure=cause;}
assert.equal(diagnosticFailure?.providerRevisionDiagnostic?.stage,'model-parity');assert.equal(diagnosticFailure.providerRevisionDiagnostic.modelParity,undefined);
assert.match(diagnosticFailure.message,/economic parity failed/,'A diagnostic failure cannot replace the original economic rejection');

const many=Object.fromEntries(fields.map(field=>[field,{}])),after=clone(many);
for(let i=0;i<500;i++)after.ledger['PRIVATE_SENTINEL_'+i]=i;
const large=build(many,after,digest);assert.equal(large.changedPathCount,500);assert.equal(large.sample.length,12);assert.equal(large.truncated,true);
assert.equal(large.comparedFields[0].changedPathCount,500);assert.equal(large.counts['financial-state'],500);assert(safe(large));
const later=clone(after);later.ledger.PRIVATE_SENTINEL_499++;
assert.notEqual(build(many,later,digest).changesHash,large.changesHash,'Differences beyond the sample participate in the complete difference hash');
assert.doesNotMatch(JSON.stringify(large),/PRIVATE_SENTINEL/,'Unknown object keys are hash-only');
assert.equal(build(original,clone(original),digest).changedPathCount,0);
const reordered=clone(original);reordered.ledger=Object.fromEntries(Object.entries(original.ledger).reverse());assert.equal(build(original,reordered,digest).changedPathCount,0,'Property order alone is canonical-equivalent');
const orderDigest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const orderReport=build(original,reordered,orderDigest);assert.equal(orderReport.changedPathCount,1);assert.equal(orderReport.counts['representation-order'],1);assert(safe(orderReport));
assert(JSON.stringify(large).length<8192,'Scheduled diagnostic stays below an explicit aggregate byte bound');
const historyOriginal=clone(original);historyOriginal.paperExecution.modelHistory=JSON.stringify([{id:'base:1',shares:2,price:100}]);
const historyRevised=clone(historyOriginal);historyRevised.paperExecution.modelHistory='[ { "price": 100.0, "shares": 2, "id": "base:1" } ]';
const serialization=build(historyOriginal,historyRevised,digest);assert.equal(serialization.changedPathCount,1);assert.equal(serialization.counts['representation-json'],1);assert(safe(serialization));
assert.equal(serialization.sample[0].before.value,undefined);assert.equal(serialization.sample[0].after.value,undefined);
for(const meaningful of ['[{"id":"base:1","shares":3,"price":100}]','[{"id":"base:1","shares":2,"price":100.000001}]','[{"id":"base:2","shares":2,"price":100}]',
 '[{"id":"base:1","shares":"2","price":100}]','[{"id":"base:1","shares":2,"price":100},{}]','invalid JSON','null']){
 const changed=clone(historyOriginal);changed.paperExecution.modelHistory=meaningful;
 const report=build(historyOriginal,changed,digest);assert.equal(report.counts['representation-json'],0);assert.equal(report.counts.unclassified,1);
}
let serializationRejection;
try{reconciliation()(prior,input,new Date(input.observedAt),digest,model=>clone(model.sessions[0].prices[0].close===100?historyOriginal:historyRevised),observations);}catch(cause){serializationRejection=cause;}
assert.equal(serializationRejection?.providerRevisionDiagnostic?.stage,'model-parity','Proven serialization differences still reject under unchanged economic hashes');
assert.equal(serializationRejection.providerRevisionDiagnostic.modelParity.counts['representation-json'],1);
const unknown=clone(original);unknown.summary.PRIVATE_SENTINEL={confidential:'PRIVATE_SENTINEL'};
const unknownReport=build(original,unknown,digest);assert.equal(unknownReport.counts.unclassified,1);assert(safe(unknownReport));
assert.doesNotMatch(JSON.stringify(unknownReport),/PRIVATE_SENTINEL|confidential/);
for(const mutate of [x=>x.sample[0].before.value='PRIVATE_SENTINEL',x=>x.sample[0].path='/summary/PRIVATE_SENTINEL',x=>x.sample[0].before.sha256='bad',
 x=>x.comparedFields[0].field='account',x=>x.changedPathCount++,x=>x.counts.unclassified++,x=>x.sampleLimit=1000,x=>x.truncated=true,
 x=>x.sample[0].kind='representation-only',x=>x.privateAccounts='verified',x=>x.sample.push(x.sample[0])]){
 const bad=clone(report);mutate(bad);assert.equal(safe(bad),undefined,'Arbitrary exception properties must not reach scheduled logs');
}
const extra=clone(report);extra.privateDebug='PRIVATE_SENTINEL';extra.sample[0].privateDebug='PRIVATE_SENTINEL';
assert.doesNotMatch(JSON.stringify(safe(extra)),/PRIVATE_SENTINEL/,'Allowlist projection excludes unexpected fields');
extra.sample[0].cycle=extra;extra.sample[0].largeInteger=1n;extra.sample[0].untrustedSerialization={toJSON(){throw new Error('Untrusted serializer must not run');}};
assert.doesNotThrow(()=>safe(extra),'Unexpected circular/BigInt/custom-serialization fields are dropped before serialization');
assert.equal(canonical(safe(extra)),canonical(report));
console.log('PASS: rejected model transition exposes all five economic fields, exact complete changed-leaf counts/hashes, bounded numeric details, private-string redaction and explicit stop/account limits; acceptance guards unchanged.');
