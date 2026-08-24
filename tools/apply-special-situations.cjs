const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('function specialSituation(s)')){console.log('Special-situation UI already applied.');process.exit(0);}

const roleMarker='const role=(s,r)=>r==="Core"?"Core":"Swing";';
if(!s.includes(roleMarker))throw new Error('special situations: role marker missing');
s=s.replace(roleMarker,roleMarker+'\nfunction specialSituation(s){return sym(s)==="IRDM"?{type:"Acquisition Pending",label:"Acquisition Pending",buyer:"RKLB",notionalValue:54,cashComponent:27,expectedClose:"mid-2027",blockNewCapital:true}:null;}');

const eventOld='const event=s=>s?.eventRisk||s?.preTradeCheck||rec(s)?.eventRisk||rec(s)?.preTradeCheck||null;';
if(!s.includes(eventOld))throw new Error('special situations: event marker missing');
s=s.replace(eventOld,'const event=s=>specialSituation(s)||s?.eventRisk||s?.preTradeCheck||rec(s)?.eventRisk||rec(s)?.preTradeCheck||null;');

const actOld='const act=s=>CASH.includes(sym(s))?"Cash":fd(s).action;';
if(!s.includes(actOld))throw new Error('special situations: action marker missing');
s=s.replace(actOld,'const act=s=>CASH.includes(sym(s))?"Cash":specialSituation(s)?.blockNewCapital?"Watch":fd(s).action;');

const oppOld='  function opportunityDecision(s){\n    const d=fd(s);if(!["Strong Buy","Buy"].includes(d.action))return d;';
if(!s.includes(oppOld))throw new Error('special situations: opportunity decision marker missing');
s=s.replace(oppOld,'  function opportunityDecision(s){\n    const d=fd(s),special=specialSituation(s);if(special?.blockNewCapital)return{...d,action:"Watch",timing:"Wait",size:"None",reason:"Acquisition pending — ordinary Swing Buy/Strong Buy signals are disabled. Evaluate the merger spread, closing risk, RKLB collar exposure, and opportunity cost instead."};if(!["Strong Buy","Buy"].includes(d.action))return d;');

const nextOld='  function next(s,d){if(CASH.includes(sym(s)))return"Available for deployment, subject to signal persistence and portfolio risk budget.";';
if(!s.includes(nextOld))throw new Error('special situations: next marker missing');
s=s.replace(nextOld,'  function next(s,d){const special=d?.reunderwrite?.specialSituation||specialSituation(s);if(special?.type==="Acquisition Pending")return"Do not add under normal Swing logic. Reassess the merger spread, closing risk, and opportunity cost versus cash/qualified replacements.";if(CASH.includes(sym(s)))return"Available for deployment, subject to signal persistence and portfolio risk budget.";');

fs.writeFileSync(path,s);
console.log('Applied acquisition-pending treatment for IRDM.');
