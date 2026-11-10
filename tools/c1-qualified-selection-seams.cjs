// Exact inverse for the newly authorized prospective policy. Earlier source
// and economic oracle hashes remain unchanged and continue to run.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const files=require('./fixtures/c1-qualified-selection-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-source-eligibility-seams.cjs').restore(file,source);
 const patch=files[file];
 // Older inverses may already have restored a preceding approved version.
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique qualified-selection change: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact pre-enhancement source: '+file);
 return source;
}
module.exports={restore};
