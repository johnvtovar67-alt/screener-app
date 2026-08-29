const num=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f};
const normalize=v=>{const x=String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase();if(x==='STRONG BUY')return'Strong Buy';if(x.includes('BUY'))return'Buy';if(x.includes('WATCH')||x.includes('STARTER')||x.includes('SETUP')||x==='BREAKOUT'||x==='NEAR MISS')return'Watch';return'Avoid'};
const money=v=>Number.isFinite(+v)?`$${(+v).toFixed(2)}`:'';
const rec=s=>s?.recommendation&&typeof s.recommendation==='object'?s.recommendation:{};
const expert=s=>rec(s)?.expertDecision||s?.expertDecision||{};
const plan=s=>s?.riskPlan??rec(s)?.riskPlan??{};

export function relativeCapitalScore(s={}){
  const r=rec(s),e=expert(s);
  return num(r.capitalScore??s.capitalScore??e.capitalScore)*.45+num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore)*.30+num(s.relativeStrengthScore??r.relativeStrengthScore)*.15+num(s.technicalScore??r.technicalScore)*.10;
}
function forwardUpsidePct(s={}){
  const px=num(s.price??s.currentPrice??s.lastPrice??s.close,0),trim=num(plan(s)?.firstTrimPrice,0);
  return px>0&&trim>px?((trim-px)/px)*100:null;
}
function wholeShareFriction(s={}){
  const px=num(s.price??s.currentPrice??s.lastPrice??s.close,0);
  if(px<=500)return 0;
  return Math.min(8,(px-500)/250);
}
export function capitalEfficiencyScore(s={}){
  const quality=relativeCapitalScore(s),upside=forwardUpsidePct(s);
  const upsideScore=upside===null?quality:Math.min(100,Math.max(0,upside*4));
  return quality*.75+upsideScore*.25-wholeShareFriction(s);
}
function absoluteAction(s={}){return normalize(rec(s)?.displayLabel??rec(s)?.label??rec(s)?.recommendation??rec(s)?.tradeAction??s?.action)}
function scoringGate(s={}){return rec(s)?.gateSummary||s?.gateSummary||{};}
function specificWatchReason(s={}){
  const r=rec(s),e=expert(s),m=e?.metrics||{},g=scoringGate(s),parts=[];
  const t=s?.entryTiming||r?.entryTiming;
  if(t&&t.available===false)return t.reason||'Short-term entry timing could not be verified; wait for a verified timing read before deploying capital.';
  if(t&&t.pass===false)return t.reason||'Short-term timing has not reset enough for a fresh entry.';
  if(m.quoteFreshnessPass===false)parts.push('Live quote freshness is insufficient for a new-capital decision.');
  if(m.fundamentalsPass===false)parts.push('Fundamental verification is incomplete, so fresh capital remains paused.');
  const label=String(g.entryQualityLabel||r.entryQualityLabel||'');
  if(label==='Extended'||label==='Chase Risk')parts.push(`${label}: the current price is too stretched to chase.`);
  else if(label==='Early Setup')parts.push('Entry structure is still early and has not produced enough confirmation.');
  const payoff=Number(g.payoffRatio);
  if(Number.isFinite(payoff)&&payoff>0&&payoff<1.5)parts.push(`Forward reward-to-risk is only ${payoff.toFixed(2)}x, below the deployment hurdle.`);
  if(Number.isFinite(+g.technicalScore)&&+g.technicalScore<58)parts.push(`Technical confirmation is weak at ${Math.round(+g.technicalScore)}.`);
  if(Number.isFinite(+g.leadershipScore)&&+g.leadershipScore<60)parts.push(`Relative strength is weak at ${Math.round(+g.leadershipScore)}.`);
  if(Number.isFinite(+g.entryQualityScore)&&+g.entryQualityScore<50)parts.push(`Entry quality is only ${Math.round(+g.entryQualityScore)}.`);
  if(Number.isFinite(+g.riskScore)&&+g.riskScore>82)parts.push(`Risk score is elevated at ${Math.round(+g.riskScore)}.`);
  if(Number.isFinite(+g.extensionRisk)&&+g.extensionRisk>62)parts.push(`Extension risk is elevated at ${Math.round(+g.extensionRisk)}.`);
  if(Number.isFinite(+g.businessQuality)&&+g.businessQuality<55&&String(s?.fundamentalDataStatus||'').toLowerCase()!=='deferred')parts.push(`Business-quality score is below the fresh-capital floor at ${Math.round(+g.businessQuality)}.`);
  if(!parts.length&&e?.failures?.length){const useful=e.failures.find(x=>!String(x).startsWith('Base entry gate'));if(useful)parts.push(useful);}
  return parts.length?parts.slice(0,2).join(' '):'The setup is near the research list, but it still lacks enough verified entry, technical, or payoff confirmation to fund.';
}
function baseReason(s={}){const r=rec(s),e=expert(s),raw=r.decisionWhy||e.decisionWhy||r.actionSummary||r.dominantReason||'No new capital until the setup improves.';return /^Base entry gate/i.test(raw)||/^No new capital until the setup improves/i.test(raw)?specificWatchReason(s):raw;}
function baseTiming(s={}){const a=absoluteAction(s),r=rec(s),e=expert(s);return r.decisionTiming||e.timing||(['Strong Buy','Buy'].includes(a)?'Now':a==='Watch'?'Wait for Trigger':'Wait')}
function baseSize(s={}){const a=absoluteAction(s),r=rec(s),e=expert(s);return r.positionSize||e.size||(a==='Strong Buy'?'Full':a==='Buy'?'Partial':'None')}
function priceTrigger(s={}){const p=plan(s),add=Number(p.addAbovePrice);return Number.isFinite(add)&&add>0?`Trigger above ${money(add)}`:'Wait for confirmation'}
function watchTrigger(s={}){
  const r=rec(s),e=expert(s),m=e?.metrics||{},g=scoringGate(s),t=s?.entryTiming||r?.entryTiming,label=String(g.entryQualityLabel||r.entryQualityLabel||'');
  if(t&&t.pass===false)return t.chase?'Wait for a controlled pullback or consolidation, then require the timing gate to reconfirm.':'Wait for the short-term timing gate to reset and reconfirm; a higher price alone is not a trigger.';
  if(label==='Extended'||label==='Chase Risk'||m.lateTrend===true)return'Wait for consolidation or a controlled pullback; do not use a higher price by itself as the trigger.';
  if(m.below50)return'Reassess only after a confirmed 50-day trend reclaim with improving momentum.';
  if(Number.isFinite(+g.technicalScore)&&+g.technicalScore<58)return'Reassess when technical confirmation improves into the Buy range.';
  if(Number.isFinite(+g.leadershipScore)&&+g.leadershipScore<60)return'Reassess when relative strength improves enough to clear the Buy standard.';
  const payoff=Number(g.payoffRatio);if(Number.isFinite(payoff)&&payoff>0&&payoff<1.5)return'Reassess only if forward reward-to-risk improves; do not chase a higher price.';
  return'Require Buy-level confirmation with acceptable timing and payoff; a higher price alone is not a trigger.';
}
function planText(s={},action=absoluteAction(s)){const p=plan(s),inv=Number(p.invalidationPrice),trim=Number(p.firstTrimPrice);if(['Strong Buy','Buy'].includes(action)){const left=Number.isFinite(inv)&&inv>0?`Review below ${money(inv)}`:'Define risk before entry';const right=Number.isFinite(trim)&&trim>0?` • Profit review ${money(trim)}`:'';return`${left}${right}`}return watchTrigger(s)}

