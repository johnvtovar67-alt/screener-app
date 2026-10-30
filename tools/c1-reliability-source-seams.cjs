// Exact, declared October30 reliability seams before immutable older oracles.
// Current behavior is exercised separately by the operational/client/journey/
// refresh-frame/provider regressions and the real Home/App browser rehearsal.
// Neither baseline hashes nor the earlier financial assertions are changed.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const seams=require('./fixtures/c1-reliability-source-seams.json');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
function restore(file,source){
 const record=seams[file];if(!record)return source;
 if(blob(source)===record.baselineBlob)return source;
 assert.equal(blob(source),record.authorizedBlob,'Complete declared reliability source: '+file);
 for(const {before,after}of [...record.chunks].reverse()){
  assert.equal(source.split(after).length,2,'One exact reliability seam: '+file);
  source=source.replace(after,before);
 }
 assert.equal(blob(source),record.baselineBlob,'Complete pre-program Git blob: '+file);return source;
}
module.exports={restore};
