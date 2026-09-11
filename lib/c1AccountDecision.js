import {latestCompletedMarketSessionDay} from './marketSession';

const explanations={
 'rank-deterioration':'Momentum rank has fallen outside the C1 holding range after the minimum holding period.',
 'portfolio-drawdown-stop':'The C1 portfolio loss limit has triggered; the remaining exit is pending.',
 'initial-stop':'The original C1 stop has triggered; the remaining exit is pending.',
 'universe-removal':'The position has left the observed C1 index universe.',
 'time-stop':'The C1 holding-time limit has been reached.'
};
// Both views consume these rows. They never calculate a separate position
// action from the legacy broad screener or its model portfolio weights.
export function buildC1AccountDecision({continued,sourceHash,revision,now=new Date()}={}) {
 if(continued?.contract!=='c1-actual-account-continuation-v1'||!sourceHash||!Number.isSafeInteger(revision))throw new Error('Continued account and input identity required');
 const current=continued.sourceSessionDate===latestCompletedMarketSessionDay(now),positions=new Map(),candidates=new Map();
 for(const [sleeve,run] of Object.entries(continued.sleeves)){
  const book=continued.books[sleeve];
  for(const [symbol,p] of Object.entries(book.positions)){
   if(!positions.has(symbol))positions.set(symbol,{symbol,shares:0,totalCost:0,openedAt:p.openedAt,exits:[],stops:[]});
   const row=positions.get(symbol),model=run.openPositions.find(m=>m.symbol===symbol);
   row.inheritedRiskOnly=model?.inheritedRiskOnly===true;row.shares+=p.shares;row.totalCost+=p.shares*p.avgCost;row.openedAt=row.openedAt<p.openedAt?row.openedAt:p.openedAt;
   row.stops.push({sleeve,shares:p.shares,price:model?.stopPrice??null});
  }
  for(const [index,order] of run.pendingDecisions.entries()){
   if(order.side==='sell'&&positions.has(order.symbol))positions.get(order.symbol).exits.push({sleeve,shares:book.positions[order.symbol]?.shares||0,reason:order.reason});
   if(order.side==='buy'&&!['MSTR','SCHW'].includes(order.symbol)){
    if(!candidates.has(order.symbol))candidates.set(order.symbol,{symbol:order.symbol,priority:index,sleeves:[]});
    const row=candidates.get(order.symbol);row.priority=Math.min(row.priority,index);row.sleeves.push(sleeve);
   }
  }
 }
 const rows=[...positions.values()].map(p=>({...p,avgCost:p.totalCost/p.shares,
  action:current?(p.exits.length?'Exit candidate':p.inheritedRiskOnly?'Risk monitoring':'Hold'):'Refresh required',
  reason:!current?'Refresh the dated C1 account analysis.':p.exits.length?[...new Set(p.exits.map(e=>explanations[e.reason]||'A C1 exit condition has triggered.'))].join(' '):p.inheritedRiskOnly?'Inherited holding outside C1 entry coverage. Its value, position size and existing loss limits remain included; no C1 momentum hold, add or rank-based exit is inferred.':'No C1 exit is queued for the next session. Existing holding dates and stops remain in effect.'}));
 return {contract:'c1-account-decision-v1',decisionId:`${sourceHash}:${revision}`,revision,sourceSessionDate:continued.sourceSessionDate,current,
  status:current?'account-analysis':'stale',positions:rows,opportunities:current?[...candidates.values()].sort((a,b)=>a.priority-b.priority||a.symbol.localeCompare(b.symbol)):[],
  requiredOpeningSymbols:[...new Set(['SPY','QQQ',...rows.map(p=>p.symbol),...Object.values(continued.sleeves).flatMap(r=>r.pendingDecisions.map(o=>o.symbol))])],
  actualCash:continued.actualCash,executable:false,
  explanation:'Completed-session C1 analysis of your actual account. Entry candidates must pass next-opening price, cash and concentration checks before becoming orders.'};
}
export function c1AccountPositionDecision(decision,symbol){
 if(decision?.contract!=='c1-account-decision-v1')return null;
 const row=decision.positions.find(p=>p.symbol===symbol);
 return row?{action:row.action,reason:row.reason,source:'c1-actual-account',decisionId:decision.decisionId}:null;
}
export function c1AccountMatchesPortfolio(decision,portfolio){
 if(!decision||!Array.isArray(portfolio))return false;
 const cashSymbols=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
 const held=portfolio.filter(p=>p.role==='Swing'&&!cashSymbols.has(p.symbol)&&Number(p.shares)>0);
 if(held.length!==decision.positions.length)return false;
 if(held.some(p=>{const actual=decision.positions.find(r=>r.symbol===p.symbol);return !actual||Math.abs(Number(p.shares)-actual.shares)>1e-7||Math.abs(Number(p.avgCost)-actual.avgCost)>.02||String(p.openedAt||'').slice(0,10)!==actual.openedAt;}))return false;
 const cash=portfolio.filter(p=>p.role==='Swing'&&cashSymbols.has(p.symbol)).reduce((sum,p)=>sum+Number(p.shares)*Number(p.avgCost||1),0);
 return Number.isFinite(cash)&&Math.abs(cash-decision.actualCash)<.005;
}
export function applyC1OpeningPlan(decision,plan){
 if(!decision.current||plan?.providerVerified!==true||plan.sourceSessionDate!==decision.sourceSessionDate)return decision;
 return {...decision,decisionId:decision.decisionId+':'+plan.observedAt,positions:decision.positions.map(p=>{
  const orders=plan.orders.filter(o=>o.symbol===p.symbol&&!o.condition),exits=orders.filter(o=>o.side==='sell'),entries=orders.filter(o=>o.side==='buy');
  if(exits.length)return {...p,action:'Exit candidate',reason:[...new Set(exits.map(o=>explanations[o.reason]||'A C1 exit condition has triggered.'))].join(' ')};
  if(entries.length)return {...p,action:'Add candidate',reason:'The C1 opening plan includes an entry in another sleeve. Use the proposed quantity and verify the current execution price.'};
  return p;
 })};
}