function freshEntryImpulse(s={}){
  const m=expert(s)?.metrics||{},day=num(m.day??s.dayChangePct??s.changesPercentage,0),vs50=m.vs50==null?null:num(m.vs50),extension=num(m.extension??rec(s)?.extensionRisk??s.extensionRisk,50),rv=m.relativeVolume==null?null:num(m.relativeVolume);
  const hard=day>=5.5||(day>=4&&vs50!==null&&vs50>=8)||(day>=3.5&&extension>=55);
  const strongCap=hard||day>=3.25||(day>=2.5&&vs50!==null&&vs50>=10)||extension>=54;
  const stretchedParticipation=day>=3&&rv!==null&&rv>=1.8;
  return{hard:hard||stretchedParticipation,strongCap:strongCap||stretchedParticipation,day,vs50,extension,relativeVolume:rv};
}
function impulseReason(g={},hard=false){
  const detail=`Today ${g.day>=0?'+':''}${g.day.toFixed(1)}%${g.vs50!==null?`, ${g.vs50.toFixed(1)}% vs 50-day`:''}, extension ${Math.round(g.extension)}.`;
  return hard?`High-quality setup, but the entry is too impulsive to chase. ${detail} Wait for consolidation, a controlled pullback, or a new base before deploying capital.`:`Strong setup, but today's impulse is too large for full size. ${detail} Starter/partial size only; add only after the price proves it can hold the move without immediate mean reversion.`;
}
function strongBuyContinuityEligible(s={}){
  const r=rec(s),e=expert(s),m=e?.metrics||{},current=absoluteAction(s);
  if(current!=='Watch'||freshEntryImpulse(s).strongCap)return false;
  const t=s?.entryTiming||r?.entryTiming;
  // A raw Watch is not included in the bounded historical-timing fetch. Never let
  // continuity manufacture a Buy unless a verified timing pass is actually present.
  if(!t?.available||!t.pass)return false;
  const event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{},eventStatus=String(event?.status||'').toLowerCase();
  if(event?.blockNewCapital||event?.manualCheckRequired||['blocked','manual','caution'].includes(eventStatus))return false;
  if(m.quoteFreshnessPass!==true||m.fundamentalsPass!==true)return false;
  if(e.trendStatus&&e.trendStatus!=='Confirmed')return false;
  if(m.below50||m.below200||m.lateTrend===true||m.severeLateTrend===true||m.forwardAsymmetryPass===false)return false;
  const rv=m.relativeVolume;if(rv!==null&&rv!==undefined&&Number.isFinite(Number(rv))&&Number(rv)<.4)return false;
  const rr=num(m.payoffRatio,0);if(rr>0&&rr<2.0)return false;
  const vs50=m.vs50===null||m.vs50===undefined?null:num(m.vs50,0),vs200=m.vs200===null||m.vs200===undefined?null:num(m.vs200,0),day=num(m.day,0),extension=num(m.extension,50);
  if(extension>=58||(vs50!==null&&vs50>14)||(vs200!==null&&vs200>48)||day>8)return false;
  const thesis=num(r.thesisScore??s.thesisScore??e.thesisScore??s.fundamentalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),raw=num(s.score??s.compositeScore??r.score),technical=num(m.technical??s.technicalScore??r.technicalScore),leadership=num(m.leadership??s.relativeStrengthScore??r.relativeStrengthScore),momentum=num(m.momentum??s.momentumScore??r.momentumScore),entry=num(m.entry??r.entryQualityScore??s.entryQualityScore),risk=num(m.risk??r.riskScore??s.riskScore,50);
  return thesis>=73&&trade>=80&&capital>=77&&raw>=70&&technical>=60&&leadership>=60&&momentum>=52&&entry>=55&&risk<=72;
}
function continuityReason(s={}){const e=expert(s),first=Array.isArray(e?.failures)?e.failures[0]:'';return `High-conviction setup has softened from Strong Buy thresholds but remains Buy-quality without violating the forward-entry rules. Use partial size while full confirmation rebuilds.${first?` Softened factor: ${first}`:''}`;}

