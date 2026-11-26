const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-core-cash-freshness-seams.cjs'),fixture=require('./fixtures/c1-core-cash-freshness-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-core-cash-freshness-source-inverse-v1');
assert.equal(fixture.baselineCommit,'7a430f753a293303302750ce03ae19be696a3941');
assert.equal(sha('tools/fixtures/c1-core-cash-freshness-source-seams.json'),'d7e1a87f0f97375fc5cd34339324b3867138782ed56659eed2dc4c4f27212ee4');
assert.deepEqual(Object.keys(fixture.files),['lib/c1AccountPortfolio.js','lib/c1BrokerageCash.js','pages/api/c1-account.js','pages/api/portfolio-sync.js','pages/index.js']);
assert.equal(Object.keys(fixture.preservedFixtures).length,90,'Every previously released fixture is retained');
for(const [file,pin]of Object.entries(fixture.preservedFixtures))assert.equal(sha(file),pin,'Published fixture is byte-identical: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-delayed-fill-portfolio-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed source enters the inverse: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Exact published source recovered: '+file);
 assert.equal(inverse.restore(file,prior),prior,'Inverse is idempotent: '+file);
 const unknown=current+'\n/* Unreviewed source keeps its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'Unknown source is rejected: '+file);
 assert.equal(require('./c1-cash-authority-seams.cjs').restore(file,unknown),unknown,'Prior inverse chain rejects unknown source: '+file);
}
console.log('PASS: Core cash freshness exact source inverse preserves all 90 previously released fixture blobs.');
