// Restore the exact pre-repair source for existing historical source oracles.
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const files=require('./fixtures/c1-exit-review-source-seams.json');
const blob=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(file,source){
 source=require('./c1-current-screen-source-seams.cjs').restore(file,source);
 const patch=files[file];
 if(!patch||blob(source)===patch.baselineBlob)return source;
 assert.equal(blob(source),patch.authorizedBlob,'Reviewed exit evidence and opening recovery source: '+file);
 for(const {before,after} of [...patch.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique exit review change: '+file);
  source=source.replace(after,before);
 }
 assert.equal(blob(source),patch.baselineBlob,'Original file restored: '+file);
 return source;
}
module.exports={restore};
