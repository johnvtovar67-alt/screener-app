// Exact inverse of the diagnostic-only opening-comparison explanation repair.
// Test tooling only; this changes no comparison, authority or financial data.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-opening-diagnostic-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-background-policy-seams.cjs').restore(file,source);
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique opening diagnostic inverse: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact released opening-comparison source recovered: '+file);
 return source;
}
module.exports={restore,blob};
