const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const inverse=require('./c1-recorder-ownership-seams.cjs');
const fixture=require('./fixtures/c1-recorder-ownership-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-recorder-ownership-source-inverse-v1');
assert.equal(fixture.baselineCommit,'fa4acd5f17d16a339aeb5eca044887ee07893715');
assert.equal(sha('tools/fixtures/c1-recorder-ownership-source-seams.json'),'1550b935b2fe8e685a8a75792dd80acf8aa8c08b86875a44322c716bbe720615',
 'The exact reviewed recorder display inverse is pinned independently');
assert.deepEqual(Object.keys(fixture.files),['components/C1AccountActivity.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),previous=inverse.restore(file,current);
 assert.equal(patch.beforeHash,'0d11f88948960c6b45f7ac7656aad498ae180d25','The prior published recorder source identity is unchanged');
 assert.equal(inverse.blob(current),patch.afterHash,'Only exact reviewed recorder source may enter its inverse');
 assert.equal(inverse.blob(previous),patch.beforeHash,'The prior recorder source is restored exactly');
 assert.notEqual(patch.afterHash,patch.beforeHash,'Only changed recorder source belongs in the inverse');
 assert.equal(inverse.restore(file,previous),previous,'The display inverse is idempotent');
 assert.equal(inverse.blob(require('./c1-pending-session-ui-seams.cjs').restore(file,current)),patch.beforeHash,
  'The recorder repair reverses before earlier pending-session source normalization');
 const unknown=current+'\n// unknown source cannot gain a historical recorder identity\n';
 assert.equal(inverse.restore(file,unknown),unknown,'The display inverse rejects unknown source');
 assert.equal(require('./c1-pending-session-ui-seams.cjs').restore(file,unknown),unknown,
  'The composed pending-session inverse rejects unknown source');
}
for(const [file,pin]of [
 ['tools/fixtures/c1-pending-session-ui-source-seam.json','ef2598c7e1ebd4b205d992209718128b591ae2a72a625eaff775e48bf69f474c'],
 ['tools/fixtures/c1-current-blocker-source-seams.json','97f5c8952890371eada38c1ba8b7e19966a857faf269e811faff7ffefe551bdc'],
 ['tools/fixtures/c1-canonical-timing-source-seams.json','ad0aa103c64b94765caa28bc093efea2e962c6734a1c3f23f071849988ef5c23'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(sha(file),pin,'Published source and economic oracle evidence stays immutable: '+file);
console.log('PASS: exact ownership-only recorder display inverse, immutable prior fixtures and source pins, idempotence and unknown-source rejection.');
