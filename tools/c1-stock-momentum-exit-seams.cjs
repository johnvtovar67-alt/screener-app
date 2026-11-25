// Exact prospective source inverse for historical oracle verification only.
// Application code and financial/account records never import this tool.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-stock-momentum-exit-source-seams.json');
const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-planned-sale-attribution-seams.cjs').restore(file,source);
 source=require('./c1-watch-download-cleanup-seams.cjs').restore(file,source);
 source=require('./c1-watch-exposure-copy-seams.cjs').restore(file,source);
 source=require('./portfolio-sector-label-seams.cjs').restore(file,source);
 source=require('./c1-sell-quantity-summary-seams.cjs').restore(file,source);
 const patch=fixture.files[file];if(!patch||blob(source)!==patch.afterHash)return source;
 for(const chunk of [...patch.chunks].reverse()){
  assert.equal(source.split(chunk.after).length,2,'Unique stock-momentum inverse: '+file);
  source=source.replace(chunk.after,()=>chunk.before);
 }
 assert.equal(blob(source),patch.beforeHash,'Exact previously published application source: '+file);
 return source;
}
module.exports={restore,blob};
