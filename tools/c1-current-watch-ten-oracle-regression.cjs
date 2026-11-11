const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const watch=require('./c1-current-watch-ten-seams.cjs');
const policy=require('./c1-account-policy-seams.cjs');
const fixture=require('./fixtures/c1-current-watch-ten-source-seams.json');
const v2=require('./fixtures/c1-account-policy-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-current-watch-ten-source-inverse-v1');
assert.equal(fixture.baselineCommit,'5fbbbd9412e9b01d7f2d2deea2f926c8600f9e4a');
assert.equal(sha('tools/fixtures/c1-account-policy-source-seams.json'),
 '87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299','The released v2 oracle fixture is unchanged');
assert.equal(sha('tools/fixtures/c1-account-policy-replay-repair-source-seams.json'),
 'b74013454d5216c290bf36ef63872c14f197ae9df47aae690315a846477860de','The released activation-replay oracle fixture is unchanged');
assert.deepEqual(Object.keys(fixture.files).sort(),[
 'components/C1AccountOpportunitiesView.js','lib/c1OpportunitiesProjection.js','lib/c1StockClassification.js'
]);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),released=watch.restore(file,current);
 assert.equal(watch.blob(current),patch.afterHash,'Exact reviewed current Watch display source: '+file);
 assert.equal(watch.blob(released),patch.beforeHash,'Exact released display source recovered: '+file);
 assert.equal(patch.beforeHash,v2.files[file].afterHash,'Existing v2 source pin is retained: '+file);
 assert.equal(policy.blob(policy.restore(file,current)),v2.files[file].beforeHash,'All prior source and economic oracle identities remain exact: '+file);
 assert.equal(watch.restore(file,released),released,'The display inverse is idempotent: '+file);
 const unknown=current+'\n// unknown changes must not acquire historical source identity\n';
 assert.equal(watch.restore(file,unknown),unknown,'The display inverse cannot normalize unreviewed changes: '+file);
 assert.equal(policy.restore(file,unknown),unknown,'The composed inverse cannot impersonate an older source: '+file);
}
console.log('PASS: three exact current Watch display inverses; both published oracle fixtures and every earlier source identity retained.');
