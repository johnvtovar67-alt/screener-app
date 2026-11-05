// Exact inverse of the display-only source-date/publication-state repair.
// Existing historical source/economic hashes remain unchanged. The dedicated
// publication regression proves calendar behavior and non-authority separately.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const seams=require('./fixtures/c1-publication-source-seams.json');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function restore(file,source){
 const record=seams[file];if(!record||blob(source)===record.baselineBlob)return source;
 assert.equal(blob(source),record.authorizedBlob,'Complete authorized publication-state repair: '+file);
 for(const {before,after}of [...record.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique publication-state seam: '+file);source=source.replace(after,before);
 }
 assert.equal(blob(source),record.baselineBlob,'Unchanged pre-repair Home oracle: '+file);return source;
}
module.exports={restore};
