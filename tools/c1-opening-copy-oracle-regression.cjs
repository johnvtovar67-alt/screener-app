const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./c1-opening-copy-seams.cjs'),fixture=require('./fixtures/c1-opening-copy-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-opening-copy-source-inverse-v1');
assert.equal(fixture.baselineCommit,'adba79f987e89b63b7a85142b1356e4d2798ef53');
assert.equal(sha('tools/fixtures/c1-opening-copy-source-seams.json'),'b2051e25b1c61e4c0d3f58f2c7bd93a4a92f7bdcbbf00a0f487e6194a82794fe','The copy-only inverse is pinned exactly');
assert.deepEqual(Object.keys(fixture.files),['lib/c1DecisionCopy.js','components/C1AccountOpportunitiesView.js']);
const file='lib/c1DecisionCopy.js',source=fs.readFileSync(file,'utf8'),patch=fixture.files[file],before=inverse.restore(file,source);
assert.equal(patch.beforeHash,'41ce498f6252cd6389fa31a11a1559e54e88acd4');
assert.equal(inverse.blob(source),patch.afterHash);assert.equal(inverse.blob(before),patch.beforeHash);assert.notEqual(source,before);
assert.equal(inverse.restore(file,before),before,'The exact inverse is idempotent');
const unknown=source+'\n// Unreviewed explanation source must retain its own identity.\n';assert.equal(inverse.restore(file,unknown),unknown);
const view='components/C1AccountOpportunitiesView.js',viewSource=fs.readFileSync(view,'utf8'),oldView=inverse.restore(view,viewSource);
assert.equal(inverse.blob(oldView),'a75a15f74616e30c5ce5636f80f6eaefcb453a9f');
assert.equal(inverse.blob(viewSource),fixture.files[view].afterHash);assert.notEqual(viewSource,oldView);
assert.equal(inverse.restore(view,viewSource+'\n// unknown view\n'),viewSource+'\n// unknown view\n');
const unchanged=source=>source.slice(source.indexOf('export function c1DecisionTrigger'));
assert.equal(unchanged(source),unchanged(before),'Triggers, momentum evidence and holding timing retain exact released source');
for(const [name,pin]of [
 ['tools/fixtures/c1-opening-diagnostic-source-seams.json','135df473e4d560fc496ef9cd9ef80b58aee581684ad9d833238d980aae2f7cf4'],
 ['tools/fixtures/c1-recorder-ownership-source-seams.json','1550b935b2fe8e685a8a75792dd80acf8aa8c08b86875a44322c716bbe720615'],
 ['tools/fixtures/c1-canonical-timing-source-seams.json','ad0aa103c64b94765caa28bc093efea2e962c6734a1c3f23f071849988ef5c23'],
 ['tools/fixtures/c1-current-blocker-source-seams.json','97f5c8952890371eada38c1ba8b7e19966a857faf269e811faff7ffefe551bdc'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299'],
])assert.equal(sha(name),pin,'Published source/economic fixtures remain immutable');
console.log('PASS: exact copy-only source inverse; unchanged trigger/holding helpers; unknown source not normalized; all published source and economic oracle fixtures remain pinned.');