export function finalizeStandaloneOpportunityDecision(s={}){
  const rawAction=absoluteAction(s),impulse=freshEntryImpulse(s),hardBlocked=['Strong Buy','Buy'].includes(rawAction)&&hardEntryGateBlocked(s),continuityProtected=!hardBlocked&&strongBuyContinuityEligible(s);
  const impulseBlocked=!hardBlocked&&['Strong Buy','Buy'].includes(rawAction)&&impulse.hard,impulseCapped=!hardBlocked&&rawAction==='Strong Buy'&&impulse.strongCap&&!impulseBlocked;
  const action=hardBlocked?'Watch':impulseBlocked?'Watch':impulseCapped?'Buy':continuityProtected?'Buy':rawAction,score=relativeCapitalScore(s);
  const reason=hardBlocked?specificWatchReason(s):impulseBlocked?impulseReason(impulse,true):impulseCapped?impulseReason(impulse,false):continuityProtected?continuityReason(s):baseReason(s);
  const timing=hardBlocked?'Wait for Verification':impulseBlocked?'Wait for Reset':impulseCapped?'Now':continuityProtected?'Now':baseTiming(s),size=hardBlocked?'None':impulseBlocked?'None':impulseCapped?'Partial':continuityProtected?'Partial':baseSize(s),priority=hardBlocked?'Verification Paused':impulseBlocked?'Wait for Reset':impulseCapped?'Capped Entry':continuityProtected?'High-Conviction Buy':action==='Strong Buy'?'Top Tier':action==='Buy'?'Actionable':action==='Watch'?'Watch':'Avoid';
  const source=hardBlocked?'hard-entry-verification':impulseBlocked?'entry-impulse-block':impulseCapped?'entry-impulse-cap':continuityProtected?'strong-buy-continuity':'standalone';
  const nextTrigger=impulseBlocked?'Wait for consolidation or a controlled pullback before reconsidering fresh capital.':action==='Watch'?watchTrigger(s):planText(s,action);
  return{...s,finalDecision:{action,timing,size,reason,priority,nextTrigger,planText:impulseBlocked?'No chase — wait for the entry to reset.':planText(s,action),relativeCapitalScore:Math.round(score*10)/10,capitalEfficiencyScore:Math.round(capitalEfficiencyScore(s)*10)/10,forwardUpsidePct:forwardUpsidePct(s)===null?null:Math.round(forwardUpsidePct(s)*10)/10,standaloneAction:rawAction,source,continuityProtected,entryImpulse:impulse}};
}
function percentile(values=[],p=.8){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo)}
function actionRank(a){return a==='Strong Buy'?4:a==='Buy'?3:a==='Watch'?1:0}

