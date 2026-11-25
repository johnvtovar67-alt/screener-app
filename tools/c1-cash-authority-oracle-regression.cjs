const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-cash-authority-seams.cjs'),fixture=require('./fixtures/c1-cash-authority-source-seams.json');
const fixtureSha256='acfd03e1fca3f2a436a722f9fa8712875437a6e514dd01075e1bdfbf04ef6664';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-cash-authority-source-inverse-v1');
assert.equal(fixture.baselineCommit,'434ae3d43168ff98edd7990fcd29be17df18383d');
assert.equal(sha('tools/fixtures/c1-cash-authority-source-seams.json'),fixtureSha256);
assert.equal(Object.keys(fixture.preservedFixtures).length,84,'Every published fixture is retained');
assert(!Object.hasOwn(fixture.files,'lib/c1AccountSimulator.js'),'Canonical account simulator is unchanged');
assert.equal(sha('lib/c1AccountSimulator.js'),'f03619319ea43465d2625e24866b70fffd811a8f1bfeccfa2582d7b49b6b9bd9','Published canonical account engine stays byte-identical');
assert.equal(sha('tools/generate-c1-account-simulator.cjs'),'0ec09e5cbf339ca5407683c527c655cd59625af424f3ce5d9edf28b3dd3a5728','Canonical generator stays byte-identical');
for(const [file,pin]of Object.entries(fixture.preservedFixtures))assert.equal(sha(file),pin,'Published source/economic fixture remains immutable: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-cash-review-recovery-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed source enters inverse: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Published baseline source recovered: '+file);
 assert.equal(inverse.restore(file,prior),prior,'Exact inverse is idempotent: '+file);
 const unknown=current+'\n/* Unreviewed source keeps its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy normalization: '+file);
 assert.equal(require('./c1-planned-sale-attribution-seams.cjs').restore(file,unknown),unknown,'Older chain rejects unknown source: '+file);
}
console.log('PASS: exact broker cash authority source inverse, all84 published fixture bytes retained, canonical engine unchanged, strict identities/idempotence/unknown-source rejection.');
