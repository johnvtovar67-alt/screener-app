const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-watch-download-cleanup-seams.cjs'),fixture=require('./fixtures/c1-watch-download-cleanup-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-watch-download-cleanup-source-inverse-v1');
assert.equal(fixture.baselineCommit,'5790522d58e487bd3cf0b3484c1dfad2af04f4db');
assert.equal(hash('tools/fixtures/c1-watch-download-cleanup-source-seams.json'),'35489d0c20a50c90930b040b46097bcc2d4550e6c3c9ac41385f32eb2483ad27');
assert.deepEqual(Object.keys(fixture.files),['components/C1AccountOpportunitiesView.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const source=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,source);
 assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior,'The historical inverse is idempotent');
 const unknown=source+'\n/* unreviewed source retains its own identity */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy restoration');
 assert.equal(require('./c1-stock-momentum-exit-seams.cjs').restore(file,unknown),unknown,'Common source chain cannot normalize unreviewed code');
}
for(const [file,pin]of [
 ['tools/fixtures/c1-watch-exposure-copy-source-seams.json','52fd053f023f426eb6cf34c30e4c81d43cc616c3f163358f38a67adc852d5fec'],
 ['tools/fixtures/portfolio-sector-label-source-seams.json','fb74dc6874cbbf6c73915b6e7bf2deab3482c816051bf7f63b0344e1bcca5ace'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Prior source and economic evidence stays immutable');
console.log('PASS: exact one-file diagnostic-control cleanup inverse, prior fixtures/pins retained, idempotence and unknown-source rejection.');
