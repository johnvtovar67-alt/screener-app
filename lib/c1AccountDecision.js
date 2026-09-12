import {c1PositionContextExplanation} from './c1PositionContext';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {latestCompletedMarketSessionDay,marketSessionDistance} from './marketSession';

const explanations={
 'rank-deterioration':'Momentum rank has fallen outside the C1 holding range after the minimum holding period.',
 'portfolio-drawdown-stop':'The C1 portfolio loss limit has triggered; the remaining exit is pending.',
 'initial-stop':'The original C1 stop has triggered; the remaining exit is pending.',
 'universe-removal':'The position has left the observed C1 index universe.',
 'time-stop':'The C1 holding-time limit has been reached.'
};
// Explain the actual account model state; never infer original recommendation
// provenance from current index coverage or manufacture a momentum rank.
export function c1AccountHoldingExplanation(position,sourceSessionDate){
 const rules=position.reviewRules||[],parts=[];
 const marks=[...new Set(rules.map(r=>r.close).filter(p=>Number.isFinite(p)&&p>0))];
 const close=marks.length===1?marks[0]:null,basis=position.avgCost??position.totalCost/position.shares;
 if(close!==null&&Number.isFinite(basis)&&basis>0){
  const change=(close/basis-1)*100;
  parts.push(`${change>=0?'Up':'Down'} ${Math.abs(change).toFixed(2)}% from average cost at the ${sourceSessionDate} close.`);
 }
 if(position.exits.length)parts.push([...new Set(position.exits.map(e=>explanations[e.reason]||'An exit condition has triggered.'))].join(' '));
 else parts.push(`No exit is queued as of ${sourceSessionDate}.`);
 const context=c1PositionContextExplanation(position.entryContext,position.shares);
 if(context)parts.push(context);
 if(position.inheritedRiskOnly&&!position.holdingRank){
  parts.push('The account model excludes this holding from its current ranking universe. Its price and recorded stops are still monitored; exclusion from ranking is not a sell signal.');
 }else{
  if(position.holdingRank){
   const ranks=Object.values(position.holdingRank),labels=[...new Set(ranks.map(r=>r.eligible?`rank ${r.rank} of ${r.eligibleCount}`:'outside the eligible holding range'))];
   parts.push(`Momentum review against the dated index reference: ${labels.join('; ')}.`);
  }
  const descriptions=[...new Set(rules.filter(r=>Number.isFinite(r.heldSessions)&&Number.isFinite(r.minimumHold)).map(r=>r.heldSessions<r.minimumHold?
   `${r.heldSessions} of ${r.minimumHold} trading sessions have elapsed before rank-based selling is eligible.`:
   `The ${r.minimumHold}-session minimum has elapsed; the rank-exit rule checks for a fall outside the top ${r.exitBuffer}.`))];
  parts.push(...descriptions);
 }
 const stops=[...new Set(position.stops.map(s=>s.price).filter(p=>Number.isFinite(p)&&p>0))].sort((a,b)=>a-b);
 if(stops.length)parts.push(`Recorded ${stops.length===1?'stop':'stops'}: ${stops.map(p=>'$'+p.toFixed(2)+(close!==null?` (${(Math.abs(close-p)/close*100).toFixed(2)}% ${p<=close?'below':'above'} the latest close)`:'' )).join(', ')}. Stops and portfolio loss limits apply even during the minimum holding period.`);
 else parts.push('No recorded stop price is available; refresh the account before using a stop level.');

 if(marks.length===1)parts.push(`Latest account close: $${marks[0].toFixed(2)} (${sourceSessionDate}).`);
 return parts.join(' ');
}
// Both views consume these rows. They never calculate a separate position
// action from the legacy broad screener or its model portfolio weights.
export function buildC1AccountDecision({continued,sourceHash,revision,now=new Date(),positionContext=[]}={}) {
 if(continued?.contract!=='c1-actual-account-continuation-v1'||!sourceHash||!Number.isSafeInteger(revision))throw new Error('Continued account and input identity required');
 const current=continued.sourceSessionDate===latestCompletedMarketSessionDay(now),positions=new Map(),candidates=new Map();
 for(const [sleeve,run] of Object.entries(continued.sleeves)){
  const book=continued.books[sleeve];
  for(const [symbol,p] of Object.entries(book.positions)){
   if(!positions.has(symbol))positions.set(symbol,{symbol,shares:0,totalCost:0,openedAt:p.openedAt,exits:[],stops:[],reviewRules:[]});
   const row=positions.get(symbol),model=run.openPositions.find(m=>m.symbol===symbol);
   row.inheritedRiskOnly=row.inheritedRiskOnly===true||model?.inheritedRiskOnly===true;row.shares+=p.shares;row.totalCost+=p.shares*p.avgCost;row.openedAt=row.openedAt<p.openedAt?row.openedAt:p.openedAt;
   row.stops.push({sleeve,shares:p.shares,price:model?.stopPrice??null});
   const config=run.config||C1_FROZEN_OPTIONS[sleeve];
   row.reviewRules.push({sleeve,heldSessions:marketSessionDistance(p.openedAt,continued.sourceSessionDate),minimumHold:config?.rankedMinimumHoldSessions,exitBuffer:config?.rankedExitBuffer,close:model?.lastPrice??null});
  }
  for(const [index,order] of run.pendingDecisions.entries()){
   if(order.side==='sell'&&positions.has(order.symbol))positions.get(order.symbol).exits.push({sleeve,shares:book.positions[order.symbol]?.shares||0,reason:order.reason});
   if(order.side==='buy'&&!['MSTR','SCHW'].includes(order.symbol)){
    if(!candidates.has(order.symbol))candidates.set(order.symbol,{symbol:order.symbol,priority:index,sleeves:[]});
    const row=candidates.get(order.symbol);row.priority=Math.min(row.priority,index);row.sleeves.push(sleeve);
   }
  }
 }
 const rows=[...positions.values()].map(p=>({...p,entryContext:positionContext.find(c=>c.symbol===p.symbol)||null,holdingRank:continued.holdingRankings?.[p.symbol]||null})).map(p=>({...p,avgCost:p.totalCost/p.shares,
  action:current?(p.exits.length?'Exit candidate':p.inheritedRiskOnly&&!p.holdingRank?'Price/stop review':'Hold'):'Refresh required',
  reason:!current?'Refresh the dated C1 account analysis.':c1AccountHoldingExplanation(p,continued.sourceSessionDate)}));
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
  if(exits.length)return {...p,action:'Exit candidate',reason:c1AccountHoldingExplanation({...p,exits:exits.map(o=>({reason:o.reason}))},decision.sourceSessionDate)};
  if(entries.length)return {...p,action:'Add candidate',reason:'The C1 opening plan includes an entry in another sleeve. Use the proposed quantity and verify the current execution price.'};
  return p;
 })};
}
