const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const helpers=createResearchModuleLoader().load('lib/c1ModelParityDiagnostic.js');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fields=['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'];
const original=Object.fromEntries(fields.map(k=>[k,{}])),revised=structuredClone(original);
original.ledger={cash:100};revised.ledger={cash:99};
const diagnostic=helpers.buildC1ModelParityDiagnostic(original,revised,digest);
const logs=[],box={...helpers,Buffer,timingSafeEqual:crypto.timingSafeEqual,process:{env:{CRON_SECRET:'synthetic-secret'}},
 console:{info:(...v)=>logs.push(v.join(' ')),error:(...v)=>logs.push(v.join(' '))},observeC1ScheduledReadiness:async()=>null,
 refreshC1Index:async()=>{const e=Error('Missing archived index session: 2026-11-03; no historical membership backfill');
 e.providerRevisionDiagnostic={stage:'model-parity',modelParity:{...diagnostic,privateAccount:'PRIVATE_SENTINEL'}};
 e.indexRecovery={state:'blocked',sessionDate:'2026-11-04',acquisition:'failed',recoveredSessionDates:['2026-11-02'],secret:'PRIVATE_SENTINEL'};throw e;}};
vm.createContext(box);vm.runInContext(fs.readFileSync('pages/api/cron/c1-index.js','utf8').replace(/^import .*;\n/gm,'').replace(/export default /g,'').replace(/export /g,'')+';this.run=handler;',box);
(async()=>{
 const res={setHeader(){},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};
 await box.run({method:'GET',headers:{authorization:'Bearer synthetic-secret'}},res);
 assert.equal(res.code,503);assert.equal(res.body.executable,false);
 const log=JSON.parse(logs.at(-1).slice('[c1-index] '.length));
 assert.equal(log.reason,'Missing archived index session: 2026-11-03; no historical membership backfill');
 assert.equal(log.providerRevision.modelParity.changedPathCount,1);
 assert.equal(log.providerRevision.modelParity.sample[0].before.value,100);
 assert.equal(log.recovery.state,'blocked');assert.deepEqual(Array.from(log.recovery.recoveredSessionDates),['2026-11-02']);
 assert(!logs.join('').includes('PRIVATE_SENTINEL'));assert(!logs.join('').includes('synthetic-secret'));
 assert.equal(box.revisionDiagnostic({providerRevisionDiagnostic:{stage:'model-parity',modelParity:{contract:'private'}}}).modelParity,undefined);
 assert.equal(box.recoveryDiagnostic({indexRecovery:{state:'blocked',sessionDate:'https://secret',acquisition:'failed',recoveredSessionDates:[]}}),undefined);
 assert.equal(box.recoveryDiagnostic({indexRecovery:{state:'blocked',sessionDate:'2026-11-04',acquisition:'failed',recoveredSessionDates:Array(7).fill('2026-11-03')}}),undefined);
 box.refreshC1Index=async()=>({status:'advanced',sourceSessionDate:'2026-11-04',decisionSnapshot:{decisionId:'diagnostic-only'},
  recovered:[{sessionDate:'2026-11-03',observationHash:'a'.repeat(64),private:'PRIVATE_SENTINEL'},
   {sessionDate:'2026-11-04',observationHash:'b'.repeat(64)}]});
 await box.run({method:'GET',headers:{authorization:'Bearer synthetic-secret'}},res);
 const success=JSON.parse(logs.at(-1).slice('[c1-index] '.length));
 assert.equal(success.status,'succeeded');assert.equal(success.recovered.length,2);
 assert.equal(success.recovered[1].observationHash,'b'.repeat(64));assert(!logs.join('').includes('PRIVATE_SENTINEL'));
 assert.equal(box.recoveredDiagnostic({sourceSessionDate:'2026-11-04',recovered:[{sessionDate:'2026-11-03',observationHash:'a'.repeat(64)}]}),undefined);
 const receipt={contract:'c1-index-observation-receipt-v1',observationHash:'c'.repeat(64),sourceSessionDate:'2026-11-04',acceptedModelInput:false};
 assert.equal(box.recoveredDiagnostic({sourceSessionDate:'2026-11-04',observationReceipt:receipt,recovered:[{sessionDate:'2026-11-03',observationHash:'a'.repeat(64)}]}).length,1);
 assert.equal(box.recoveredDiagnostic({sourceSessionDate:'2026-11-04',recovered:[{sessionDate:'2026-11-04',observationHash:'PRIVATE_SENTINEL'}]}),undefined);
 console.log('PASS: scheduled failure logs retain typed complete-field comparison and bounded recovery state without arbitrary errors or private fields.');
})().catch(e=>{console.error(e);process.exitCode=1;});
