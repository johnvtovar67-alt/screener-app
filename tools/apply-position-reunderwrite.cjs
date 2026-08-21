const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
const importOld='import {winnerTrimGate,recordWinnerTrim} from "../lib/winnerLifecycle";';
const importNew=importOld+'\nimport {reunderwriteExistingPosition} from "../lib/positionReunderwrite";';
if(!s.includes('reunderwriteExistingPosition')){
  if(!s.includes(importOld))throw new Error('winner lifecycle import anchor missing');
  s=s.replace(importOld,importNew);
}
const oldStart='  function pd(s){\n    const base=rawPd(s),bp=buyPlans.find(x=>x.symbol===sym(s)),time=swingTimeReview(s);';
const newStart='  function pd(s){\n    const base=rawPd(s),bp=buyPlans.find(x=>x.symbol===sym(s)),time=swingTimeReview(s);';
if(!s.includes(oldStart))throw new Error('pd start anchor missing');
const oldTail='    if(base.action==="Hold"&&time.review)return{...base,reason:`${base.reason} Time review: ${time.reason}`};\n    return base;\n  }';
const newTail='    if(base.action==="Hold"){const rw=reunderwriteExistingPosition({stock:s,decision:base,risk:riskSnapshot,timeReview:time});if(rw.override)return{...base,action:rw.action,reason:rw.reason,reunderwrite:rw};if(time.review)return{...base,reason:`${base.reason} Time review: ${time.reason}`};}\n    return base;\n  }';
if(!s.includes(oldTail))throw new Error('pd tail anchor missing');
s=s.replace(oldTail,newTail);
fs.writeFileSync(path,s);
