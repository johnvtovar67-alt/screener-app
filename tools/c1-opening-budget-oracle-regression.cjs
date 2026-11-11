const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-opening-budget-seams.cjs'),policy=require('./c1-account-policy-seams.cjs');
const fixture=require('./fixtures/c1-opening-budget-source-seams.json'),prior=require('./fixtures/c1-opening-shared-source-seams.json');
assert.equal(fixture.contract,'c1-opening-budget-source-inverse-v1');
assert.equal(fixture.baselineCommit,'dd2d86db2dc8da521bf83d83912d8c46b7f86a2e');
assert.deepEqual(Object.keys(fixture.files),['lib/c1AccountOpeningProvider.js']);
assert.equal(createHash('sha256').update(fs.readFileSync('tools/fixtures/c1-opening-shared-source-seams.json')).digest('hex'),
 'c09caa2751d1b4b7010d4b81b08a97064ee45607b78c0ea69a1fd5b1458bd82e','Published shared-scan fixture remains immutable');
for(const [file,p]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),old=inverse.restore(file,current);
 assert.equal(inverse.blob(current),p.afterHash);assert.equal(inverse.blob(old),p.beforeHash);
 assert.equal(p.beforeHash,prior.files[file].afterHash,'Released source identity retained');
 assert.equal(inverse.restore(file,old),old,'Idempotent inverse');
 const unknown=current+'\n// Unknown code cannot gain historical identity\n';
 assert.equal(inverse.restore(file,unknown),unknown);assert.equal(policy.restore(file,unknown),unknown);
}
console.log('PASS: exact bounded-acquisition inverse preserves deployed shared-scan and historical source identities.');
