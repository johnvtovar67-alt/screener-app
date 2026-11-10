// Reverse only the reviewed source-eligibility repair before earlier oracles.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const files=require('./fixtures/c1-source-eligibility-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-account-policy-seams.cjs').restore(file,source);
 const patch=files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique source-eligibility repair: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact pre-repair source: '+file);return source;
}
module.exports={restore};
