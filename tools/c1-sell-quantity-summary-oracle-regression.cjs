const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-sell-quantity-summary-seams.cjs'),fixture=require('./fixtures/c1-sell-quantity-summary-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-sell-quantity-summary-source-inverse-v1');
assert.equal(fixture.baselineCommit,'e17ac1e0d27f12852e874523fcbce6789b5dfc80');
assert.equal(hash('tools/fixtures/c1-sell-quantity-summary-source-seams.json'),'c6bb8f8c572f2197a02e321111e45f5f7f3e430cdfe619016ed4212fb75d37df');
assert.deepEqual(Object.keys(fixture.files),['components/C1AccountOpportunitiesView.js','lib/c1PositionPresentation.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const source=require('./c1-watch-exposure-copy-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,source);
 assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior);
 const unknown=source+'\n/* unreviewed source must retain its own identity */\n';assert.equal(inverse.restore(file,unknown),unknown);
}
for(const [file,pin]of [
 ['tools/fixtures/c1-stock-momentum-exit-source-seams.json','f22de344ef352b1b1c7ec059acb8526bfad7fc69a4539584fe1ff549398c8fa8'],
 ['tools/fixtures/c1-opening-copy-source-seams.json','b2051e25b1c61e4c0d3f58f2c7bd93a4a92f7bdcbbf00a0f487e6194a82794fe'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Published policy/source evidence remains unchanged');
console.log('PASS: exact two-file Sell-summary presentation inverse, immutable published policy fixtures, idempotence and unknown-source rejection.');
