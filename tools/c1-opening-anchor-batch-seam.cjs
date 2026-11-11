// Exact inverse of the bounded opening-anchor continuation sizing repair.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const gitBlob=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function restore(source){
 const batch='const missing=wanted.filter(symbol=>!entry.anchors.has(symbol)),batch=missing.slice(0,OPENING_ANCHOR_BATCH_SIZE);';
 assert.equal(source.split(batch).length-1,1,'Opening-anchor batch bound must occur exactly once');
 source=source.replace(batch,'const missing=wanted.filter(symbol=>!entry.anchors.has(symbol)),batch=missing.slice(0,BATCH_SIZE);');
 const size='const OPENING_ANCHOR_BATCH_SIZE=64;\n';
 assert.equal(source.split(size).length-1,1,'Opening-anchor batch constant must occur exactly once');
 source=source.replace(size,'');
 assert.equal(gitBlob(source),'abbd885d2b4e2a2c101c77a257092f74d398aa00','Prior universe verification source identity');
 return source;
}
exports.restore=restore;
