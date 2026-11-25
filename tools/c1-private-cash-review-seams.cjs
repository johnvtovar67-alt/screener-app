// Exact test-only inverse of the owner-reviewed private cash-review recovery.
// Runtime/account code never imports this tool; unknown sources retain identity.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-private-cash-review-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-approved-account-repair-seams.cjs').restore(file,source);
 const patch=fixture.files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const chunk of [...patch.chunks].reverse()){
  assert.equal(source.split(chunk.after).length,2,'Unique private cash-review inverse: '+file);
  source=source.replace(chunk.after,()=>chunk.before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact published private cash-review source: '+file);
 return source;
}
module.exports={restore,blob};
