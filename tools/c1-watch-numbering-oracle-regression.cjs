const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const numbering=require('./c1-watch-numbering-seams.cjs');
const monitoring=require('./c1-watch-monitoring-seams.cjs');
const fixture=require('./fixtures/c1-watch-numbering-source-seams.json');
const previous=require('./fixtures/c1-watch-monitoring-source-seams.json');
assert.equal(fixture.contract,'c1-watch-numbering-source-inverse-v1');
assert.equal(fixture.baselineCommit,'823b15326a8f5892cfc751b6a1ada447c3a114fd');
assert.equal(createHash('sha256').update(fs.readFileSync('tools/fixtures/c1-watch-monitoring-source-seams.json')).digest('hex'),
 'a66be0201c92787016475727590517dbce8ea3bd9f05986d36e82313c9d75cbe','Previously released monitoring oracle fixture is immutable');
assert.deepEqual(Object.keys(fixture.files),['components/C1AccountOpportunitiesView.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=fs.readFileSync(file,'utf8'),released=numbering.restore(file,current);
 assert.equal(numbering.blob(current),patch.afterHash,'Exact reviewed presentation-only numbering source');
 assert.equal(numbering.blob(released),patch.beforeHash,'Exact prior deployed source recovered');
 assert.equal(patch.beforeHash,previous.files[file].afterHash,'The prior released source identity is unchanged');
 assert.equal(numbering.blob(monitoring.restore(file,current)),previous.files[file].beforeHash,'Existing historical chain remains exact');
 assert.equal(numbering.restore(file,released),released,'Inverse is idempotent');
 const unknown=current+'\n// unreviewed source\n';
 assert.equal(numbering.restore(file,unknown),unknown,'Unknown source cannot acquire a historical identity');
 assert.equal(monitoring.restore(file,unknown),unknown,'The composed inverse cannot normalize unknown source');
}
console.log('PASS: exact view-only Watch numbering inverse; published source and economic oracles preserved.');
