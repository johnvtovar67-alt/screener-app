const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');

const clsOld='const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";';
const clsNew='const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate","Reduce"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";';
if(s.includes(clsOld))s=s.replace(clsOld,clsNew);else if(!s.includes('"Trim","Rotate","Reduce"'))throw new Error('decision color anchor missing');

const nextAnchor='if(d.action==="Review")return"Capital review: do not add or rotate reflexively. Re-underwrite the forward thesis, sizing, concentration, and opportunity cost before the next trade.";return"Hold; no new capital unless the setup, signal persistence, and portfolio risk budget all support it.";';
const nextNew='if(d.action==="Reduce"){const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(s),amt=sh*pr,remain=Math.max(0,Math.floor(+s.shares||0)-sh);return sh>0?`Sell ${sh} ${sh===1?"share":"shares"} (${money(amt)}); keep ${remain} shares. Leave proceeds in cash unless a separate rotation independently clears the rotation hurdle.`:"Reduce risk; calculate whole-share sizing before trading.";}if(d.action==="Review")return"Review the position before adding or rotating.";return"Hold. Add only if the fresh-capital standard is met.";';
if(s.includes(nextAnchor))s=s.replace(nextAnchor,nextNew);else if(!s.includes('if(d.action==="Reduce")'))throw new Error('next-move anchor missing');

if(!s.includes('if(d.action==="Reduce")'))throw new Error('Reduce next move not installed');
if(!s.includes('"Trim","Rotate","Reduce"'))throw new Error('Reduce color not installed');
fs.writeFileSync(path,s);
