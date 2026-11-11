const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const repair=require('./c1-account-policy-replay-repair-seams.cjs');
const original=require('./c1-account-policy-seams.cjs');
const fixture=require('./fixtures/c1-account-policy-replay-repair-source-seams.json');
const v2Filename='tools/fixtures/c1-account-policy-source-seams.json';
const v2=require('./fixtures/c1-account-policy-source-seams.json');
assert.equal(fixture.contract,'c1-account-policy-replay-repair-source-inverse-v1');
assert.equal(fixture.baselineCommit,'f2531391c661ab47bb032ebcdfcc9868d20a0db4');
assert.equal(createHash('sha256').update(fs.readFileSync(v2Filename)).digest('hex'),
 '87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299',
 'The complete released v2 source-inverse fixture is immutable');
assert.deepEqual(Object.keys(fixture.files).sort(),[
 'lib/c1RecentMomentumChallengerSimulator.js',
 'tools/generate-c1-recent-momentum-challenger.cjs'
]);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8');
 assert.equal(repair.blob(current),patch.afterHash,'Exact reviewed replay repair source: '+file);
 const released=repair.restore(file,current);
 assert.equal(repair.blob(released),patch.beforeHash,'Exact production v2 source recovered: '+file);
 assert.equal(patch.beforeHash,v2.files[file].afterHash,'Earlier released v2 source pin remains unchanged: '+file);
 assert.equal(original.blob(original.restore(file,current)),v2.files[file].beforeHash,'All pre-v2 oracle pins remain exact: '+file);
 assert.equal(repair.restore(file,released),released,'Released source is not inverted twice: '+file);
 const unreviewed=current+'\n// unreviewed source must not gain historical identity\n';
 assert.equal(repair.restore(file,unreviewed),unreviewed,'No fuzzy repair inverse: '+file);
 assert.equal(original.restore(file,unreviewed),unreviewed,'Unknown sources cannot impersonate either historical layer: '+file);
}
console.log('PASS: two exact activation-replay source gates; released v2 fixture and all older source/economic oracle identities retained.');
