const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const inverse=require('./c1-background-policy-seams.cjs');
const fixture=require('./fixtures/c1-background-policy-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-background-policy-source-inverse-v1');
assert.equal(fixture.baselineCommit,'adba79f987e89b63b7a85142b1356e4d2798ef53');
assert.equal(sha('tools/fixtures/c1-background-policy-source-seams.json'),
 '7683ea3ff2892bdae0676ecba73aef23ae095d5ad2f0c535c08e4037103257cc','The confirmed background-policy repair inverse is exact');
const pins={
 'lib/c1OpeningPlanComparison.js':'310a85984ab6b942b8cecbae6818dd9ce7e31805',
 'lib/c1OpeningPriceReview.js':'e025fb14e3d3333fef5db5d713faa800d3243244'
};
assert.deepEqual(Object.keys(fixture.files).sort(),Object.keys(pins).sort());
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),previous=inverse.restore(file,current);
 assert.equal(patch.beforeHash,pins[file],'Exact deployed diagnostic baseline retained: '+file);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed current source may enter its inverse: '+file);
 assert.equal(inverse.blob(previous),patch.beforeHash,'Exact diagnostic source recovered: '+file);
 assert.equal(inverse.restore(file,previous),previous,'The inverse is idempotent: '+file);
 const unknown=current+'\n// unreviewed source must not acquire a historical identity\n';
 assert.equal(inverse.restore(file,unknown),unknown,'Unknown source cannot enter the repair inverse: '+file);
 if(file==='lib/c1OpeningPlanComparison.js'){
  const marker='export function verifiedC1OpeningPlanComparison';
  assert.equal(current.split(marker)[1].split('\nconst clone=')[0],previous.split(marker)[1],
   'Original v3 comparison-proof validator body stays byte-identical');
 }else{
  assert.equal(inverse.blob(require('./c1-opening-diagnostic-seams.cjs').restore(file,current)),
   '034435a70c486727a56ec89271616e4d4f9ba568','The published diagnostic inverse still restores the original review pin');
  assert.equal(inverse.blob(require('./c1-opening-revision-inputs-seams.cjs').restoreReview(current)),
   '70dd0eda08a56c3fa7ae96dbe4e70f8b9811395b','Earlier input and financial source identities remain exact');
 }
}
for(const [file,pin]of [
 ['tools/fixtures/c1-opening-diagnostic-source-seams.json','135df473e4d560fc496ef9cd9ef80b58aee581684ad9d833238d980aae2f7cf4'],
 ['tools/fixtures/c1-recorder-ownership-source-seams.json','1550b935b2fe8e685a8a75792dd80acf8aa8c08b86875a44322c716bbe720615'],
 ['tools/fixtures/c1-canonical-timing-source-seams.json','ad0aa103c64b94765caa28bc093efea2e962c6734a1c3f23f071849988ef5c23'],
 ['tools/fixtures/c1-current-blocker-source-seams.json','97f5c8952890371eada38c1ba8b7e19966a857faf269e811faff7ffefe551bdc'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(sha(file),pin,'Previously published source/economic oracle evidence is immutable: '+file);
console.log('PASS: two exact background-policy inverses, original v3 validator and all earlier source/economic proof pins preserved.');
