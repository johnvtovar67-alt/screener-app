const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const inverse=require('./c1-current-blocker-seams.cjs');
const fixture=require('./fixtures/c1-current-blocker-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-current-blocker-source-inverse-v1');
assert.equal(fixture.baselineCommit,'b9f2182b7716525bfef58f3fd4cd43b716506ff7');
assert.equal(sha('tools/fixtures/c1-current-blocker-source-seams.json'),'97f5c8952890371eada38c1ba8b7e19966a857faf269e811faff7ffefe551bdc',
 'The reviewed current-evidence inverse fixture is pinned exactly');
const prior={
 'lib/c1CurrentWatchSelection.js':'bb913df72a95c0d33bc63304f6d20e1cfbea61f3',
 'lib/c1OpportunitiesProjection.js':'5108c2fa76ade0a03a43b67bb2cf4d30d4294a90',
 'lib/c1StockClassification.js':'770d0b409099cee80c4bbc694267c32c25c2ae59',
 'lib/replayDatasetCompaction.js':'4c0fb6f017276c3563e69fb83658a8f6f3820df1'
};
assert.deepEqual(Object.keys(fixture.files).sort(),Object.keys(prior).sort());
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-canonical-timing-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),previous=inverse.restore(file,current);
 assert.equal(patch.beforeHash,prior[file],'The exact current-production baseline is retained: '+file);
 assert.equal(inverse.blob(current),patch.afterHash,'Only reviewed source can enter this inverse: '+file);
 assert.equal(inverse.blob(previous),patch.beforeHash,'The released source is restored exactly: '+file);
 assert.notEqual(patch.afterHash,patch.beforeHash,'Only changed source belongs in the inverse');
 assert.equal(inverse.restore(file,previous),previous,'The exact inverse is idempotent: '+file);
 const unknown=current+'\n// unreviewed code cannot gain a historical source identity\n';
 assert.equal(inverse.restore(file,unknown),unknown,'The repair inverse never normalizes unknown source: '+file);
}
for(const [file,pin]of [
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299'],
 ['tools/fixtures/c1-account-policy-replay-repair-source-seams.json','b74013454d5216c290bf36ef63872c14f197ae9df47aae690315a846477860de'],
 ['tools/fixtures/c1-current-watch-ten-source-seams.json','b9427d0aa82d77cfc433b14ed9dc0c59ea1238161a59682962d070fd0a2f9ab9'],
 ['tools/fixtures/c1-watch-monitoring-source-seams.json','a66be0201c92787016475727590517dbce8ea3bd9f05986d36e82313c9d75cbe'],
 ['tools/fixtures/c1-watch-wait-priority-source-seams.json','46d34f1c5052ac780c7f16e0d64a9b806c0cd316ee234e95d844e2cc345812cb']
])assert.equal(sha(file),pin,'A previously published oracle fixture stays immutable: '+file);
console.log('PASS: four exact current-evidence/blocker inverses, immutable prior source/economic fixtures, idempotence and unknown-source rejection.');
