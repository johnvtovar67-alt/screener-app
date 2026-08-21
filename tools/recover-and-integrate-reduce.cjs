const fs=require('fs');
const p='pages/index.js';
let s=fs.readFileSync(p,'utf8');

function replaceOnce(a,b,label){if(!s.includes(a))throw new Error(`Missing ${label}`);s=s.replace(a,b);}
replaceOnce('const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";',
'const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate","Reduce"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";', 'Reduce color');

const oldNext='if(d.action==="Review")return"Capital review: do not add or rotate reflexively. Re-underwrite the forward thesis, sizing, concentration, and opportunity cost before the next trade.";return"Hold; no new capital unless the setup, signal persistence, and portfolio risk budget all support it.";';
const newNext='if(d.action==="Reduce"){const rw=d.reunderwrite||{},sell=Math.min(Math.max(0,Math.floor(+rw.reduceShares||0)),Math.max(0,Math.floor(+s.shares||0)-1)),keep=Math.max(0,Math.floor(+s.shares||0)-sell);return sell>0?`Sell ${sell} shares; keep ${keep}. Hold the proceeds in cash unless a separate Buy clears the rotation hurdle.`:"Reduce risk; hold proceeds in cash unless a separate Buy clears the rotation hurdle.";}if(d.action==="Review")return"No add. Recheck the thesis, size and opportunity cost before acting.";return"Hold. Add only if it independently clears the fresh-capital standard.";';
replaceOnce(oldNext,newNext,'Next Move language');

// Make the top capital-actions box surface resolved Reduce decisions without treating them as rotations.
const oldAction='const actionGroups=[];for(const[source,items]of fundingBySymbol.entries())';
const newAction='const actionGroups=[];const resolvedReductions=rawDecisions.map(x=>{if(x.d.action!=="Hold")return null;const time=swingTimeReview(x.s),rw=reunderwriteExistingPosition({stock:x.s,decision:x.d,risk:riskSnapshot,timeReview:time});return rw.override&&rw.action==="Reduce"?{source:sym(x.s),type:"Reduce",items:[],reduce:rw,stock:x.s}:null;}).filter(Boolean);for(const[source,items]of fundingBySymbol.entries())';
replaceOnce(oldAction,newAction,'action groups start');
const oldTrimAppend='for(const[source,trim]of trimPlans.entries())actionGroups.push({source,type:"Trim",items:[],trim});';
const newTrimAppend='for(const[source,trim]of trimPlans.entries())actionGroups.push({source,type:"Trim",items:[],trim});for(const r of resolvedReductions)actionGroups.push(r);';
replaceOnce(oldTrimAppend,newTrimAppend,'reduction group append');

const oldLabel='const label=g.type==="Exit"?`EXIT ${g.source}`:g.type==="Cash"?"USE CASH":g.type==="Trim"?`BANK PROFITS ${g.source}`:g.fullRotation?`ROTATE ${g.source}`:`REDUCE ${g.source}`;';
const newLabel='const label=g.type==="Exit"?`EXIT ${g.source}`:g.type==="Cash"?"USE CASH":g.type==="Trim"?`BANK PROFITS ${g.source}`:g.type==="Reduce"?`REDUCE ${g.source}`:g.fullRotation?`ROTATE ${g.source}`:`REDUCE ${g.source}`;';
replaceOnce(oldLabel,newLabel,'action label');
const oldDetail='const detail=g.type==="Exit"?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:g.type==="Cash"?alloc:g.type==="Trim"?`${g.trim.severity} profit protection • Sell ${g.trim.shares} shares (${Math.round(g.trim.trimPct*100)}% of position) for ${money(g.trim.amount)} • est. realized gain ${Number.isFinite(g.trim.realizedGain)?money(g.trim.realizedGain):"—"} • keep ${g.trim.remainingShares} shares (${money(g.trim.residual)})${g.trim.priorTrimCount?` • winner lifecycle: ${g.trim.priorTrimCount} prior trims`:""}`:g.fullRotation?`Sell full position • ${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:`Sell ${g.sourceSellShares} shares (${money(g.sourceSaleProceeds)}) • ${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""} • keep ${g.sourceRemainingShares} shares`;';
const newDetail='const detail=g.type==="Exit"?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:g.type==="Cash"?alloc:g.type==="Trim"?`${g.trim.severity} profit protection • Sell ${g.trim.shares} shares (${Math.round(g.trim.trimPct*100)}% of position) for ${money(g.trim.amount)} • keep ${g.trim.remainingShares} shares${g.trim.priorTrimCount?` • ${g.trim.priorTrimCount} prior trims`:""}`:g.type==="Reduce"?`Sell ${Math.min(Math.max(0,Math.floor(+g.reduce.reduceShares||0)),Math.max(0,Math.floor(+g.stock.shares||0)-1))} shares • keep ${Math.max(0,Math.floor(+g.stock.shares||0)-Math.min(Math.max(0,Math.floor(+g.reduce.reduceShares||0)),Math.max(0,Math.floor(+g.stock.shares||0)-1)))} • proceeds stay in cash unless a separate Buy qualifies`:g.fullRotation?`Sell full position • ${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:`Sell ${g.sourceSellShares} shares (${money(g.sourceSaleProceeds)}) • ${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""} • keep ${g.sourceRemainingShares} shares`;';
replaceOnce(oldDetail,newDetail,'action detail');

fs.writeFileSync(p,s);
console.log('Recovered page patched for executable Reduce and simpler language');
