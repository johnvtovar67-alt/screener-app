const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const inverse=require('./c1-opening-diagnostic-seams.cjs');
const fixture=require('./fixtures/c1-opening-diagnostic-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-opening-diagnostic-source-inverse-v1');
assert.equal(fixture.baselineCommit,'1450e5a375dc9e75e74df4b6d27213d736830eae');
assert.equal(sha('tools/fixtures/c1-opening-diagnostic-source-seams.json'),
 '135df473e4d560fc496ef9cd9ef80b58aee581684ad9d833238d980aae2f7cf4','The diagnostic-only source inverse is pinned exactly');
assert.deepEqual(Object.keys(fixture.files),['lib/c1OpeningPriceReview.js']);
const file='lib/c1OpeningPriceReview.js',patch=fixture.files[file],current=fs.readFileSync(file,'utf8'),previous=inverse.restore(file,current);
assert.equal(patch.beforeHash,'034435a70c486727a56ec89271616e4d4f9ba568','The prior released review source remains the baseline');
assert.equal(inverse.blob(current),patch.afterHash,'Only exact reviewed diagnostic source may enter its inverse');
assert.equal(inverse.blob(previous),patch.beforeHash,'The prior review source is restored exactly');
assert.notEqual(patch.afterHash,patch.beforeHash);
assert.equal(inverse.restore(file,previous),previous,'The inverse is idempotent');
const inputs=require('./c1-opening-revision-inputs-seams.cjs');
assert.equal(inverse.blob(inputs.restoreReview(current)),'70dd0eda08a56c3fa7ae96dbe4e70f8b9811395b','Direct input-parity normalization retains its prior source pin');
assert.equal(inverse.blob(inputs.restoreCurrent(file,current)),'70dd0eda08a56c3fa7ae96dbe4e70f8b9811395b','Composed input-parity normalization retains its prior source pin');
const prefix=source=>source.slice(0,source.indexOf('// Explain only the first difference'))
 .replace(',atOpen.revised,{protectedSymbols}',',atOpen.revised')
 .replace(',atCurrent.revised,{protectedSymbols}',',atCurrent.revised');
assert.equal(prefix(current),prefix(previous),'Planning, acceptance conditions and v2/v3 receipt generation are byte-identical apart from rejection diagnostic arguments');
const suffix=source=>source.slice(source.indexOf('// Shared immutable correction overlay'));
assert.equal(suffix(current),suffix(previous),'Source overlays and every accepted receipt validator remain byte-identical');
const unknown=current+'\n// unreviewed source cannot gain a historical review identity\n';
assert.equal(inverse.restore(file,unknown),unknown,'The diagnostic inverse rejects unknown source');
assert.equal(inputs.restoreCurrent(file,unknown),unknown,'The composed inverse rejects unknown source');
for(const [name,pin]of [
 ['tools/fixtures/c1-recorder-ownership-source-seams.json','1550b935b2fe8e685a8a75792dd80acf8aa8c08b86875a44322c716bbe720615'],
 ['tools/fixtures/c1-canonical-timing-source-seams.json','ad0aa103c64b94765caa28bc093efea2e962c6734a1c3f23f071849988ef5c23'],
 ['tools/fixtures/c1-current-blocker-source-seams.json','97f5c8952890371eada38c1ba8b7e19966a857faf269e811faff7ffefe551bdc'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(sha(name),pin,'Previously published source and economic oracle fixtures stay immutable: '+name);
console.log('PASS: exact diagnostic-only opening review inverse; unchanged acceptance/proofs/overlay/validators and all prior fixture pins.');