const STRONG_BUY_MEMORY_KEY='__screenerStrongBuyMemoryV1';
const STRONG_BUY_MEMORY_MS=6.5*60*60*1000;
const BUY_VISIBILITY_MEMORY_MS=36*60*60*1000;
function strongBuyMemory(){const x=globalThis[STRONG_BUY_MEMORY_KEY];return x instanceof Map?x:new Map()}
export function recentStrongBuySymbols(now=Date.now()){const out=[];for(const[symbol,prior]of strongBuyMemory()){if(prior?.action==='Strong Buy'&&!prior?.interruptedAt&&now-Number(prior.earnedAt||0)<=STRONG_BUY_MEMORY_MS)out.push(symbol);}return out;}
function symbolOf(s={}){return String(s.symbol||s.ticker||'').toUpperCase()}
function hardEntryGateBlocked(s={}){
  const r=rec(s),e=expert(s),m=e?.metrics||{},t=s?.entryTiming||r?.entryTiming,event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{},eventStatus=String(event?.status||'').toLowerCase();
  return Boolean(event?.blockNewCapital||event?.manualCheckRequired||['blocked','manual','caution'].includes(eventStatus)||m.quoteFreshnessPass!==true||m.fundamentalsPass!==true||!t?.available||!t.pass);
}
function strongBuyRetentionEligible(s={}){
  const d=s.finalDecision||{},r=rec(s),e=expert(s),m=e?.metrics||{};
  if(d.action!=='Buy'||freshEntryImpulse(s).strongCap)return false;
  const t=s?.entryTiming||r?.entryTiming;if(!t?.available||!t.pass||!t.strongPass)return false;
  const event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{},eventStatus=String(event?.status||'').toLowerCase();
  if(hardEntryGateBlocked(s)||event?.blockNewCapital||event?.manualCheckRequired||['blocked','manual','caution'].includes(eventStatus))return false;
  if(m.quoteFreshnessPass===false||m.fundamentalsPass===false||m.below50||m.below200||m.lateTrend===true||m.severeLateTrend===true||m.forwardAsymmetryPass===false)return false;
  const rr=num(m.payoffRatio,0),rv=m.relativeVolume,vs50=m.vs50===null||m.vs50===undefined?null:num(m.vs50,0),vs200=m.vs200===null||m.vs200===undefined?null:num(m.vs200,0),day=num(m.day,0),extension=num(m.extension,50);
  if(rv!==null&&rv!==undefined&&Number.isFinite(Number(rv))&&Number(rv)<.4)return false;if(rr>0&&rr<2.0)return false;if(extension>=58||(vs50!==null&&vs50>14)||(vs200!==null&&vs200>48)||day>8)return false;
  const thesis=num(r.thesisScore??s.thesisScore??e.thesisScore??s.fundamentalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),raw=num(s.score??s.compositeScore??r.score),technical=num(m.technical??s.technicalScore??r.technicalScore),leadership=num(m.leadership??s.relativeStrengthScore??r.relativeStrengthScore),momentum=num(m.momentum??s.momentumScore??r.momentumScore),entry=num(m.entry??r.entryQualityScore??s.entryQualityScore),risk=num(m.risk??r.riskScore??s.riskScore,50),strongQuality=num(r.strongQualityScore??s.strongQualityScore??e.strongQualityScore,0);
  return strongQuality>=80&&thesis>=74&&trade>=78&&capital>=78&&raw>=74&&technical>=66&&leadership>=66&&momentum>=52&&entry>=55&&risk<=68;
}
function retainStrongBuy(s={}){const d=s.finalDecision||{};return{...s,finalDecision:{...d,action:'Strong Buy',timing:'Now',size:'Full',priority:'Top Tier',reason:'Strong Buy retained. The setup has softened modestly from the entry threshold but remains inside the high-conviction retention band and still passes the forward-entry rules.',source:'strong-buy-hysteresis',hysteresisProtected:true}};}

