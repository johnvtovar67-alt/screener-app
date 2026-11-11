const assert=require('node:assert/strict'),fs=require('node:fs');
const {restore,blob}=require('./c1-watch-display-seams.cjs');
const fixture=require('./fixtures/c1-watch-display-source-seams.json');
const old=require('./fixtures/c1-account-policy-source-seams.json');
assert.equal(fixture.baselineCommit,'5fbbbd9412e9b01d7f2d2deea2f926c8600f9e4a');
assert.deepEqual(Object.keys(fixture.files),['lib/c1OpportunitiesProjection.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8');
 assert.equal(blob(current),patch.afterHash);
 assert.equal(blob(restore(file,current)),patch.beforeHash);
 assert.equal(patch.beforeHash,old.files[file].afterHash);
 assert.equal(restore(file,restore(file,current)),restore(file,current));
 const unknown=current+'\n// unknown\n';assert.equal(restore(file,unknown),unknown);
 assert.equal(blob(require('./c1-account-policy-seams.cjs').restore(file,current)),old.files[file].beforeHash);
}
console.log('PASS: Watch display repair reverses exactly; all released source identities remain pinned and unknown changes are rejected.');
