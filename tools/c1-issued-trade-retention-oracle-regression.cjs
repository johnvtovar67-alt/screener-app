const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-issued-trade-retention-seams.cjs');
const filename='tools/fixtures/c1-issued-trade-retention-source-seams.json',fixture=require('./fixtures/c1-issued-trade-retention-source-seams.json');
assert.equal(fixture.contract,'c1-issued-trade-retention-source-inverse-v1');
assert.equal(fixture.baselineCommit,'6c71f5ca809b301fe49751b6abab4592124b66f0');
assert.equal(createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),'20efabb85136c4979ed44bf748466c4a6a795ff0576920518f13b0c27f80ba5e');
assert.deepEqual(Object.keys(fixture.files),['components/C1IntradayActivity.js','lib/c1AccountLedger.js','lib/c1ApiErrors.js','lib/c1IntradayActivity.js','pages/api/c1-account.js','pages/index.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-recovery-form-mobile-seams.cjs').restore(file,require('./c1-stock-momentum-exit-seams.cjs').restore(file,fs.readFileSync(file,'utf8'))),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Exact reviewed issued-trade source: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Exact previous published source: '+file);
 assert.equal(inverse.restore(file,prior),prior,'The inverse is idempotent');
 const unknown=current+'\n// unrelated source cannot impersonate a published release\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy source normalization');
}
console.log('PASS: exact authorized retention source inverse, unchanged baseline identities, idempotence and rejection of unknown application source.');
