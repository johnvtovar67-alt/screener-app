const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');

const importOld='factorFor,factorWeightsFor,signalPersistence,portfolioRiskSnapshot,swingTargetPct,capitalAllowance,capitalSignalEligible,rotationGate,swingTimeReview';
const importNew='factorFor,factorWeightsFor,signalPersistence,portfolioRiskSnapshot,swingTargetPct,capitalAllowance,portfolioContributionGate,capitalSignalEligible,rotationGate,swingTimeReview';
if(s.includes(importOld))s=s.replace(importOld,importNew);else if(!s.includes('portfolioContributionGate'))throw new Error('governor import anchor missing');

const clsOld='const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";';
const clsNew='const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate","Reduce"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";';
if(s.includes(clsOld))s=s.replace(clsOld,clsNew);else if(!s.includes('"Trim","Rotate","Reduce"'))throw new Error('decision color anchor missing');

const nextAnchor='if(d.action==="Review")return"Capital review: do not add or rotate reflexively. Re-underwrite the forward thesis, sizing, concentration, and opportunity cost before the next trade.";return"Hold; no new capital unless the setup, signal persistence, and portfolio risk budget all support it.";';
const nextNew='if(d.action==="Reduce"){const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(s),amt=sh*pr,remain=Math.max(0,Math.floor(+s.shares||0)-sh);return sh>0?`Sell ${sh} ${sh===1?"share":"shares"} (${money(amt)}); keep ${remain} shares. Leave proceeds in cash unless a separate rotation independently clears the rotation hurdle.`:"Reduce risk; calculate whole-share sizing before trading.";}if(d.action==="Review")return"Review the position before adding or rotating.";return"Hold. Add only if the fresh-capital standard is met.";';
if(s.includes(nextAnchor))s=s.replace(nextAnchor,nextNew);else if(!s.includes('if(d.action==="Reduce")'))throw new Error('next-move anchor missing');

const allowanceAnchor='const initialAllowance=capitalAllowance({target:bp.stock,action:bp.action,requested:need,risk:projectedRisk});need=Math.min(need,initialAllowance.amount);if(initialAllowance.blocked||need<minFundingAction){bp.blockReason=initialAllowance.reason;bp.remainingNeed=bp.need;continue;}';
const allowanceNew='const initialAllowance=capitalAllowance({target:bp.stock,action:bp.action,requested:need,risk:projectedRisk});need=Math.min(need,initialAllowance.amount);if(initialAllowance.blocked||need<minFundingAction){bp.blockReason=initialAllowance.reason;bp.remainingNeed=bp.need;continue;}const contribution=portfolioContributionGate({target:bp.stock,approvedAmount:need,risk:projectedRisk,existingValue:bp.existingValue});bp.contribution=contribution;if(!contribution.pass){bp.blockReason=contribution.reason;bp.remainingNeed=bp.need;continue;}need=Math.min(need,contribution.invested||need);';
if(s.includes(allowanceAnchor))s=s.replace(allowanceAnchor,allowanceNew);else if(!s.includes('bp.contribution=contribution'))throw new Error('capital contribution anchor missing');

const rowAnchor='\n  function PortfolioRow({s,mobile=false})';
const summaryCode='\n  const finalActionGroups=[...actionGroups];\n  const summarizedSources=new Set(finalActionGroups.map(g=>g.source));\n  for(const stock of results){const d=pd(stock),k=sym(stock);if(d.action!=="Reduce"||summarizedSources.has(k))continue;const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(stock),amount=sh*pr,remainingShares=Math.max(0,Math.floor(+stock.shares||0)-sh);if(sh>0){finalActionGroups.push({source:k,type:"Reduce",items:[],sourceSellShares:sh,sourceSaleProceeds:amount,sourceRemainingShares:remainingShares,cash:amount});summarizedSources.add(k);}}\n';
if(!s.includes('const finalActionGroups=[...actionGroups]')){if(!s.includes(rowAnchor))throw new Error('portfolio row anchor missing');s=s.replace(rowAnchor,summaryCode+rowAnchor);}
s=s.replace('{actionGroups.length>0&&<div className="rotationBox">','{finalActionGroups.length>0&&<div className="rotationBox">');s=s.replace('{actionGroups.map((g,i)=>','{finalActionGroups.map((g,i)=>');
const labelOld='const label=g.type==="Exit"?`EXIT ${g.source}`:g.type==="Cash"?"USE CASH":g.type==="Trim"?`BANK PROFITS ${g.source}`:g.fullRotation?`ROTATE ${g.source}`:`REDUCE ${g.source}`;';
const labelNew='const label=g.type==="Exit"?`EXIT ${g.source}`:g.type==="Cash"?"USE CASH":g.type==="Trim"?`BANK PROFITS ${g.source}`:g.type==="Reduce"?`REDUCE ${g.source}`:g.fullRotation?`ROTATE ${g.source}`:`REDUCE ${g.source}`;';if(s.includes(labelOld))s=s.replace(labelOld,labelNew);
const detailNeedle=':g.type==="Trim"?`${g.trim.severity} profit protection';if(!s.includes('g.type==="Reduce"?`Sell ${g.sourceSellShares} shares')){if(!s.includes(detailNeedle))throw new Error('action detail anchor missing');s=s.replace(detailNeedle,':g.type==="Reduce"?`Sell ${g.sourceSellShares} shares (${money(g.sourceSaleProceeds)}) • keep ${g.sourceRemainingShares} shares • proceeds stay in cash unless a separate rotation clears the hurdle`'+detailNeedle);}
if(!s.includes('portfolioContributionGate'))throw new Error('contribution gate not installed');if(!s.includes('const finalActionGroups=[...actionGroups]'))throw new Error('final action summary not installed');fs.writeFileSync(path,s);
