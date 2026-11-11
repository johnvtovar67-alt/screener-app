// Reverse only the explicitly reviewed account-policy v2 source changes.
// This is used by historical source oracles, never by the application or build
// output. Earlier source pins and economic expectations remain unchanged.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-account-policy-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-opening-revision-inputs-seams.cjs').restoreCurrent(file,source);
 source=require('./c1-watch-monitoring-seams.cjs').restore(file,source);
 source=require('./c1-current-watch-ten-seams.cjs').restore(file,source);
 source=require('./c1-account-policy-replay-repair-seams.cjs').restore(file,source);
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after} of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique account-policy v2 inverse: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact pre-v2 application source: '+file);
 return source;
}
module.exports={restore,blob};
