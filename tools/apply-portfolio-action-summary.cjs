const fs=require('fs');
const pagePath='pages/index.js';
let src=fs.readFileSync(pagePath,'utf8');
if(src.includes('Lifecycle exits are summarized even when generated after funding-plan construction')){console.log('Portfolio action summary patch already applied.');process.exit(0);}

const oldLoop='  for(const stock of results){const d=pd(stock),k=sym(stock);if(d.action!=="Reduce"||summarizedSources.has(k))continue;const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(stock),amount=sh*pr,remainingShares=Math.max(0,Math.floor(+stock.shares||0)-sh);if(sh>0){finalActionGroups.push({source:k,type:"Reduce",items:[],sourceSellShares:sh,sourceSaleProceeds:amount,sourceRemainingShares:remainingShares,cash:amount});summarizedSources.add(k);}}';
const newLoop='  // Lifecycle exits are summarized even when generated after funding-plan construction.\n  for(const stock of results){const d=pd(stock),k=sym(stock);if(summarizedSources.has(k))continue;if(d.action==="Exit"){finalActionGroups.push({source:k,type:"Exit",items:[],cash:+stock.value||0,sourceShares:Math.max(0,Math.floor(+stock.shares||0))});summarizedSources.add(k);continue;}if(d.action!=="Reduce")continue;const rw=d.reunderwrite||{},sh=Math.max(0,Math.floor(+rw.reduceShares||0)),pr=price(stock),amount=sh*pr,remainingShares=Math.max(0,Math.floor(+stock.shares||0)-sh);if(sh>0){finalActionGroups.push({source:k,type:"Reduce",items:[],sourceSellShares:sh,sourceSaleProceeds:amount,sourceRemainingShares:remainingShares,cash:amount});summarizedSources.add(k);}}';
if(!src.includes(oldLoop))throw new Error('portfolio action summary patch: final action loop marker not found');
src=src.replace(oldLoop,newLoop);

const oldExit='const detail=g.type==="Exit"?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:';
const newExit='const detail=g.type==="Exit"?(alloc?`${alloc}${g.cash>1?`; ${money(g.cash)} → cash`:""}`:`${g.sourceShares?`Sell ${g.sourceShares} ${g.sourceShares===1?"share":"shares"} • `:""}${money(g.cash)} → cash`):';
if(!src.includes(oldExit))throw new Error('portfolio action summary patch: exit detail marker not found');
src=src.replace(oldExit,newExit);

fs.writeFileSync(pagePath,src);
console.log('Applied complete portfolio action summary for lifecycle exits.');
