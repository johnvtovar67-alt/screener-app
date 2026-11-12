const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const inverse=require('./c1-canonical-timing-seams.cjs');
const fixture=require('./fixtures/c1-canonical-timing-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-canonical-timing-source-inverse-v1');
assert.equal(fixture.baselineCommit,'5156411fff17145c1417c60a9fe1efedc60e39cd');
assert.equal(sha('tools/fixtures/c1-canonical-timing-source-seams.json'),'ad0aa103c64b94765caa28bc093efea2e962c6734a1c3f23f071849988ef5c23',
 'The separately reviewed accepted-timing inverse is pinned exactly');
assert.equal(sha('tools/fixtures/c1-current-blocker-source-seams.json'),
 '97f5c8952890371eada38c1ba8b7e19966a857faf269e811faff7ffefe551bdc',
 'The previously published current-blocker inverse is immutable');
const released={
 'lib/c1ScreenProducer.js':'c94eb0cf937b73f7024d0c1c3e725fb37f4e6f0b',
 'lib/c1StockClassification.js':'8257c1e02d0c363fba9e3fe3ff9076ffc051df92'
};
assert.deepEqual(Object.keys(fixture.files).sort(),Object.keys(released).sort());
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),previous=inverse.restore(file,current);
 assert.equal(patch.beforeHash,released[file],'The released source identity is unchanged: '+file);
 assert.equal(inverse.blob(current),patch.afterHash,'Only exact reviewed source may enter the inverse');
 assert.equal(inverse.blob(previous),patch.beforeHash,'The released producer source is restored exactly');
 assert.notEqual(patch.afterHash,patch.beforeHash,'The inverse contains only changed source');
 assert.equal(inverse.restore(file,previous),previous,'The inverse is idempotent');
 const unknown=current+'\n// unreviewed source cannot gain a historical identity\n';
 assert.equal(inverse.restore(file,unknown),unknown,'Unknown producer source cannot enter the inverse');
 assert.equal(require('./c1-current-blocker-seams.cjs').restore(file,unknown),unknown,
  'The composed restoration chain rejects unknown producer source');
}
assert.equal(inverse.blob(require('./c1-screen-production-extraction.cjs').readLegacyTop5Source()),
 'a882b44c0e009828068ada3efb3af97fdf45e3d4',
 'The complete earlier route retains its independent source oracle after exact follow-up reversal');
console.log('PASS: exact accepted-timing producer inverse, immutable prior repair fixture, complete route source oracle, idempotence and unknown-source rejection.');
