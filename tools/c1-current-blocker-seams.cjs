// Exact inverse of the current C1 evidence/blocker repair. Test tooling only;
// no application, provider, trading or financial operation imports this file.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-current-blocker-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique current C1 evidence/blocker inverse: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact previously deployed C1 source recovered: '+file);
 return source;
}
module.exports={restore,blob};
