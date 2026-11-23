const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-watch-entry-blocker-seams.cjs'),fixture=require('./fixtures/c1-watch-entry-blocker-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-watch-entry-blocker-source-inverse-v1');
assert.equal(fixture.baselineCommit,'5ff4ff3ff0e6e1552ccd39fa7d8ffe489b07918f');
assert.equal(hash('tools/fixtures/c1-watch-entry-blocker-source-seams.json'),'24cd96b25f3232a7a769c4064fed04538e9f13697557f4669624bf98af7c1c61');
assert.deepEqual(Object.keys(fixture.files),['lib/c1CurrentWatchSelection.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const source=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,source);
 assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior,'Historical inverse is idempotent');
 const unknown=source+'\n/* Unreviewed source keeps its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy restoration');
 assert.equal(require('./c1-watch-exposure-copy-seams.cjs').restore(file,unknown),unknown,'Prior source chain rejects unknown code');
}
for(const [file,pin]of [
 ['tools/fixtures/c1-watch-download-cleanup-source-seams.json','35489d0c20a50c90930b040b46097bcc2d4550e6c3c9ac41385f32eb2483ad27'],
 ['tools/fixtures/c1-watch-exposure-copy-source-seams.json','52fd053f023f426eb6cf34c30e4c81d43cc616c3f163358f38a67adc852d5fec'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Prior source and economic evidence stays immutable');
console.log('PASS: exact one-file Watch entry-blocker inverse, prior fixtures and pins retained, idempotence and unknown-source rejection.');
