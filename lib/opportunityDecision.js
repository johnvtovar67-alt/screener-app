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
function absoluteAction(s={}){return normalize(rec(s)?.displayLabel??rec(s)?.label??rec(s)?.recommendation??rec(s)?.tradeAction??s?.action)}
function baseReason(s={}){const r=rec(s),e=expert(s);return r.decisionWhy||e.decisionWhy||r.actionSummary||r.dominantReason||'No new capital until the setup improves.'}
function baseTiming(s={}){const a=absoluteAction(s),r=rec(s),e=expert(s);return r.decisionTiming||e.timing||(['Strong Buy','Buy'].includes(a)?'Now':a==='Watch'?'Wait for Trigger':'Wait')}
function baseSize(s={}){const a=absoluteAction(s),r=rec(s),e=expert(s);return r.positionSize||e.size||(a==='Strong Buy'?'Full':a==='Buy'?'Partial':'None')}
function priceTrigger(s={}){const p=plan(s),add=Number(p.addAbovePrice);return Number.isFinite(add)&&add>0?`Trigger above ${money(add)}`:'Wait for confirmation'}
function planText(s={},action=absoluteAction(s)){const p=plan(s),inv=Number(p.invalidationPrice),trim=Number(p.firstTrimPrice);if(['Strong Buy','Buy'].includes(action)){const left=Number.isFinite(inv)&&inv>0?`Review below ${money(inv)}`:'Define risk before entry';const right=Number.isFinite(trim)&&trim>0?` • Profit review ${money(trim)}`:'';return`${left}${right}`}return priceTrigger(s)}

// Continuity can smooth ordinary intraday noise, but it must never rescue a stock
// that has failed a hard forward-entry gate such as late trend or inadequate asymmetry.
function strongBuyContinuityEligible(s={}){
  const r=rec(s),e=expert(s),m=e?.metrics||{};
  const current=absoluteAction(s);
  if(current!=='Watch')return false;
  const event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{};
  const eventStatus=String(event?.status||'').toLowerCase();
  if(event?.blockNewCapital||event?.manualCheckRequired||['blocked','manual','caution'].includes(eventStatus))return false;
  if(m.quoteFreshnessPass===false||m.fundamentalsPass===false)return false;
  if(e.trendStatus&&e.trendStatus!=='Confirmed')return false;
  if(m.below50||m.below200||m.lateTrend===true||m.severeLateTrend===true||m.forwardAsymmetryPass===false)return false;
  const rv=m.relativeVolume;
  if(rv!==null&&rv!==undefined&&Number.isFinite(Number(rv))&&Number(rv)<.4)return false;
  const rr=num(m.payoffRatio,0);
  if(rr>0&&rr<2.0)return false;
  const vs50=m.vs50===null||m.vs50===undefined?null:num(m.vs50,0),vs200=m.vs200===null||m.vs200===undefined?null:num(m.vs200,0),day=num(m.day,0),extension=num(m.extension,50);
  if(extension>=58||(vs50!==null&&vs50>14)||(vs200!==null&&vs200>48)||day>8)return false;
  const thesis=num(r.thesisScore??s.thesisScore??e.thesisScore??s.fundamentalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),raw=num(s.score??s.compositeScore??r.score),technical=num(m.technical??s.technicalScore??r.technicalScore),leadership=num(m.leadership??s.relativeStrengthScore??r.relativeStrengthScore),momentum=num(m.momentum??s.momentumScore??r.momentumScore),entry=num(m.entry??r.entryQualityScore??s.entryQualityScore),risk=num(m.risk??r.riskScore??s.riskScore,50);
  return thesis>=73&&trade>=80&&capital>=77&&raw>=70&&technical>=60&&leadership>=60&&momentum>=52&&entry>=55&&risk<=72;
}
function continuityReason(s={}){
  const e=expert(s),first=Array.isArray(e?.failures)?e.failures[0]:'';
  return `High-conviction setup has softened from Strong Buy thresholds but remains Buy-quality without violating the forward-entry rules. Use partial size while full confirmation rebuilds.${first?` Softened factor: ${first}`:''}`;
}

