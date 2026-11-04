// Exact inverse of the owner-authorized risk-only verification UI. Immutable
// historical Home hashes continue to describe their original deployed source.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const seams=require('./fixtures/c1-stop-verification-source-seams.json');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function restore(file,source){
 const record=seams[file];if(!record||blob(source)===record.baselineBlob)return source;
 assert.equal(blob(source),record.authorizedBlob,'Complete declared owner-authorized stop-verification source: '+file);
 for(const {before,after}of [...record.chunks].reverse()){
  assert.equal(source.split(after).length,2,'One exact stop-verification seam: '+file);source=source.replace(after,before);
 }
 assert.equal(blob(source),record.baselineBlob,'Complete pre-repair Git blob: '+file);return source;
}
module.exports={restore};
