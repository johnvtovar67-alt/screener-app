// Reconstruct the exact previously reviewed application blobs for source oracles.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const files=require('./fixtures/c1-current-holding-source-seam.json');
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
function replace(source,from,to){
 assert.equal(source.split(from).length,2,'Only the reviewed source fragment may change');
 return source.replace(from,()=>to);
}
function restore(file,source){
 const patch=files[file];
 if(!patch||blob(source)===patch.beforeHash)return source;
 assert.equal(blob(source),patch.afterHash,'Current reviewed source: '+file);
 for(const {before,after} of [...patch.chunks].reverse())source=replace(source,after,before);
 assert.equal(blob(source),patch.beforeHash,'Original source restored: '+file);
 return source;
}
function applyView(source){
 for(const {before,after} of files['components/C1AccountOpportunitiesView.js'].chunks)
  source=replace(source,before,after);
 return source;
}
module.exports={restore,applyView};