function capitalConfirmedBuy(s={}){
  const d=s.finalDecision||{},r=rec(s),e=expert(s),m=e?.metrics||{};if(freshEntryImpulse(s).hard||hardEntryGateBlocked(s))return false;if(d.action==='Strong Buy')return true;if(d.action!=='Buy')return false;
  const event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{},eventStatus=String(event?.status||'').toLowerCase();
  if(event?.blockNewCapital||event?.manualCheckRequired||['blocked','manual','caution'].includes(eventStatus))return false;
  if(m.quoteFreshnessPass===false||m.fundamentalsPass===false||m.below50||m.below200||m.lateTrend===true||m.severeLateTrend===true||m.forwardAsymmetryPass===false)return false;
  const trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),technical=num(m.technical??s.technicalScore??r.technicalScore),leadership=num(m.leadership??s.relativeStrengthScore??r.relativeStrengthScore),momentum=num(m.momentum??s.momentumScore??r.momentumScore),entry=num(m.entry??r.entryQualityScore??s.entryQualityScore),risk=num(m.risk??r.riskScore??s.riskScore,50),raw=num(s.score??s.compositeScore??r.score),rr=num(m.payoffRatio,0);
  return trade>=78&&capital>=74&&technical>=64&&leadership>=65&&momentum>=56&&entry>=58&&risk<=72&&raw>=73&&(rr===0||rr>=2.0);
}
function capitalConfirmationWatch(s={}){const d=s.finalDecision||{},peer=relativeCapitalScore(s);return{...s,finalDecision:{...d,action:'Watch',timing:'Wait',size:'None',priority:'Qualified Watch',reason:'The setup reaches the Buy boundary, but it has not cleared the capital-confirmation margin. Hold cash until the signal has enough strength to remain actionable through ordinary intraday noise.',nextTrigger:'Clear the Buy confirmation margin before deploying capital.',planText:'Hold cash — Buy signal is not yet robust enough to fund.',relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(capitalEfficiencyScore(s)*10)/10,standaloneAction:d.standaloneAction||'Buy',source:'capital-confirmation'}};}

