// Exact inverse of bounded same-request anchor batching; tooling only.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-opening-budget-source-seams.json');
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function restore(file,source){
 const patch=fixture.files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique opening-budget inverse');source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact deployed shared-opening source');return source;
}
module.exports={restore,blob};
