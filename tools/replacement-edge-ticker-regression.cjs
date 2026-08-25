const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const assert=(c,m)=>{if(!c)throw new Error(m)};
assert(s.includes('function replacementEdgeTargetLabel('),'replacement-edge target helper missing');
assert(s.includes('vs ${t}'),'qualified replacement ticker is not displayed');
assert(s.includes('replacementEdgeTargetLabel(s,v)'),'Opportunity Gap cell does not use replacement ticker label');
console.log('REPLACEMENT EDGE TICKER PASS: qualified replacement ticker is shown with the edge visual.');
