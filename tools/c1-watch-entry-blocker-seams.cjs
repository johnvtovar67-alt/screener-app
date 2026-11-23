// Exact display-only inverse; historical test support, never runtime code.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-watch-entry-blocker-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 const patch=fixture.files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const chunk of [...patch.chunks].reverse()){
  assert.equal(source.split(chunk.after).length,2,'Unique Watch entry-blocker inverse: '+file);
  source=source.replace(chunk.after,()=>chunk.before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact prior Watch explanation source: '+file);
 return source;
}
module.exports={restore,blob};
