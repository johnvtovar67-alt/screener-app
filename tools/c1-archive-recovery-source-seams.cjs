// Exact inverse of the November 5 archive-first recovery orchestration repair.
// The historical lifecycle SHA and every economic oracle remain unchanged;
// c1-archive-recovery-regression exercises the repaired real archive/book path.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const seams=require('./fixtures/c1-archive-recovery-source-seams.json');
const blob=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 const record=seams[file];if(!record||blob(source)===record.baselineBlob)return source;
 assert.equal(blob(source),record.authorizedBlob,'Complete authorized archive-first recovery source: '+file);
 for(const {before,after}of [...record.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique archive-first recovery seam: '+file);source=source.replace(after,before);
 }
 assert.equal(blob(source),record.baselineBlob,'Unchanged historical lifecycle oracle: '+file);return source;
}
module.exports={restore};
