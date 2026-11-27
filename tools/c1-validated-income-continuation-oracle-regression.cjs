const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
const inverse=require('./c1-validated-income-continuation-seams.cjs');
const filename='tools/fixtures/c1-validated-income-continuation-source-seams.json',bytes=fs.readFileSync(filename),fixture=JSON.parse(bytes);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(fixture.contract,'c1-validated-income-continuation-source-inverse-v1');
assert.equal(fixture.baselineCommit,'13025b236606772368da0cfa5c5ad11ad38b8321');
assert.equal(sha(bytes),'2ac2b77180a281e99ce436b3bf0b88cedc1bddbdf486e29443c43fe5afe72c87');
assert.deepEqual(Object.keys(fixture.files),['lib/c1BrokerStatementReview.js','lib/c1OperationalRiskEpoch.js','lib/c1RecentMomentumChallengerSimulator.js','tools/generate-c1-recent-momentum-challenger.cjs']);
assert.equal(Object.keys(fixture.preservedFixtures).length,97);
for(const [file,pin]of Object.entries(fixture.preservedFixtures))assert.equal(sha(fs.readFileSync(file)),pin,'Published fixture unchanged: '+file);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior);
 const unknown=current+'\n// unreviewed source\n';assert.equal(inverse.restore(file,unknown),unknown);
 assert.equal(require('./c1-bounded-screen-continuation-seams.cjs').restore(file,unknown),unknown);
}
for(const [file,pin]of Object.entries({
 'lib/c1AccountSimulator.js':'f03619319ea43465d2625e24866b70fffd811a8f1bfeccfa2582d7b49b6b9bd9',
 'tools/generate-c1-account-simulator.cjs':'0ec09e5cbf339ca5407683c527c655cd59625af424f3ce5d9edf28b3dd3a5728'
}))assert.equal(sha(fs.readFileSync(file)),pin,'Canonical source unchanged: '+file);
const generated=spawnSync(process.execPath,['tools/generate-c1-recent-momentum-challenger.cjs','--check'],{encoding:'utf8'});
assert.equal(generated.status,0,generated.stderr);
console.log('PASS: scoped exact source inverse; all97 prior source/economic fixtures unchanged; canonical source/generator intact; exact generated-engine parity.');
