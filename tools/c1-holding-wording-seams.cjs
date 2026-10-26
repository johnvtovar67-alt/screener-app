const assert=require('node:assert/strict');
const oldLabel='Account purchase status — separate from C1 rating';
const newLabel="{held?'Your position':'Purchase check'}";
function restoreView(source){assert.equal(source.split(newLabel).length-1,1,'Only the authorized account heading seam changes');return source.replace(newLabel,oldLabel);}
module.exports={oldLabel,newLabel,restoreView};
