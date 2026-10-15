// Presentation only: read existing decisions/evidence; never select an action,
// recompute a signal, authorize capital, or mutate account facts.
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const stopsFor=position=>[...new Set((position?.stops||[]).map(stop=>stop.price).filter(positive))];
const exitFor=position=>(position?.exits||[]).find(exit=>exit.reason)?.reason||'';
const redirects=text=>/use Opportunities|see Opportunities|account actions/i.test(text);
function shortSource(text){
 const first=String(text||'').trim().match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim()||String(text||'').trim();
 return first&&first.length<=150&&!/MACD|RSI|streak|percentile|fingerprint|SMA|alpha\d|\d+ of \d+|Buy \d+ shares/i.test(first)?first:null;
}
export function c1PlainDecisionReason({action='',reason='',presentation,position,stock,decision,sourceCandidate,evidence}={}){
 const label=String(action||presentation?.label||'').toUpperCase(),text=String(reason||presentation?.reason||''),stops=stopsFor(position),exit=exitFor(position);
 if(presentation?.stopTriggered===true)return stops.length===1?`Stop triggered at $${stops[0].toFixed(2)}; sale pending.`:'Recorded stop triggered; sale pending.';
 if(label.includes('VERIFY STOP'))return stops.length===1?`Displayed price suggests a breach of the $${stops[0].toFixed(2)} stop; verify the current quote.`:'Displayed price suggests a stop breach; verify the current quote.';
 if(label.startsWith('SELL')||['EXIT','EXIT CANDIDATE'].includes(label)){
  if(exit==='profit-rank-deterioration')return 'Holding rank deteriorated while profit protection was active; sale pending.';
  if(label.includes('PROFIT')){
   const giveback=(position?.recentMomentumReviews||[]).some(review=>review.available===true&&review.metrics?.verifiedPeak===true&&review.metrics?.meaningfulGiveback===true);
   return giveback?'Verified peak gains were surrendered as momentum weakened; sale pending.':'Recent momentum triggered profit protection; sale pending.';
  }
  if(['rank-deterioration','early-rank-deterioration'].includes(exit))return 'Holding rank no longer qualifies; sale pending.';
  if(label.includes('MOMENTUM'))return 'Recent price momentum deteriorated; sale pending.';
  return shortSource(text)||'An existing exit is queued; sale pending.';
 }
 if(label==='HOLD'){
  if(!presentation&&!position&&!evidence&&shortSource(text))return shortSource(text);
  if(/stale/i.test(text))return 'The completed-session review is stale; refresh before adding.';
  if(/unavailable|no additions/i.test(text))return 'Current momentum evidence is unavailable; additions are paused.';
  if(/momentum.*(review|weak)|weak.*momentum/i.test(text)||evidence?.classification==='Momentum Weakening')return 'Momentum weakening; no sell signal confirmed.';
  const reviews=(position?.recentMomentumReviews||[]).filter(review=>review.available===true);
  if(reviews.some(review=>review.holdingStatus==='recovering'||review.metrics?.recovery===true))return 'Recent momentum is recovering; no sell signal confirmed.';
  if(reviews.some(review=>review.state?.profitProtectionArmed)||(position?.reviewRules||[]).some(rule=>rule.profitProtectionArmed===true))return 'Profit protection is active; no sale is confirmed.';
  if(reviews.length||['Momentum Intact','Momentum Accelerating'].includes(evidence?.classification))return 'Recent momentum supports holding; no exit is confirmed.';
  if(stops.length===1)return `Recorded stop remains $${stops[0].toFixed(2)}; no sell signal is confirmed.`;
  return shortSource(text)||'No current holding review is available; refresh before adding.';
 }
 if(['BUY','STRONG BUY','ADD'].includes(label)){
  const gate=sourceCandidate?.recentMomentumGate;
  if(gate?.available===true&&gate.entryAllowed===true)return gate.metrics?.recovery===true?'Recent price momentum recovered and the entry checks passed.':'Historical strength and recent momentum qualify this purchase.';
  return shortSource(text)||'The selected momentum setup qualifies for the checked purchase.';
 }
 if(['TRIM','REDUCE'].includes(label))return shortSource(text)||'The existing risk plan calls for reducing this position.';
 if(label==='ROTATE')return shortSource(text)||'A higher-priority investment has qualified for this capital.';
 if(label==='CASH')return 'Cash is reserved for the next qualifying C1 entry.';
 if(redirects(text))return 'See Opportunities for the current C1 purchase decision.';
 if(/all three.*slots|position slots|slots.*allocated/i.test(text))return 'All C1 position slots are occupied.';
 if(/insufficient.*cash|cash.*insufficient|allocation cash cannot fund/i.test(text))return 'Available cash cannot fund this purchase.';
 if(/brokerage cash.*(required|update|balance)|enter.*brokerage cash/i.test(text))return 'Update brokerage cash before making a purchase.';
 if(/recent.*momentum|MACD/i.test(text))return 'Recent momentum has not cleared the entry gate.';
 if(/event|acquisition/i.test(text))return 'An unresolved company event blocks new capital.';
 if(/below.*selected|outside.*entry|higher.rank|waiting.*rank/i.test(text))return 'Higher-ranked candidates currently take priority.';
 if(/target.*complete|planned.*complete|full position/i.test(text))return 'The planned position is complete; no additional shares are scheduled.';
 if(/stale|unavailable|verification|paused|refresh|incomplete|missing|no detailed/i.test(text))return 'Current entry evidence needs verification; purchases are paused.';
 return shortSource(text)||'No checked purchase quantity is available for this stock.';
}
export function c1DecisionTrigger({action='',reason='',presentation,position,stock,decision,opportunity,sourceCandidate}={}){
 const label=String(action||presentation?.label||'').toUpperCase(),text=String(reason||decision?.reason||''),stops=stopsFor(position);
 if(label.startsWith('SELL')||['EXIT','EXIT CANDIDATE'].includes(label))return 'Sale pending; verify the execution price.';
 if(label.includes('VERIFY STOP'))return stops.length===1?`Recorded stop: $${stops[0].toFixed(2)}; a verified quote is required.`:'A verified current quote is required.';
 if(position)return stops.length===1?`Recorded stop: $${stops[0].toFixed(2)}.`:stops.length?'Multiple recorded stops; review the account plan.':'No recorded stop is available.';
 if(redirects(text)||decision?.source==='c1-actual-account')return 'Use Opportunities for checked Buy/Add quantities.';
 if(/insufficient.*cash|cash.*insufficient|position slots|slots.*allocated/i.test(text))return 'Cash or an available position slot is required.';
 if(positive(opportunity?.order?.estimatedPrice))return `Opening reference: $${opportunity.order.estimatedPrice.toFixed(2)}.`;
 const invalidation=stock?.riskPlan?.invalidationPrice??stock?.recommendation?.riskPlan?.invalidationPrice;
 if(positive(invalidation))return `Setup invalidation: $${invalidation.toFixed(2)}.`;
 if(sourceCandidate?.recentMomentumGate?.entryAllowed===false)return 'Recent momentum must recover before a new entry.';
 const next=shortSource(decision?.nextTrigger);
 return next||'No verified entry trigger is available.';
}
export function c1CompactMomentumEvidence(evidence){
 if(evidence?.status==='stale')return 'The completed-session momentum review is stale.';
 if(!['available','partial'].includes(evidence?.status))return 'Verified momentum evidence is unavailable.';
 if(evidence?.classification==='Momentum Accelerating')return 'Recent price momentum is strengthening.';
 if(evidence?.classification==='Momentum Intact')return 'Recent price momentum remains supported.';
 if(evidence?.classification==='Momentum Weakening')return 'Recent price momentum is weakening.';
 if(evidence?.classification==='Exit Risk')return 'An existing exit or stop risk requires attention.';
 return 'Verified momentum evidence is unavailable.';
}
