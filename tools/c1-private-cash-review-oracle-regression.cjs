const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-private-cash-review-seams.cjs'),fixture=require('./fixtures/c1-private-cash-review-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-private-cash-review-source-inverse-v1');
assert.equal(fixture.baselineCommit,'dd0f34d4794da4701f7ef3ca3c2fdb74897f989f');
assert.equal(sha('tools/fixtures/c1-private-cash-review-source-seams.json'),'6e0c48146f70410b0def040e230a488772bb44b09f30cc9486418aba9da7d41b');
assert.deepEqual(Object.keys(fixture.files),['components/C1BrokerCashReview.js','components/C1IntradayActivity.js','lib/c1ApiErrors.js','lib/c1BrokerCashRecovery.js','lib/c1IntradayActivity.js','lib/c1PositionPresentation.js','lib/c1RefreshResponse.js','lib/c1SaleAttributionHold.js','pages/api/c1-account.js','pages/index.js']);
assert.equal(Object.keys(fixture.preservedFixtures).length,86,'Every published fixture is retained');
assert.equal(sha('lib/c1AccountSimulator.js'),'f03619319ea43465d2625e24866b70fffd811a8f1bfeccfa2582d7b49b6b9bd9','Published canonical account engine stays byte-identical');
assert.equal(sha('tools/generate-c1-account-simulator.cjs'),'0ec09e5cbf339ca5407683c527c655cd59625af424f3ce5d9edf28b3dd3a5728','Canonical generator stays byte-identical');
for(const [file,pin]of Object.entries(fixture.preservedFixtures))assert.equal(sha(file),pin,'Published source/economic fixture remains immutable: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed source enters inverse: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Published release source recovered: '+file);
 assert.equal(inverse.restore(file,prior),prior,'Exact inverse is idempotent: '+file);
 const unknown=current+'\n/* Unreviewed source keeps its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy normalization: '+file);
 assert.equal(require('./c1-cash-review-recovery-seams.cjs').restore(file,unknown),unknown,'Response recovery chain rejects unknown source: '+file);
 assert.equal(require('./c1-cash-authority-seams.cjs').restore(file,unknown),unknown,'Older chain rejects unknown source: '+file);
}
console.log('PASS: exact private cash-review inverse, all86 published fixture bytes retained, canonical engine unchanged, strict identities/idempotence/unknown-source rejection.');