function visibleWatchEligible(s={}){
  const r=rec(s),e=expert(s),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),technical=num(s.technicalScore??r.technicalScore),leadership=num(s.relativeStrengthScore??r.relativeStrengthScore??r.leadershipScore),momentum=num(s.momentumScore??r.momentumScore),raw=num(s.score??s.compositeScore??r.score),risk=num(r.riskScore??s.riskScore,50),extension=num(r.extensionRisk??s.extensionRisk,50),eventStatus=String(s?.eventRisk?.status??s?.preTradeCheck?.status??'').toLowerCase();
  const coreNearBuy=capital>=69&&trade>=73&&raw>=68&&risk<=78&&extension<=62,execution=[technical>=58,leadership>=62,momentum>=52].filter(Boolean).length;
  if(eventStatus==='blocked'||eventStatus==='caution')return coreNearBuy&&technical>=57&&leadership>=60&&execution>=2;
  return coreNearBuy&&execution>=2&&(technical>=60||leadership>=64);
}

export function finalizeBroadOpportunityDecisions(rows=[]){
  const now=Date.now(),memory=strongBuyMemory();
  const base=rows.map(finalizeStandaloneOpportunityDecision),actionable=base.filter(s=>['Strong Buy','Buy'].includes(s.finalDecision.action)),scores=actionable.map(capitalEfficiencyScore),best=scores.length?Math.max(...scores):0,cutoff=scores.length>1?Math.max(percentile(scores,.8),best-3):best;
  let finalized=base.map(s=>{const d=s.finalDecision,a=d.action,peer=relativeCapitalScore(s),eff=capitalEfficiencyScore(s),prior=memory.get(symbolOf(s)),recentStrong=prior?.action==='Strong Buy'&&!prior?.interruptedAt&&now-prior.earnedAt<=STRONG_BUY_MEMORY_MS;
    if(a==='Watch'&&d.source==='entry-impulse-block')return{...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(eff*10)/10,capitalEfficiencyCutoff:Math.round(cutoff*10)/10,capitalConfirmed:false}};
    if(a==='Watch'&&!visibleWatchEligible(s))return{...s,finalDecision:{...d,action:'Avoid',timing:'Wait',size:'None',priority:'Below On Deck',reason:'Interesting enough to remain in the research universe, but not close enough to a Buy to deserve active monitoring.',nextTrigger:'Re-enter On Deck only after the setup materially improves.',planText:'No new capital.',relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(eff*10)/10,standaloneAction:a,source:'watch-quality-filter'}};
    if(!['Strong Buy','Buy'].includes(a))return s;
    if(a==='Strong Buy'){if(hardEntryGateBlocked(s))return capitalConfirmationWatch(s);const efficient=eff>=cutoff;return{...s,finalDecision:{...d,priority:efficient?d.priority:'Strong Setup',reason:efficient?d.reason:`${d.reason} Capital allocation is less efficient than the best current qualified setups, so keep the Strong Buy label but do not treat it as the first dollar to deploy.`,relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(eff*10)/10,capitalEfficiencyCutoff:Math.round(cutoff*10)/10,forwardUpsidePct:forwardUpsidePct(s)===null?null:Math.round(forwardUpsidePct(s)*10)/10,capitalConfirmed:true}};}
    if(recentStrong&&strongBuyRetentionEligible(s))return retainStrongBuy({...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(eff*10)/10,capitalEfficiencyCutoff:Math.round(cutoff*10)/10,capitalConfirmed:true}});
    if(!capitalConfirmedBuy(s))return capitalConfirmationWatch(s);
    const capital=num(rec(s)?.capitalScore??s.capitalScore??expert(s)?.capitalScore),trade=num(rec(s)?.tradeSetupScore??s.tradeSetupScore??expert(s)?.tradeSetupScore),thesis=num(rec(s)?.thesisScore??s.thesisScore??expert(s)?.thesisScore??s.fundamentalScore),continuityProtected=Boolean(d.continuityProtected),nearStrong=capital>=80&&trade>=80&&thesis>=75,competitive=continuityProtected||nearStrong||(eff>=cutoff&&capital>=70&&trade>=74);
    if(competitive){const protectedBuy=continuityProtected||nearStrong;return{...s,finalDecision:{...d,priority:protectedBuy?'High-Conviction Buy':d.priority,relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(eff*10)/10,capitalEfficiencyCutoff:Math.round(cutoff*10)/10,source:continuityProtected?'strong-buy-continuity':nearStrong?'near-strong-protection':d.source,capitalConfirmed:true}};}
    return{...s,finalDecision:{...d,action:'Watch',timing:'Wait',size:'None',priority:'Qualified Watch',reason:'Meets the standalone Buy standard and clears the capital-confirmation margin, but stronger current setups have a clear capital-efficiency edge. Keep it on Watch until its forward payoff or relative setup quality improves.',nextTrigger:'Re-rank when its capital efficiency improves.',planText:'No new capital while stronger qualified setups offer a better payoff per dollar committed.',relativeCapitalScore:Math.round(peer*10)/10,capitalEfficiencyScore:Math.round(eff*10)/10,capitalEfficiencyCutoff:Math.round(cutoff*10)/10,standaloneAction:a,source:'relative-demotion',capitalConfirmed:false}};
  });
  finalized=finalized.map(s=>{const key=symbolOf(s),prior=memory.get(key),current=s.finalDecision?.action,priorAction=prior?.action,windowMs=priorAction==='Strong Buy'?STRONG_BUY_MEMORY_MS:BUY_VISIBILITY_MEMORY_MS,recentActionable=['Strong Buy','Buy'].includes(priorAction)&&now-prior.earnedAt<=windowMs;if(!recentActionable||['Strong Buy','Buy'].includes(current))return s;return{...s,signalChange:{from:priorAction,to:current,changedAt:now,previousSignalAt:prior.earnedAt,reason:s.finalDecision?.reason||'The stock no longer clears the current fresh-capital standard.'},finalDecision:{...s.finalDecision,recentSignalDowngrade:true,previousAction:priorAction}}});
  finalized=finalized.sort((a,b)=>{const da=a.finalDecision,db=b.finalDecision,ar=actionRank(db.action)-actionRank(da.action);if(ar)return ar;const qa=da.priority==='Qualified Watch'?1:0,qb=db.priority==='Qualified Watch'?1:0;if(qa!==qb)return qb-qa;return num(db.capitalEfficiencyScore,capitalEfficiencyScore(b))-num(da.capitalEfficiencyScore,capitalEfficiencyScore(a))});
  const actionableFinal=finalized.filter(s=>['Strong Buy','Buy'].includes(s.finalDecision.action)),bestOpportunity=[...actionableFinal].sort((a,b)=>num(b.finalDecision?.capitalEfficiencyScore,capitalEfficiencyScore(b))-num(a.finalDecision?.capitalEfficiencyScore,capitalEfficiencyScore(a)))[0];
  if(bestOpportunity){const key=symbolOf(bestOpportunity);finalized=finalized.map(s=>symbolOf(s)===key?{...s,finalDecision:{...s.finalDecision,priority:'Best Opportunity'}}:s)}
  const nextMemory=new Map();for(const s of finalized){const key=symbolOf(s),a=s.finalDecision?.action,prior=memory.get(key);if(a==='Strong Buy'){const earnedAt=s.finalDecision?.hysteresisProtected&&prior?.earnedAt&&!prior?.interruptedAt?prior.earnedAt:now;nextMemory.set(key,{action:'Strong Buy',earnedAt,interruptedAt:0});}else if(a==='Buy'){nextMemory.set(key,{action:'Buy',earnedAt:prior?.action==='Buy'&&prior?.earnedAt&&!prior?.interruptedAt?prior.earnedAt:now,interruptedAt:0});}else if(['Strong Buy','Buy'].includes(s.signalChange?.from)&&prior?.earnedAt){nextMemory.set(key,{action:prior.action,earnedAt:prior.earnedAt,interruptedAt:prior.interruptedAt||now});}else nextMemory.set(key,{action:a,earnedAt:0,interruptedAt:0});}globalThis[STRONG_BUY_MEMORY_KEY]=nextMemory;
  return finalized;
}
