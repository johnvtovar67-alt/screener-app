const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-financial-history-replay-seams.cjs'),fixture=require('./fixtures/c1-financial-history-replay-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-financial-history-replay-source-inverse-v1');
assert.equal(fixture.baselineCommit,'b399563ebb1eb9e38d824715ee641f834d9e03be');
assert.equal(sha('tools/fixtures/c1-financial-history-replay-source-seams.json'),'97b69bb4b3a7e39ec62e2070def712e989adfce2c0e1652c490ffd812288fcdf');
assert.deepEqual(Object.keys(fixture.files),["lib/c1ActualFillReplay.js","lib/c1CashFlowReplay.js","lib/c1RecentMomentumChallengerSimulator.js","tools/generate-c1-recent-momentum-challenger.cjs"]);
assert.equal(Object.keys(fixture.preservedFixtures).length,89,'Every published fixture is retained');
assert.equal(sha('lib/c1AccountSimulator.js'),'f03619319ea43465d2625e24866b70fffd811a8f1bfeccfa2582d7b49b6b9bd9','Published canonical account engine stays byte-identical');
assert.equal(sha('tools/generate-c1-account-simulator.cjs'),'0ec09e5cbf339ca5407683c527c655cd59625af424f3ce5d9edf28b3dd3a5728','Canonical generator stays byte-identical');
for(const [file,pin]of Object.entries(fixture.preservedFixtures))assert.equal(sha(file),pin,'Published source/economic fixture remains immutable: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-validated-income-continuation-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed source enters inverse: '+file);
 assert.equal(inverse.blob(prior),patch.beforeHash,'Published release source recovered: '+file);
 assert.equal(inverse.restore(file,prior),prior,'Exact inverse is idempotent: '+file);
 const unknown=current+'\n/* Unreviewed source keeps its own identity. */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy normalization: '+file);
 assert.equal(require('./c1-approved-repair-diagnostics-seams.cjs').restore(file,unknown),unknown,'Diagnostics chain rejects unknown source: '+file);
 assert.equal(require('./c1-cash-authority-seams.cjs').restore(file,unknown),unknown,'Older chain rejects unknown source: '+file);
}
console.log('PASS: exact financial-history replay inverse, all89 published fixture bytes retained, canonical engine unchanged, strict identities/idempotence/unknown-source rejection.');
