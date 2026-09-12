import {isUsMarketSessionDay} from './marketSession';

// User-confirmed purchase evidence describes adopted balances. It never creates
// execution records, changes ownership, or infers a future order quantity.
export function recordC1PositionContext({account,context,expectedRevision,now=new Date()}={}){
 if(account?.revision!==expectedRevision)throw new Error('Account changed; refresh before saving purchase history');
 if(context?.contract!=='c1-position-context-v1'||!Array.isArray(context.positions)||!context.positions.length||context.positions.length>20)throw new Error('Valid position purchase context required');
 const positions=[],seen=new Set();
 for(const input of context.positions){
  if(!/^[A-Z][A-Z0-9.-]{0,14}$/.test(input.symbol)||seen.has(input.symbol)||!['half','full'].includes(input.stage)||!Array.isArray(input.purchases)||!input.purchases.length||input.purchases.length>30)throw new Error('Invalid entry stage or purchases');
  seen.add(input.symbol);
  const adopted=Object.values(account.adoption.seeds).flatMap(seed=>seed.positions.filter(p=>p.symbol===input.symbol).map(p=>({shares:p.shares*seed.actualDollarsPerModelDollar,avgCost:p.entryPrice,openedAt:p.openedAt})));
  const shares=adopted.reduce((sum,p)=>sum+p.shares,0),cost=adopted.reduce((sum,p)=>sum+p.shares*p.avgCost,0);
  const purchases=input.purchases.map(p=>{
   if(typeof p.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(Date.parse(p.date))||new Date(p.date).toISOString().slice(0,10)!==p.date||!isUsMarketSessionDay(p.date)||p.date>account.adoption.sourceSessionDate||!Number.isSafeInteger(p.shares)||p.shares<=0||!Number.isFinite(p.cost)||p.cost<=0)throw new Error('Valid dated purchase shares and cost required');
   return {date:p.date,shares:p.shares,cost:p.cost};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const totalShares=purchases.reduce((sum,p)=>sum+p.shares,0),totalCost=purchases.reduce((sum,p)=>sum+p.cost,0);
  if(!adopted.length||Math.abs(totalShares-shares)>1e-7||Math.abs(totalCost/totalShares-cost/shares)>.02)throw new Error('Purchase evidence does not match the adopted shares and average cost: '+input.symbol);
  positions.push({symbol:input.symbol,stage:input.stage,purchases,source:'owner-confirmed-brokerage-evidence',openingShares:totalShares,openingCost:totalCost});
 }
 const merged=[...(account.positionContext||[]).filter(p=>!seen.has(p.symbol)),...positions].sort((a,b)=>a.symbol.localeCompare(b.symbol));
 if(JSON.stringify(merged)===JSON.stringify(account.positionContext||[]))return account;
 return {...account,revision:account.revision+1,positionContext:merged,contextCorrections:[...(account.contextCorrections||[]),{at:now.toISOString(),revision:account.revision+1,previous:account.positionContext||[],current:merged}]};
}

export function c1PositionContextExplanation(context,currentShares){
 if(!context)return '';
 const count=context.purchases.length,dates=context.purchases.map(p=>`${p.shares} shares on ${p.date}`).join('; ');
 const changed=Math.abs(currentShares-context.openingShares)>1e-7;
 return `${changed?'Original entry':context.stage==='full'?'Full position':'Half position'}: ${count} recorded ${count===1?'purchase':'purchases'} (${dates}). ${changed?'The share count has since changed; the original entry history is retained.':context.stage==='half'?'The second entry has not been completed; this does not itself authorize buying the other half.':'The planned position is complete.'}`;
}
