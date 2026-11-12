// Exact inverse for the November 12 Watch blocker-priority explanation repair.
// This is test tooling only; app code never imports it.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-watch-wait-priority-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-current-blocker-seams.cjs').restore(file,source);
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique Watch blocker-priority inverse: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact prior reviewed Watch wording source recovered: '+file);
 return source;
}
module.exports={restore,blob};
