// Reconstruct the exact previously reviewed application blobs for source oracles.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const files=require('./fixtures/c1-current-holding-source-seam.json');
const accountActions=require('./fixtures/c1-account-action-source-seam.json');
const viewFile='components/C1AccountOpportunitiesView.js';
const blob=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0'+s).digest('hex');
function replace(source,from,to){
 assert.equal(source.split(from).length,2,'Only the reviewed source fragment may change');
 return source.replace(from,()=>to);
}
function restore(file,source){
 source=require('./c1-qualified-selection-seams.cjs').restore(file,source);
 const action=accountActions[file];
 if(action&&blob(source)===action.afterHash){
  for(const {before,after} of [...action.chunks].reverse())source=replace(source,after,before);
  assert.equal(blob(source),action.beforeHash,'Previous account action source restored: '+file);
 }
 const patch=files[file];
 if(!patch||blob(source)===patch.beforeHash)return source;
 assert.equal(blob(source),patch.afterHash,'Current reviewed source: '+file);
 for(const {before,after} of [...patch.chunks].reverse())source=replace(source,after,before);
 assert.equal(blob(source),patch.beforeHash,'Original source restored: '+file);
 return source;
}
function applyView(source){
 for(const patch of [files[viewFile],accountActions[viewFile]])
  for(const {before,after} of patch.chunks)source=replace(source,before,after);
 return source;
}
module.exports={restore,applyView};
