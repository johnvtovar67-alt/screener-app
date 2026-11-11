const assert=require('node:assert/strict'),fs=require('node:fs');
const inverse=require('./c1-opening-shared-seams.cjs'),policy=require('./c1-account-policy-seams.cjs');
const fixture=require('./fixtures/c1-opening-shared-source-seams.json');
assert.equal(fixture.contract,'c1-opening-shared-source-inverse-v1');
assert.equal(fixture.baselineCommit,'97c458bf1a21cd218971d2422d0497a1add772bf');
assert.deepEqual(Object.keys(fixture.files),['lib/c1AccountOpeningProvider.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),old=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash);
 assert.equal(inverse.blob(old),patch.beforeHash);
 assert.equal(inverse.restore(file,old),old,'Idempotent exact inverse');
 const unknown=current+'\n// Unknown source must not normalize\n';
 assert.equal(inverse.restore(file,unknown),unknown);
 assert.equal(policy.restore(file,unknown),unknown);
}
console.log('PASS: exact shared-continuation source inverse preserves prior collector identities.');
