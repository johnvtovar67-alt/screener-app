// Exact inverse of shared opening-failure explanation copy only. Test tooling;
// never changes account facts, gates, order authority or financial history.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-opening-copy-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 const patch=fixture.files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique opening-copy inverse: '+file);source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact released explanation source recovered: '+file);return source;
}
module.exports={restore,blob};
