const fs=require('fs');
const pagePath='pages/index.js';
let src=fs.readFileSync(pagePath,'utf8');

if(!src.includes('Lifecycle exits are summarized even when generated after funding-plan construction')){
  const oldLoop='  for(const stock of results){const d=pd(stock),k=sym(stock);if(d.action!=="Reduce"||summarizedSources.has(k))continue;const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(stock),amount=sh*pr,remainingShares=Math.max(0,Math.floor(+stock.shares||0)-sh);if(sh>0){finalActionGroups.push({source:k,type:"Reduce",items:[],sourceSellShares:sh,sourceSaleProceeds:amount,sourceRemainingShares:remainingShares,cash:amount});summarizedSources.add(k);}}';
  const newLoop='  // Lifecycle exits are summarized even when generated after funding-plan construction.\n  for(const stock of results){const d=pd(stock),k=sym(stock);if(summarizedSources.has(k))continue;if(d.action==="Exit"){finalActionGroups.push({source:k,type:"Exit",items:[],cash:+stock.value||0,sourceShares:Math.max(0,Math.floor(+stock.shares||0))});summarizedSources.add(k);continue;}if(d.action!=="Reduce")continue;const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(stock),amount=sh*pr,remainingShares=Math.max(0,Math.floor(+stock.shares||0)-sh);if(sh>0){finalActionGroups.push({source:k,type:"Reduce",items:[],sourceSellShares:sh,sourceSaleProceeds:amount,sourceRemainingShares:remainingShares,cash:amount});summarizedSources.add(k);}}';
  if(!src.includes(oldLoop))throw new Error('portfolio action summary patch: final action loop marker not found');
  src=src.replace(oldLoop,newLoop);

  const oldExit='const detail=g.type==="Exit"?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:';
  const newExit='const detail=g.type==="Exit"?(alloc?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:`${g.sourceShares?`Sell ${g.sourceShares} ${g.sourceShares===1?"share":"shares"} • `:""}${money(g.cash)} → cash`):';
  if(!src.includes(oldExit))throw new Error('portfolio action summary patch: exit detail marker not found');
  src=src.replace(oldExit,newExit);
}

if(!src.includes('className="timeReviewBox"><b>⏱ Time Review</b><span>')){
  const start='{timeReviewRows.length>0&&<div className="timeReviewBox">';
  const governor='{riskSnapshot.concentrations.length>0&&<div className="governorBox">';
  const a=src.indexOf(start),b=src.indexOf(governor,a);
  if(a<0||b<0)throw new Error('portfolio action summary patch: time review panel markers not found');
  const compact='{timeReviewRows.length>0&&<div className="timeReviewBox"><b>⏱ Time Review</b><span>{timeReviewRows.map(({s,time,decision})=>`${sym(s)} ${time.held}d · ${time.stage} · ${decision.action}`).join("   •   ")}</span></div>}';
  src=src.slice(0,a)+compact+src.slice(b);

  const oldCss='.timeReviewBox{border:1px solid #94a3b8;background:#f8fafc;border-radius:12px;padding:12px;margin:12px 0}.timeReviewBox>p{color:#53657f;margin:6px 0 10px}';
  const newCss='.timeReviewBox{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;padding:8px 10px;margin:10px 0}.timeReviewBox>span{color:#53657f;font-weight:700}';
  if(!src.includes(oldCss))throw new Error('portfolio action summary patch: time review CSS marker not found');
  src=src.replace(oldCss,newCss);
}

fs.writeFileSync(pagePath,src);
console.log('Applied complete portfolio action summary and compact time review.');
