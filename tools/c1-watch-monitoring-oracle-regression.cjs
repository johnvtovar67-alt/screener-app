const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const monitoring=require('./c1-watch-monitoring-seams.cjs');
const waitPriority=require('./c1-watch-wait-priority-seams.cjs');
const policy=require('./c1-account-policy-seams.cjs');
const fixture=require('./fixtures/c1-watch-monitoring-source-seams.json');
const priorityFixture=require('./fixtures/c1-watch-wait-priority-source-seams.json');
const previousWatch=require('./fixtures/c1-current-watch-ten-source-seams.json');
const v2=require('./fixtures/c1-account-policy-source-seams.json');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'c1-watch-monitoring-source-inverse-v1');
assert.equal(fixture.baselineCommit,'9f3b03cfc0ca7146facec94e2ab51b285f92a6f2');
for(const [file,pin]of [
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299'],
 ['tools/fixtures/c1-account-policy-replay-repair-source-seams.json','b74013454d5216c290bf36ef63872c14f197ae9df47aae690315a846477860de'],
 ['tools/fixtures/c1-current-watch-ten-source-seams.json','b9427d0aa82d77cfc433b14ed9dc0c59ea1238161a59682962d070fd0a2f9ab9'],
 ['tools/fixtures/c1-watch-wait-priority-source-seams.json','46d34f1c5052ac780c7f16e0d64a9b806c0cd316ee234e95d844e2cc345812cb']
])assert.equal(sha(file),pin,'An exact source inverse fixture is immutable: '+file);
assert.deepEqual(Object.keys(fixture.files).sort(),[
 'components/C1AccountOpportunitiesView.js','lib/c1CurrentWatchSelection.js','lib/c1OpportunitiesProjection.js','lib/c1StockClassification.js'
]);
assert.equal(priorityFixture.contract,'c1-watch-wait-priority-source-inverse-v1');
assert.deepEqual(Object.keys(priorityFixture.files),['lib/c1CurrentWatchSelection.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),reviewed=waitPriority.restore(file,current),released=monitoring.restore(file,reviewed);
 if(priorityFixture.files[file]){
  const priority=priorityFixture.files[file];
  assert.equal(waitPriority.blob(current),priority.afterHash,'Exact reviewed Watch blocker-priority source: '+file);
  assert.equal(waitPriority.blob(reviewed),priority.beforeHash,'Exact consistent-WAIT source recovered: '+file);
  assert.equal(waitPriority.restore(file,reviewed),reviewed,'The blocker-priority inverse is idempotent: '+file);
 }
 assert.equal(monitoring.blob(require('./c1-watch-numbering-seams.cjs').restore(file,reviewed)),patch.afterHash,'Exact reviewed monitoring-only Watch source: '+file);
 assert.equal(monitoring.blob(released),patch.beforeHash,'Exact released pre-correction Watch source recovered: '+file);
 if(previousWatch.files[file])assert.equal(patch.beforeHash,previousWatch.files[file].afterHash,'Prior Watch source pin is unchanged: '+file);
 else assert.equal(patch.beforeHash,'894fea6f2be9af95283c1bf49482f456bd5cc95d','The released standalone Watch selector is pinned exactly');
 assert.equal(policy.blob(policy.restore(file,reviewed)),v2.files[file]?.beforeHash??patch.beforeHash,'The full historical oracle chain remains exact: '+file);
 assert.equal(monitoring.restore(file,released),released,'The monitoring inverse is idempotent: '+file);
 const unknown=current+'\n// unreviewed code cannot gain a historical source identity\n';
 assert.equal(waitPriority.restore(file,unknown),unknown,'No fuzzy blocker-priority inverse: '+file);
 assert.equal(monitoring.restore(file,unknown),unknown,'No fuzzy monitoring inverse: '+file);
 assert.equal(policy.restore(file,unknown),unknown,'The composed chain cannot normalize unknown source: '+file);
}
console.log('PASS: four exact monitoring Watch inverses; all three published oracle fixtures and prior source/economic identities unchanged.');
