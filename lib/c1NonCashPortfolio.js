// Presentation reconciliation and purchase-evidence lookup only. No server dependencies.
const clone=x=>JSON.parse(JSON.stringify(x));
const facts=p=>({symbol:p.symbol,role:p.role,shares:Number(p.shares),avgCost:Number(p.avgCost),openedAt:String(p.openedAt||'').slice(0,10)});
// The existing owner-confirmed half/full entry-status mechanism can describe
// these adopted balances too; it still cannot create a Buy or alter ownership.
export function c1AdoptedOwnership(account,symbol){
 const event=account.adoption.nonCashHoldings?.find(e=>e.original.symbol===symbol);
 if(event){const p=facts(event.original);return [{shares:p.shares,avgCost:p.avgCost,cost:p.shares*p.avgCost,openedAt:p.openedAt}];}
 return Object.values(account.adoption.seeds).flatMap(seed=>seed.positions.filter(p=>p.symbol===symbol).map(p=>({shares:p.shares*seed.actualDollarsPerModelDollar,avgCost:p.entryPrice,cost:p.entryPrice*p.shares*seed.actualDollarsPerModelDollar,openedAt:p.openedAt})));
}
// A saved C1 receipt is authoritative even if portfolio sync failed after the
// account commit. Old Core rows are removed only when original facts match.
export function resolveC1NonCashPortfolio(portfolio,decision){
 const events=decision?.nonCashAdoptions||[];if(!events.length)return portfolio;
 let next=portfolio;
 for(const e of events){
  const core=next.filter(p=>p.symbol==='MRNA'&&p.role==='Core');
  if(!core.length){
   const prior=next.filter(p=>p.symbol==='MRNA'&&p.role==='Swing');
   // The exact initial adopted snapshot can outlive a failed fill sync.
   // Unrecognized/manual quantities still use the normal mismatch gate.
   if(prior.length!==1||JSON.stringify({...facts(prior[0]),role:'Core'})!==JSON.stringify(facts(e.original)))continue;
  }
  if(core.length&&(core.length!==1||next.some(p=>p.symbol==='MRNA'&&p.role!=='Core')))throw new Error('Conflicting MRNA rows require ownership review');
  if(core.some(p=>JSON.stringify(facts(p))!==JSON.stringify(facts(e.original))))throw new Error('Saved Core MRNA differs from the adoption receipt; review ownership before syncing');
  next=next.filter(p=>p.symbol!=='MRNA');
  const owned=decision.positions.find(p=>p.symbol==='MRNA');
  if(owned)next=[...next,{...clone(e.original),symbol:'MRNA',role:'Swing',shares:owned.shares,avgCost:owned.avgCost,openedAt:owned.openedAt}];
 }
 return next;
}
