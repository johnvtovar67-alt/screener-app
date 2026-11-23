const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-watch-exposure-copy-seams.cjs'),fixture=require('./fixtures/c1-watch-exposure-copy-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-watch-exposure-copy-source-inverse-v1');
assert.equal(fixture.baselineCommit,'42e6917d19d3d7a2aa4c6a4d56491e3c3f141c4b');
assert.equal(hash('tools/fixtures/c1-watch-exposure-copy-source-seams.json'),'52fd053f023f426eb6cf34c30e4c81d43cc616c3f163358f38a67adc852d5fec');
assert.deepEqual(Object.keys(fixture.files),['components/C1AccountOpportunitiesView.js','lib/c1CurrentWatchSelection.js','lib/c1WatchDetails.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const source=require('./c1-watch-download-cleanup-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,source);
 assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior,'Exact inverse is idempotent');
 const unknown=source+'\n/* unreviewed source retains its own identity */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy normalization');
 assert.equal(require('./c1-stock-momentum-exit-seams.cjs').restore(file,unknown),unknown,'Common chain rejects unknown source');
 assert.equal(require('./c1-current-blocker-seams.cjs').restore(file,unknown),unknown,'Watch chain rejects unknown source');
}
for(const [file,pin]of [
 ['tools/fixtures/portfolio-sector-label-source-seams.json','fb74dc6874cbbf6c73915b6e7bf2deab3482c816051bf7f63b0344e1bcca5ace'],
 ['tools/fixtures/c1-sell-quantity-summary-source-seams.json','c6bb8f8c572f2197a02e321111e45f5f7f3e430cdfe619016ed4212fb75d37df'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Previously published evidence remains immutable');
console.log('PASS: exact three-file Watch presentation inverse; old fixtures/pins retained, idempotence and unknown-source rejection.');
