// Exact display-only inverse for historical source oracles. Never runtime code.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/portfolio-sector-label-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 const patch=fixture.files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const chunk of [...patch.chunks].reverse()){
  assert.equal(source.split(chunk.after).length,2,'Unique sector-label inverse: '+file);
  source=source.replace(chunk.after,()=>chunk.before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact published portfolio presentation restored: '+file);
 return source;
}
module.exports={restore,blob};
