const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-issued-trade-retention-seams.cjs');
const filename='tools/fixtures/c1-issued-trade-retention-source-seams.json',fixture=require('./fixtures/c1-issued-trade-retention-source-seams.json');
assert.equal(fixture.contract,'c1-issued-trade-retention-source-inverse-v1');
assert.equal(fixture.baselineCommit,'6c71f5ca809b301fe49751b6abab4592124b66f0');
assert.equal(createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),'b22c393d94efdbec8dfb925869fff0ef9a668d91fbd981e0b74ab48ba695db3d');
assert.deepEqual(Object.keys(fixture.files),['components/C1IntradayActivity.js','lib/c1AccountLedger.js','lib/c1ApiErrors.js','lib/c1IntradayActivity.js','pages/api/c1-account.js','pages/index.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Exact reviewed issued-trade source: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Exact previous published source: '+file);
 assert.equal(inverse.restore(file,prior),prior,'The inverse is idempotent');
 const unknown=current+'\n// unrelated source cannot impersonate a published release\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy source normalization');
}
console.log('PASS: exact authorized retention source inverse, unchanged baseline identities, idempotence and rejection of unknown application source.');
