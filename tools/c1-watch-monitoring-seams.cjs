// Exact reversal of the owner-authorized monitoring-only Watch correction.
// This tooling helper preserves every earlier released source/economic oracle;
// neither the application nor purchase engine imports it.
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-watch-monitoring-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-current-blocker-seams.cjs').restore(file,source);
 source=require('./c1-watch-numbering-seams.cjs').restore(file,source);
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const {before,after}of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique monitoring Watch inverse: '+file);
  source=source.replace(after,()=>before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact prior released Watch source: '+file);
 return source;
}
module.exports={restore,blob};
