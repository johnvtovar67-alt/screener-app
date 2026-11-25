const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-planned-sale-attribution-seams.cjs'),fixture=require('./fixtures/c1-planned-sale-attribution-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-planned-sale-attribution-source-inverse-v1');
assert.equal(fixture.baselineCommit,'a3d7e614888289d82962556d85bf7507f1fe6064');
assert.equal(hash('tools/fixtures/c1-planned-sale-attribution-source-seams.json'),'8862e81589a4857110f9caf917044a5e3a6dc7998f63ebfedb7bd105569862b7');
assert.deepEqual(Object.keys(fixture.files),["components/C1IntradayActivity.js","lib/c1ApiErrors.js","lib/c1IntradayActivity.js","lib/c1SaleAttributionRecovery.js","pages/api/c1-account.js","pages/index.js"]);
for(const [file,patch]of Object.entries(fixture.files)){
 const source=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,source);
 assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior,'Exact inverse is idempotent');
 const unknown=source+'\n/* Unreviewed source retains its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy restoration');
 assert.equal(require('./c1-stock-momentum-exit-seams.cjs').restore(file,unknown),unknown,'Historical chain rejects unknown code');
}
for(const [file,pin]of [
 ['tools/fixtures/c1-stock-momentum-exit-source-seams.json','f22de344ef352b1b1c7ec059acb8526bfad7fc69a4539584fe1ff549398c8fa8'],
 ['tools/fixtures/c1-issued-trade-retention-source-seams.json','20efabb85136c4979ed44bf748466c4a6a795ff0576920518f13b0c27f80ba5e'],
 ['tools/fixtures/c1-recovery-form-mobile-source-seams.json','ae56fdbd35f585f832afe20537db9fbe720fcc428391ede247c40cd608e91267'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Prior source and economic evidence stays immutable');
console.log('PASS: exact sale-attribution inverse, preserved prior fixtures and pins, idempotence and unknown-source rejection.');