export function finalizeStandaloneOpportunityDecision(s={}){
  const rawAction=absoluteAction(s),continuityProtected=strongBuyContinuityEligible(s),action=continuityProtected?'Buy':rawAction,score=relativeCapitalScore(s);
  const reason=continuityProtected?continuityReason(s):baseReason(s),timing=continuityProtected?'Now':baseTiming(s),size=continuityProtected?'Partial':baseSize(s),priority=continuityProtected?'High-Conviction Buy':action==='Strong Buy'?'Top Tier':action==='Buy'?'Actionable':action==='Watch'?'Watch':'Avoid';
  return{...s,finalDecision:{action,timing,size,reason,priority,nextTrigger:action==='Watch'?priceTrigger(s):planText(s,action),planText:planText(s,action),relativeCapitalScore:Math.round(score*10)/10,standaloneAction:rawAction,source:continuityProtected?'strong-buy-continuity':'standalone',continuityProtected}};
}
function percentile(values=[],p=.8){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo)}
function actionRank(a){return a==='Strong Buy'?4:a==='Buy'?3:a==='Watch'?1:0}

const STRONG_BUY_MEMORY_KEY='__screenerStrongBuyMemoryV1';
const STRONG_BUY_MEMORY_MS=6.5*60*60*1000;
function strongBuyMemory(){const x=globalThis[STRONG_BUY_MEMORY_KEY];return x instanceof Map?x:new Map()}
function symbolOf(s={}){return String(s.symbol||s.ticker||'').toUpperCase()}
function strongBuyRetentionEligible(s={}){
  const d=s.finalDecision||{},r=rec(s),e=expert(s),m=e?.metrics||{};
  if(d.action!=='Buy')return false;
  const event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{};
  const eventStatus=String(event?.status||'').toLowerCase();
  if(event?.blockNewCapital||event?.manualCheckRequired||['blocked','manual','caution'].includes(eventStatus))return false;
  if(m.quoteFreshnessPass===false||m.fundamentalsPass===false||m.below50||m.below200||m.lateTrend===true||m.severeLateTrend===true||m.forwardAsymmetryPass===false)return false;
  const rr=num(m.payoffRatio,0),rv=m.relativeVolume,vs50=m.vs50===null||m.vs50===undefined?null:num(m.vs50,0),vs200=m.vs200===null||m.vs200===undefined?null:num(m.vs200,0),day=num(m.day,0),extension=num(m.extension,50);
  if(rv!==null&&rv!==undefined&&Number.isFinite(Number(rv))&&Number(rv)<.4)return false;
  if(rr>0&&rr<2.0)return false;
  if(extension>=58||(vs50!==null&&vs50>14)||(vs200!==null&&vs200>48)||day>8)return false;
  const thesis=num(r.thesisScore??s.thesisScore??e.thesisScore??s.fundamentalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),raw=num(s.score??s.compositeScore??r.score),technical=num(m.technical??s.technicalScore??r.technicalScore),leadership=num(m.leadership??s.relativeStrengthScore??r.relativeStrengthScore),momentum=num(m.momentum??s.momentumScore??r.momentumScore),entry=num(m.entry??r.entryQualityScore??s.entryQualityScore),risk=num(m.risk??r.riskScore??s.riskScore,50),strongQuality=num(r.strongQualityScore??s.strongQualityScore??e.strongQualityScore,0);
  return strongQuality>=80&&thesis>=74&&trade>=78&&capital>=78&&raw>=74&&technical>=66&&leadership>=66&&momentum>=52&&entry>=55&&risk<=68;
}
function retainStrongBuy(s={}){
  const d=s.finalDecision||{};
  return{...s,finalDecision:{...d,action:'Strong Buy',timing:'Now',size:'Full',priority:'Top Tier',reason:'Strong Buy retained. The setup has softened modestly from the entry threshold but remains inside the high-conviction retention band and still passes the forward-entry rules.',source:'strong-buy-hysteresis',hysteresisProtected:true}};
}

function visibleWatchEligible(s={}){
  const r=rec(s),e=expert(s),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),technical=num(s.technicalScore??r.technicalScore),leadership=num(s.relativeStrengthScore??r.relativeStrengthScore??r.leadershipScore),momentum=num(s.momentumScore??r.momentumScore),raw=num(s.score??s.compositeScore??r.score),risk=num(r.riskScore??s.riskScore,50),extension=num(r.extensionRisk??s.extensionRisk,50);
  const eventStatus=String(s?.eventRisk?.status??s?.preTradeCheck?.status??'').toLowerCase();
  const coreNearBuy=capital>=69&&trade>=73&&raw>=68&&risk<=78&&extension<=62;
  const execution=[technical>=58,leadership>=62,momentum>=52].filter(Boolean).length;
  if(eventStatus==='blocked'||eventStatus==='caution')return coreNearBuy&&technical>=57&&leadership>=60&&execution>=2;
  return coreNearBuy&&execution>=2&&(technical>=60||leadership>=64);
}

