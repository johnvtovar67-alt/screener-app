const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-stock-momentum-exit-seams.cjs'),fixture=require('./fixtures/c1-stock-momentum-exit-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-stock-momentum-exit-source-inverse-v1');
assert.equal(fixture.baselineCommit,'da4e430ab6d0fc8bdd19927a488947be7d5498bb');
assert.equal(hash('tools/fixtures/c1-stock-momentum-exit-source-seams.json'),'f22de344ef352b1b1c7ec059acb8526bfad7fc69a4539584fe1ff549398c8fa8');
assert.equal(hash('lib/c1StockMomentumExit.js'),'38eb4498fc3d462af6d766769b0ec3fef668b7d3b0debb044b673aacfd7a5bd5');
assert.deepEqual(Object.keys(fixture.files),['lib/c1AccountExecutionView.js','lib/c1AccountPolicy.js','lib/c1AccountProjection.js','lib/c1AccountService.js','lib/c1CompletedAddRecovery.js','lib/c1DecisionCopy.js','lib/c1IntradayActivity.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const source=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,source);
 assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior);
 const unknown=source+'\n/* unrelated changes cannot impersonate historical source */\n';assert.equal(inverse.restore(file,unknown),unknown);
}
for(const [file,pin]of [
 ['tools/fixtures/c1-issued-trade-retention-source-seams.json','20efabb85136c4979ed44bf748466c4a6a795ff0576920518f13b0c27f80ba5e'],
 ['tools/fixtures/c1-opening-copy-source-seams.json','b2051e25b1c61e4c0d3f58f2c7bd93a4a92f7bdcbbf00a0f487e6194a82794fe'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Published source/economic evidence remains unchanged');
console.log('PASS: exact prospective stock-momentum source inverse, immutable published fixtures, pinned new module, idempotence and unknown-source rejection.');
