// Exact reversal of the activation-boundary replay repair. Historical source
// oracles retain both the released v2 hashes and every earlier baseline hash.
// This helper is tooling only; the application never imports it.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-account-policy-replay-repair-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after} of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique activation-boundary replay inverse: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact released v2 source restored: '+file);
 return source;
}
module.exports={restore,blob};
