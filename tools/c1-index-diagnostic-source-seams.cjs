// Exact inverse of diagnostic-only cron additions for immutable older oracles.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const seams=require('./fixtures/c1-index-diagnostic-source-seams.json');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function restore(file,source){
 const record=seams[file];if(!record||blob(source)===record.baselineBlob)return source;
 assert.equal(blob(source),record.authorizedBlob,'Complete authorized index diagnostic source: '+file);
 for(const {before,after} of [...record.chunks].reverse()){
  assert.equal(source.split(after).length,2,'Unique index diagnostic seam: '+file);source=source.replace(after,before);
 }
 assert.equal(blob(source),record.baselineBlob,'Original index diagnostic source oracle: '+file);return source;
}
module.exports={restore};
