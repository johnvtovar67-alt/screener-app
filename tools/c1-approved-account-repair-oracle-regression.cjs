const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-approved-account-repair-seams.cjs'),fixture=require('./fixtures/c1-approved-account-repair-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-approved-account-repair-source-inverse-v1');
assert.equal(fixture.baselineCommit,'ea45b3eddcfb4d4bc706903b7c2e6eedbe1aff47');
assert.equal(sha('tools/fixtures/c1-approved-account-repair-source-seams.json'),'ba9fa0a3e3f07c3aff8efac6faa8427f443ea3f6b614e8543818ad9d18771d40');
assert.deepEqual(Object.keys(fixture.files),["components/C1BrokerCashReview.js","lib/c1ApiErrors.js","lib/c1ApprovedAccountRepair.js","pages/api/c1-account.js","pages/index.js"]);
assert.equal(Object.keys(fixture.preservedFixtures).length,87,'Every published fixture is retained');
assert.equal(sha('lib/c1AccountSimulator.js'),'f03619319ea43465d2625e24866b70fffd811a8f1bfeccfa2582d7b49b6b9bd9','Published canonical account engine stays byte-identical');
assert.equal(sha('tools/generate-c1-account-simulator.cjs'),'0ec09e5cbf339ca5407683c527c655cd59625af424f3ce5d9edf28b3dd3a5728','Canonical generator stays byte-identical');
for(const [file,pin]of Object.entries(fixture.preservedFixtures))assert.equal(sha(file),pin,'Published source/economic fixture remains immutable: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-approved-repair-diagnostics-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed source enters inverse: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Published release source recovered: '+file);
 assert.equal(inverse.restore(file,prior),prior,'Exact inverse is idempotent: '+file);
 const unknown=current+'\n/* Unreviewed source keeps its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy normalization: '+file);
 assert.equal(require('./c1-private-cash-review-seams.cjs').restore(file,unknown),unknown,'Private recovery chain rejects unknown source: '+file);
 assert.equal(require('./c1-cash-authority-seams.cjs').restore(file,unknown),unknown,'Older chain rejects unknown source: '+file);
}
console.log('PASS: exact approved-account repair inverse, all87 published fixture bytes retained, canonical engine unchanged, strict identities/idempotence/unknown-source rejection.');
