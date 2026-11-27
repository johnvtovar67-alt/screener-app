// Test-only exact inverse of the owner-authorized issued-trade retention repair.
// No application, financial record or runtime authorization imports this file.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-issued-trade-retention-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-opening-momentum-index-seams.cjs').restore(file,source);
 source=require('./c1-stock-momentum-exit-seams.cjs').restore(file,source);
 source=require('./c1-recovery-form-mobile-seams.cjs').restore(file,source);
 const patch=fixture.files[file];
 if(!patch||blob(source)!==patch.afterHash)return source;
 for(const chunk of [...patch.chunks].reverse()){
  assert.equal(source.split(chunk.after).length,2,'Unique issued-trade retention inverse: '+file);
  source=source.replace(chunk.after,()=>chunk.before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact prior published application source: '+file);
 return source;
}
module.exports={restore,blob};
