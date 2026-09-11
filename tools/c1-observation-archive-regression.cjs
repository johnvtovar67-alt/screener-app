const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const loader = createResearchModuleLoader(process.cwd());
const market = loader.load('lib/marketSession.js');
const source = fs.readFileSync('lib/c1IndexObservationStore.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
const blobs = new Map(), writes = [];
const box = { ...market, Date, Buffer, Response, createHash, gzipSync, gunzipSync,
  C1_LIVE_INPUT_CONTRACT:'c1-dated-index-input-v1', c1DatedBookPath:()=> 'test/book.json.gz',
  put:async(path,bytes,options)=>{writes.push({path,options});assert.equal(options.access,'private');assert.equal(options.allowOverwrite,false);if(blobs.has(path))throw new Error('exists');blobs.set(path,bytes);},
  get:async(path,options)=>{assert.equal(options.access,'private');assert.equal(options.useCache,false);return blobs.has(path)?{statusCode:200,stream:new Response(blobs.get(path)).body}:null;}
};
vm.createContext(box);vm.runInContext(source+'\nglobalThis.archive=archiveC1IndexObservation;',box);
(async()=>{
  const now=new Date('2026-09-11T22:00:00Z');
  const input={contract:'c1-dated-index-input-v1',universe:'sp500',sourceSessionDate:'2026-09-11',observedAt:'2026-09-11T21:00:00.000Z',
    session:{date:'2026-09-11',decisionAt:'2026-09-11T21:00:00.000Z',prices:[{symbol:'ABBV',close:256}]},
    sourceReceipt:{membershipCheckedTwice:true},priorSessionPrices:{date:'2026-09-10',closes:{ABBV:255}},holdings:[{symbol:'PRIVATE'}],syncKey:'secret'};
  const before=JSON.stringify(input),a=await box.archive(input,{now}),path=writes[0].path;
  assert.equal(JSON.stringify(input),before);assert.equal(a.acceptedModelInput,false);
  const saved=JSON.parse(gunzipSync(blobs.get(path)));
  assert.equal(saved.payload.priorSessionPrices.closes.ABBV,255);assert.equal(saved.executable,false);
  assert.ok(!JSON.stringify(saved).includes('secret'));assert.ok(!JSON.stringify(saved).includes('PRIVATE'));
  assert.equal(JSON.stringify(await box.archive(input,{now})),JSON.stringify(a),'Exact retries are idempotent');
  const changed=JSON.parse(before);changed.priorSessionPrices.closes.ABBV=254.98;
  const b=await box.archive(changed,{now});assert.notEqual(b.observationHash,a.observationHash);assert.equal(blobs.size,2);
  assert.equal(JSON.parse(gunzipSync(blobs.get(path))).payload.priorSessionPrices.closes.ABBV,255,'Later price revision does not overwrite original');
  const damaged={...saved,acceptedModelInput:true};blobs.set(path,gzipSync(JSON.stringify(damaged)));
  await assert.rejects(()=>box.archive(input,{now}),/archive unavailable/);
  await assert.rejects(()=>box.archive(input,{now,store:{write:async()=>{throw new Error('private token');},read:async()=>null}}),/^Error: Index observation archive unavailable$/);
  await assert.rejects(()=>box.archive({...input,observedAt:'2026-09-12T22:00:00Z'},{now}),/Current provider observation/);
  const {c1SourcePriceEvidence}=loader.load('lib/c1LiveInput.js');
  const rows=[{date:'2026-09-11',close:256,adjClose:255.5,url:'https://secret',apikey:'secret'},
    {date:'2026-09-09',close:253},{date:'2026-09-10',close:255,adjClose:254.98,adjOpen:NaN}];
  const evidence=c1SourcePriceEvidence('ABBV',rows);
  assert.equal(evidence.length,2);assert.equal(evidence[0].date,'2026-09-10');assert.equal(evidence[0].adjClose,254.98);
  assert.ok(!JSON.stringify(evidence).includes('secret'));assert.ok(!Object.hasOwn(evidence[0],'adjOpen'));assert.equal(rows[0].date,'2026-09-11');
  console.log('PASS: immutable private observation archive, revision retention, collision rejection, source-field privacy');
})().catch(error=>{console.error(error);process.exitCode=1;});
