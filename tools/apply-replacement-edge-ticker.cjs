const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('function replacementEdgeTargetLabel(')){console.log('Replacement edge target ticker already applied.');process.exit(0);}

const helper='function replacementEdgeVisual(gap,eligible){const v=Math.round(+gap||0);if(!eligible||v<=0)return{value:null,label:"None qualified",tone:"none"};if(v>=55)return{value:v,label:"Exceptional",tone:"exceptional"};if(v>=45)return{value:v,label:"Strong edge",tone:"strong"};return{value:v,label:"Below hurdle",tone:"below"};}';
if(!s.includes(helper))throw new Error('replacement edge ticker: visual helper missing');
s=s.replace(helper,helper+'\nfunction replacementEdgeTargetLabel(s,v){const t=String(s?.rotateTarget||"").toUpperCase();return v.value===null||!t?v.label:`${v.label} · vs ${t}`;}');

const old='<small>{v.label}</small></span>;})()}</td>';
if(!s.includes(old))throw new Error('replacement edge ticker: opportunity cell missing');
s=s.replace(old,'<small>{replacementEdgeTargetLabel(s,v)}</small></span>;})()}</td>');

fs.writeFileSync(path,s);
console.log('Added qualified replacement ticker to Opportunity Gap visual.');
