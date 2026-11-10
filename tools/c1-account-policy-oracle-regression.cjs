const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const {restore,blob}=require('./c1-account-policy-seams.cjs');
const fixture=require('./fixtures/c1-account-policy-source-seams.json');
assert.equal(fixture.contract,'c1-account-policy-source-inverse-v1');
assert.equal(fixture.baselineCommit,'095da15d8d02cdecff5725f1c206047b48e5def4');
assert(Object.keys(fixture.files).length>0,'The authorized source changes must have reviewed inverse evidence');
const check=spawnSync(process.execPath,['tools/generate-c1-account-policy-seams.cjs','--check'],{encoding:'utf8'});
assert.equal(check.status,0,check.stdout+check.stderr);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),previous=restore(file,current);
 assert.notEqual(patch.afterHash,patch.beforeHash,'Only changed files belong in the new inverse fixture');
 assert.equal(blob(previous),patch.beforeHash,'The earlier source pin is retained exactly: '+file);
 assert.equal(restore(file,previous),previous,'A previous source is never inverted a second time: '+file);
 const unreviewed=current+'\n// unreviewed source must not acquire oracle identity\n';
 assert.equal(restore(file,unreviewed),unreviewed,'No fuzzy inverse or arbitrary-source normalization: '+file);
 assert.notEqual(blob(restore(file,unreviewed)),patch.beforeHash,'An unreviewed source cannot impersonate the prior oracle: '+file);
}
console.log('PASS: exact reviewed v2 source reversal, prior source pins, idempotence and rejection of unreviewed source identity ('+Object.keys(fixture.files).length+' files).');
