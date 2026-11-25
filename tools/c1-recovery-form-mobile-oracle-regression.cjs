const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-recovery-form-mobile-seams.cjs'),fixture=require('./fixtures/c1-recovery-form-mobile-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-recovery-form-mobile-source-inverse-v1');
assert.equal(fixture.baselineCommit,'91e40eb69d10ffba6be330c38da864e4fd0046ba');
assert.equal(hash('tools/fixtures/c1-recovery-form-mobile-source-seams.json'),'ae56fdbd35f585f832afe20537db9fbe720fcc428391ede247c40cd608e91267');
assert.equal(hash('tools/fixtures/c1-issued-trade-retention-source-seams.json'),'20efabb85136c4979ed44bf748466c4a6a795ff0576920518f13b0c27f80ba5e','The published retention source evidence remains unchanged');
assert.deepEqual(Object.keys(fixture.files),['components/C1IntradayActivity.js','styles/card-layout.css']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-planned-sale-attribution-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior);
 const unknown=current+'\n/* unrelated changes must not gain historical identity */\n';
 assert.equal(inverse.restore(file,unknown),unknown);
}
console.log('PASS: exact two-file mobile presentation inverse; published recorder evidence, prior identities and unknown-source rejection preserved.');
