// Read-only UI copy. This module never selects an action, validates evidence,
// authorizes capital, or changes the decision/evidence supplied by the engine.
export function c1PlainDecisionReason({action='',reason='',presentation,position}={}){
 const label=String(action||presentation?.label||'').toUpperCase();
 const text=String(reason||presentation?.reason||'');
 if(presentation?.stopTriggered===true){
  const stops=[...new Set((position?.stops||[]).map(stop=>stop.price).filter(price=>typeof price==='number'&&Number.isFinite(price)&&price>0))];
  return stops.length===1?`Stop triggered at $${stops[0].toFixed(2)}; sale pending.`:'Recorded stop triggered; sale pending.';
 }
 if(label.includes('VERIFY STOP'))return 'Displayed price suggests a stop breach; verify the current price.';
 if(label.startsWith('SELL')||['EXIT','EXIT CANDIDATE'].includes(label)){
  if(label.includes('PROFIT'))return 'Recent weakness is putting gains at risk; sale pending.';
  if(label.includes('MOMENTUM'))return 'Recent momentum has weakened; sale pending.';
  return 'The existing sell recommendation remains pending.';
 }
 if(label==='HOLD'){
  if(/momentum.*(review|weak)|weak.*momentum/i.test(text))return 'Momentum weakening; no sell signal confirmed.';
  if(/stale|unavailable|no additions/i.test(text))return 'Current information needs verification; no new purchase is cleared.';
  return 'No sell signal is confirmed.';
 }
 if(['BUY','STRONG BUY','ADD'].includes(label))return label==='ADD'?'Current checks support adding to this position.':'Current checks support this purchase.';
 if(['TRIM','REDUCE'].includes(label))return 'Reduce this position under the existing risk recommendation.';
 if(label==='ROTATE')return 'Move capital to the higher-priority opportunity.';
 if(['REVIEW','VERIFICATION NEEDED','REFRESH REQUIRED','PRICE/STOP REVIEW','STOP REVIEW'].includes(label))return 'Verify the account and current price before taking action.';
 if(label==='CASH')return 'Cash remains available for a qualifying opportunity.';
 if(/use Opportunities|see Opportunities|account actions/i.test(text))return 'See Opportunities for the current C1 purchase decision.';
 if(/all three.*slots|position slots|slots.*allocated/i.test(text))return 'All C1 position slots are occupied.';
 if(/insufficient.*cash|cash.*insufficient|allocation cash cannot fund/i.test(text))return 'Available cash cannot fund this purchase.';
 if(/brokerage cash.*(required|update|balance)|enter.*brokerage cash/i.test(text))return 'Update brokerage cash before making a purchase.';
 if(/recent.*momentum|MACD/i.test(text))return 'Recent momentum does not support a purchase.';
 if(/event|acquisition/i.test(text))return 'An unresolved company event prevents a purchase.';
 if(/stale|unavailable|verification|paused|refresh|incomplete|missing/i.test(text))return 'Current information is insufficient for a purchase.';
 return 'The stock does not currently qualify for a purchase.';
}
