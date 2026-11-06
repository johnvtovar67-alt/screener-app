// Exact inverse of observation-only replay state and the opening-sale proof.
// Historical source/economic oracle hashes and assertions remain unchanged.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const seams=require('./fixtures/c1-opening-sale-source-seams.json');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function restore(file,source){
 source=require('./c1-exit-review-source-seams.cjs').restore(file,source);
 const record=seams[file];if(!record||blob(source)===record.baselineBlob)return source;
 assert.equal(blob(source),record.authorizedBlob,'Complete reviewed opening-sale source: '+file);
 for(const {before,after}of [...record.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique opening-sale source seam: '+file);source=source.replace(after,before);
 }
 assert.equal(blob(source),record.baselineBlob,'Unchanged original source oracle: '+file);return source;
}
module.exports={restore};
