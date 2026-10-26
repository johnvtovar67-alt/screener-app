import {C1_RECENT_MOMENTUM_GATE} from './c1RecentMomentumGate';
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
// Explain only the two existing request diagnostics after a current checked
// review. This changes copy, never a rating, order, gate or verification state.
function purchaseEvidenceReason({symbol,text,decision,openingPlan,report}){
 if(!['MRNA','CRWD'].includes(symbol)||!decision?.current||decision.accountMismatch||!/^\d{4}-\d{2}-\d{2}$/.test(decision.sourceSessionDate||'')||
  report?.contract!=='c1-purchase-diagnostics-v1'||report.status!=='AVAILABLE'||report.executable!==false||
  !['ACCEPTED_INDEX','REQUEST_ACCOUNT_BASELINE'].includes(report.source?.basis)||report.source.sessionDate!==decision.sourceSessionDate||openingPlan?.sourceSessionDate!==decision.sourceSessionDate||
  openingPlan?.providerVerified!==true||report.review?.openingPlanAvailable!==true||report.review.providerVerified!==true||
  report.collection?.status!=='RETURNED')return null;
 const at=Date.parse(report.collection.receiptObservedAt),planAt=Date.parse(openingPlan.observedAt);
 if(!Number.isFinite(at)||at!==planAt)return null;
 const rows=(Array.isArray(report.tickers)?report.tickers:[]).filter(row=>row?.symbol===symbol),reviews=(Array.isArray(openingPlan.additionalSwingCapacity?.reviews)?openingPlan.additionalSwingCapacity.reviews:[]).filter(row=>row?.symbol===symbol);
 if(rows.length!==1||reviews.length!==1||reviews[0].reason!==text)return null;
 const row=rows[0];
 if(row.source?.signalPresent!==true||!['SIGNALS','POSITION_SIGNALS'].includes(row.source.signalSource))return null;
 if(symbol==='MRNA'&&text==='Current quote verification is incomplete; fresh capital is paused.'&&
  row.capacityReview?.reasonCode==='QUOTE_VERIFICATION_INCOMPLETE'&&row.nativeQueueIncluded===false&&
  row.opening?.requested===false&&row.opening.observed===false&&row.opening.status==='NOT_REQUESTED'){
  const volatility=row.source?.volatility60Pct,limits=row.source?.volatilityLimits;
  if(Number.isFinite(volatility)&&Array.isArray(limits)&&limits.length>0&&limits.length<=3&&limits.every(limit=>
   Number.isFinite(limit?.maxVolatility60Pct)&&limit.maxVolatility60Pct>0&&limit.componentPredicatePass===false&&volatility>limit.maxVolatility60Pct)){
   const maximum=Math.max(...limits.map(limit=>limit.maxVolatility60Pct));
   return `Accepted 60-session volatility is ${volatility.toFixed(2)}%, above the ${maximum.toFixed(2)}% purchase limit; this stock is outside the C1 purchase queue.`;
  }
 }
 const currentEvent=row.opening?.currentEvent;
 const event=currentEvent&&currentEvent.status!=='UNAVAILABLE'?currentEvent:row.source?.event;
 if(symbol==='CRWD'&&text==='A current material-event block prevents fresh capital.'&&
  row.capacityReview?.reasonCode==='MATERIAL_EVENT_BLOCK'&&row.opening?.observed===true&&row.opening.status==='OBSERVED'&&row.opening.ageWithinLimitPass===true&&
  event?.status==='MANUAL'&&event.blockNewCapital===true&&event.checkComplete===false&&event.eventRiskVerified===false&&(event.state==='UNVERIFIED'||event.independentCurrentEvidence==='UNAVAILABLE'))
  return 'Current event verification is incomplete; purchases remain paused.';
 return null;
}
export function c1PlainDecisionReason({action='',reason='',presentation,position,stock,decision,sourceCandidate,evidence,symbol,purchaseDiagnostics,openingPlan}={}){
 const label=String(action||presentation?.label||'').toUpperCase(),text=String(reason||presentation?.reason||''),stops=stopsFor(position),exit=exitFor(position);
 if(label==='NO PURCHASE'&&!position&&!presentation){const explained=purchaseEvidenceReason({symbol,text,decision,openingPlan,report:purchaseDiagnostics});if(explained)return explained;}
 if(presentation?.stopTriggered===true){
  const hit=position?.stopTriggerEvidence;
  const proof=positive(hit?.low)&&positive(hit?.stop)&&hit?.date?` (recorded low $${hit.low.toFixed(2)} on ${hit.date}${stops.length===1&&stops[0]===hit.stop?'':`, stop $${hit.stop.toFixed(2)}`})`:
   presentation.quoteVerified&&positive(presentation.quotePrice)?` (verified price $${presentation.quotePrice.toFixed(2)})`:'';
  return `${stops.length===1?`Stop triggered at $${stops[0].toFixed(2)}`:'Recorded stop triggered'}${proof}; C1 sell signal; verify Schwab order/fill status.`;
 }
 if(label.includes('VERIFY STOP'))return stops.length===1?`Displayed price suggests a breach of the $${stops[0].toFixed(2)} stop; verify the current quote.`:'Displayed price suggests a stop breach; verify the current quote.';
 if(label.startsWith('SELL')||['EXIT','EXIT CANDIDATE'].includes(label)){
  if(exit==='profit-rank-deterioration')return 'Holding rank deteriorated while profit protection was active; C1 sell signal; verify Schwab order/fill status.';
  if(label.includes('PROFIT')){
   const giveback=(position?.recentMomentumReviews||[]).some(review=>review.available===true&&review.metrics?.verifiedPeak===true&&review.metrics?.meaningfulGiveback===true);
   return giveback?'Verified peak gains were surrendered as momentum weakened; C1 sell signal; verify Schwab order/fill status.':'Recent momentum triggered profit protection; C1 sell signal; verify Schwab order/fill status.';
  }
  if(['rank-deterioration','early-rank-deterioration'].includes(exit))return 'Holding rank no longer qualifies; C1 sell signal; verify Schwab order/fill status.';
  if(label.includes('MOMENTUM'))return 'Recent price momentum deteriorated; C1 sell signal; verify Schwab order/fill status.';
  return `${shortSource(text)?.replace(/[.!?]$/,'')||'An existing exit is queued'}; C1 sell signal; verify Schwab order/fill status.`;
 }
 if(label==='HOLD'){
  if(!presentation&&!position&&!evidence&&shortSource(text))return shortSource(text);
  if(/stale/i.test(text))return 'The completed-session review is stale; refresh before adding.';
  if(/unavailable|no additions/i.test(text))return 'Current momentum evidence is unavailable; additions are paused.';
  if(/momentum.*(review|weak)|weak.*momentum/i.test(text)||evidence?.classification==='Momentum Weakening')return 'Momentum weakening; no sell signal confirmed.';
  const reviews=(position?.recentMomentumReviews||[]).filter(review=>review.available===true);
  if(reviews.some(review=>review.holdingStatus==='recovering'||review.metrics?.recovery===true))return 'Recent momentum is recovering; no sell signal confirmed.';
  if(reviews.some(review=>review.state?.profitProtectionArmed)||(position?.reviewRules||[]).some(rule=>rule.profitProtectionArmed===true))return 'No sell signal is confirmed.';
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
 if(/brokerage cash.*(earlier Eastern date|stale|needs an update)/i.test(text))return 'Brokerage cash is stale; update the current broker balance before buying.';
 if(/strategy cash.*(exhausted|cannot fund|insufficient)/i.test(text))return 'Refresh the current purchase-funding review; historical accounting cash is not the brokerage funding limit.';
 if(/brokerage cash.*insufficient/i.test(text))return 'Available brokerage cash cannot fund this purchase.';
 if(/insufficient.*cash|cash.*insufficient|allocation cash cannot fund/i.test(text))return 'Available cash cannot fund this purchase.';
 if(/brokerage cash.*(required|update|balance)|enter.*brokerage cash/i.test(text))return 'Update brokerage cash before making a purchase.';
 if(/recent.*momentum|MACD/i.test(text))return 'Recent momentum has not cleared the entry gate.';
 if(text==='Current event verification is incomplete; purchases remain paused.')return text;
 if(/event|acquisition/i.test(text))return 'An unresolved company event blocks new capital.';
 if(/below.*selected|outside.*entry|higher.rank|waiting.*rank/i.test(text))return 'Higher-ranked candidates currently take priority.';
 if(/target.*complete|planned.*complete|full position/i.test(text))return 'The planned position is complete; no additional shares are scheduled.';
 if(/stale|unavailable|verification|paused|refresh|incomplete|missing|no detailed/i.test(text))return 'Current entry evidence needs verification; purchases are paused.';
 return shortSource(text)||'No checked purchase quantity is available for this stock.';
}
export function c1DecisionTrigger({action='',reason='',presentation,position,stock,decision,opportunity,sourceCandidate}={}){
 const label=String(action||presentation?.label||'').toUpperCase(),text=String(reason||decision?.reason||''),stops=stopsFor(position);
 if(label.startsWith('SELL')||['EXIT','EXIT CANDIDATE'].includes(label))return 'C1 sell signal; verify Schwab order/fill status and execution price.';
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
 if(evidence?.status==='pending')return 'Awaiting first completed-session holding review.';
 if(evidence?.status==='stale')return 'The completed-session momentum review is stale.';
 if(!['available','partial'].includes(evidence?.status))return 'Verified momentum evidence is unavailable.';
 if(evidence?.classification==='Momentum Accelerating')return 'Recent price momentum is strengthening.';
 if(evidence?.classification==='Momentum Intact')return 'Recent price momentum remains supported.';
 if(evidence?.classification==='Momentum Weakening')return 'Recent price momentum is weakening.';
 if(evidence?.classification==='Exit Risk')return 'An existing exit or stop risk requires attention.';
 return 'Verified momentum evidence is unavailable.';
}

// Read-only timing copy. Subtraction formats remaining confirmations/sessions;
// it never counts dates, changes counters, evaluates signals or selects exits.
export function c1HoldingTiming({position,presentation,current=false,evidence}={}){
 const rules=position?.reviewRules||[];
 if(!position||!current||evidence?.status==='stale'||!rules.length)return [c1CompactMomentumEvidence(evidence)];
 const count=value=>Number.isSafeInteger(value)&&value>=0;
 const progress=(value,total)=>count(value)&&Number.isSafeInteger(total)&&total>0?`${value}/${total} · ${Math.max(0,total-value)} remaining`:null;
 const grouped=(label,items)=>{
  const groups=new Map();
  for(const {sleeve,text} of items)if(text){if(!groups.has(text))groups.set(text,[]);groups.get(text).push(sleeve);}
  return [...groups].map(([text,sleeves])=>`${label}: ${text}${groups.size>1?' ('+sleeves.join('/')+')':''}`);
 };
 const lines=grouped('Holding period',rules.map(r=>({sleeve:r.sleeve,text:progress(r.heldSessions,r.minimumHold)?.replace(' · ',' sessions · ')||'unavailable'})));
 const stop= presentation?.stopTriggered===true||position.exits?.some(e=>e.reason==='initial-stop');
 const closes=rules.every(r=>Number.isFinite(r.close)&&r.close>0),hasStops=position.stops?.length&&position.stops.every(s=>positive(s.price));
 lines.push('Stop: '+(stop?'triggered':hasStops&&presentation?.quoteVerified?'not triggered':hasStops&&closes?'not triggered at last C1 close':'verification unavailable'));
 const recent=position.recentMomentumReviews||[];
 lines.push(...grouped('Profit protection',rules.map(r=>{
  const state=recent.find(x=>x.sleeve===r.sleeve&&x.available===true)?.state;
  return {sleeve:r.sleeve,text:r.profitProtectionArmed===true||state?.profitProtectionArmed===true?'armed, not triggered':typeof r.profitProtectionArmed==='boolean'||typeof state?.profitProtectionArmed==='boolean'?'inactive':'unavailable'};
 })));
 lines.push(...grouped('C1 rank',rules.filter(r=>r.rankVerified!==false).map(r=>({sleeve:r.sleeve,text:Number.isSafeInteger(r.verifiedRank)?`#${r.verifiedRank}`:Number.isSafeInteger(r.eligibleCount)?'outside eligible pool':null}))));
 for(const [label,field,threshold] of [['Rank momentum','earlyStreak','earlyConfirmations'],['Profit rank','profitStreak','profitConfirmations']]){
  lines.push(...grouped(label,rules.filter(r=>r.rankVerified!==false&&count(r[field])&&(field==='earlyStreak'||r.profitProtectionArmed===true)).map(r=>({sleeve:r.sleeve,text:progress(r[field],r[threshold])||'confirmation pending'}))));
 }
 for(const [label,field] of [['Momentum','streak'],['Profit giveback','profitGivebackStreak']]){
  lines.push(...grouped(label,recent.filter(r=>r.available===true&&count(r.state?.[field])&&r.state[field]>0).map(r=>({sleeve:r.sleeve,text:progress(r.state[field],field==='streak'?r.metrics?.confirmations:C1_RECENT_MOMENTUM_GATE.profitProtectionConfirmations)||'confirmation pending'}))));
 }
 if(recent.some(r=>r.available!==true))lines.push('Momentum: review unavailable');
 if(position.exits?.some(e=>['rank-deterioration','early-rank-deterioration','profit-rank-deterioration'].includes(e.reason)))lines.push('Rank/rotation exit: confirmed');
 return lines;
}
