// Exact inverse of the pending-session visibility and completed-fill copy repair; tooling only.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-pending-session-ui-source-seam.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-recorder-ownership-seams.cjs').restore(file,source);
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after} of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique pending-session UI inverse');
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact prior pending-session UI source');
 return source;
}
module.exports={restore,blob};
