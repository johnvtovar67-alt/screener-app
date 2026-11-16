const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const inverse=require('./c1-completed-add-target-seams.cjs');
const fixture=require('./fixtures/c1-completed-add-target-source-seams.json');
const policy=require('./c1-account-policy-seams.cjs'),v2=require('./fixtures/c1-account-policy-source-seams.json');
const hash=source=>createHash('sha256').update(source).digest('hex');
assert.equal(fixture.contract,'c1-completed-add-target-source-inverse-v1');
assert.equal(fixture.baselineCommit,'6c71f5ca809b301fe49751b6abab4592124b66f0');
assert.deepEqual(Object.keys(fixture.files),['lib/c1RecentMomentumChallengerSimulator.js','tools/generate-c1-recent-momentum-challenger.cjs']);
for(const [file,pin]of [
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299'],
 ['tools/fixtures/c1-account-policy-replay-repair-source-seams.json','b74013454d5216c290bf36ef63872c14f197ae9df47aae690315a846477860de']
])assert.equal(hash(fs.readFileSync(file)),pin,'The published source fixture remains immutable: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),released=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash,'Exact reviewed target-preservation source: '+file);
 assert.equal(inverse.blob(released),patch.beforeHash,'Exact preceding deployed source: '+file);
 assert.equal(policy.blob(policy.restore(file,current)),v2.files[file].beforeHash,'All earlier account-policy source identities remain exact: '+file);
 assert.equal(inverse.restore(file,released),released,'Inverse is idempotent: '+file);
 const unknown=current+'\n// Unreviewed source cannot acquire an old identity\n';
 assert.equal(inverse.restore(file,unknown),unknown);assert.equal(policy.restore(file,unknown),unknown);
 const historic=require('./c1-initial-swing-stop-seams.cjs').restoreInitialSwingStopPolicy(current,file);
 assert.equal(hash(historic),file.startsWith('lib/')?'ca08f31539bb4e306251dd11ada2ae204af78d850c23644ffa617b752923d905':'2644c7df6e2d92be174dfde242c0619f7fb2d3f3ab6060586161cd041ec02680','The previously published simulator/generator hash is unchanged');
}
const generated=spawnSync(process.execPath,['tools/generate-c1-recent-momentum-challenger.cjs','--check'],{encoding:'utf8'});
assert.equal(generated.status,0,generated.stdout+generated.stderr);
console.log('PASS: exact accounting-target inverse and generator reproduction; all published simulator, generator, policy and replay oracle pins preserved.');
