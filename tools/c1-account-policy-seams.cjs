// Reverse only the explicitly reviewed account-policy v2 source changes.
// This is used by historical source oracles, never by the application or build
// output. Earlier source pins and economic expectations remain unchanged.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-account-policy-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-opening-shared-seams.cjs').restore(file,source);
 source=require('./c1-opening-revision-inputs-seams.cjs').restoreCurrent(file,source);
 const patch=fixture.files[file];
 if(patch&&blob(source)===patch.beforeHash)return source;
 const invertPolicy=()=>{
  if(!patch||blob(source)!==patch.afterHash)return false;
  for(const {before,after} of [...patch.chunks].reverse()){
   assert.equal(source.split(after).length,2,'Unique account-policy v2 inverse: '+file);
   source=source.replace(after,()=>before);
  }
  assert.equal(blob(source),patch.beforeHash,'Exact pre-v2 application source: '+file);
  return true;
 };
 // On the execution view the v2 post-image is also the opening-input
 // repair's exact pre-image. Invert v2 immediately when those blobs meet,
 // before older inverse seams can move the source to an intermediate version.
 if(invertPolicy())return source;
 source=require('./c1-watch-monitoring-seams.cjs').restore(file,source);
 source=require('./c1-current-watch-ten-seams.cjs').restore(file,source);
 source=require('./c1-account-policy-replay-repair-seams.cjs').restore(file,source);
 invertPolicy();
 return source;
}
module.exports={restore,blob};