export function finalizeBroadOpportunityDecisions(rows=[]){
  const now=Date.now(),memory=strongBuyMemory();
  const base=rows.map(finalizeStandaloneOpportunityDecision),actionable=base.filter(s=>['Strong Buy','Buy'].includes(s.finalDecision.action)),scores=actionable.map(relativeCapitalScore),best=scores.length?Math.max(...scores):0,cutoff=scores.length>1?Math.max(percentile(scores,.8),best-3):best;
  let finalized=base.map(s=>{const d=s.finalDecision,a=d.action,peer=relativeCapitalScore(s),prior=memory.get(symbolOf(s)),recentStrong=prior?.action==='Strong Buy'&&now-prior.earnedAt<=STRONG_BUY_MEMORY_MS;
    if(a==='Watch'&&!visibleWatchEligible(s))return{...s,finalDecision:{...d,action:'Avoid',timing:'Wait',size:'None',priority:'Below On Deck',reason:'Interesting enough to remain in the research universe, but not close enough to a Buy to deserve active monitoring.',nextTrigger:'Re-enter On Deck only after the setup materially improves.',planText:'No new capital.',relativeCapitalScore:Math.round(peer*10)/10,standaloneAction:a,source:'watch-quality-filter'}};
    if(!['Strong Buy','Buy'].includes(a))return s;
    if(a==='Strong Buy')return{...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10}};
    if(recentStrong&&strongBuyRetentionEligible(s))return retainStrongBuy({...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10}});
    const capital=num(rec(s)?.capitalScore??s.capitalScore??expert(s)?.capitalScore),trade=num(rec(s)?.tradeSetupScore??s.tradeSetupScore??expert(s)?.tradeSetupScore),thesis=num(rec(s)?.thesisScore??s.thesisScore??expert(s)?.thesisScore??s.fundamentalScore),continuityProtected=Boolean(d.continuityProtected),nearStrong=capital>=80&&trade>=80&&thesis>=75,competitive=continuityProtected||nearStrong||(peer>=cutoff&&capital>=70&&trade>=74);
    if(competitive){const protectedBuy=continuityProtected||nearStrong;return{...s,finalDecision:{...d,priority:protectedBuy?'High-Conviction Buy':d.priority,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10,source:continuityProtected?'strong-buy-continuity':nearStrong?'near-strong-protection':d.source}};}
    return{...s,finalDecision:{...d,action:'Watch',timing:'Wait',size:'None',priority:'Qualified Watch',reason:'Meets the standalone Buy standard, but stronger current setups have a clear capital-allocation edge. Keep it on Watch; it has not become a bad setup.',nextTrigger:'Re-rank when its relative capital advantage improves.',planText:'No new capital while stronger qualified setups offer a clear edge.',relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10,standaloneAction:a,source:'relative-demotion'}};
  });
  finalized=finalized.sort((a,b)=>{const da=a.finalDecision,db=b.finalDecision,ar=actionRank(db.action)-actionRank(da.action);if(ar)return ar;const qa=da.priority==='Qualified Watch'?1:0,qb=db.priority==='Qualified Watch'?1:0;if(qa!==qb)return qb-qa;return num(db.relativeCapitalScore)-num(da.relativeCapitalScore)});
  const firstActionable=finalized.find(s=>['Strong Buy','Buy'].includes(s.finalDecision.action));if(firstActionable){const key=symbolOf(firstActionable);finalized=finalized.map(s=>symbolOf(s)===key?{...s,finalDecision:{...s.finalDecision,priority:'Best Opportunity'}}:s)}
  const nextMemory=new Map();for(const s of finalized){const key=symbolOf(s),a=s.finalDecision?.action,prior=memory.get(key);if(a==='Strong Buy'){const earnedAt=s.finalDecision?.hysteresisProtected&&prior?.earnedAt?prior.earnedAt:now;nextMemory.set(key,{action:'Strong Buy',earnedAt})}else nextMemory.set(key,{action:a,earnedAt:0})}globalThis[STRONG_BUY_MEMORY_KEY]=nextMemory;
  return finalized;
}
