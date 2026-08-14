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
export function finalizeStandaloneOpportunityDecision(s={}){const action=absoluteAction(s),score=relativeCapitalScore(s);return{...s,finalDecision:{action,timing:baseTiming(s),size:baseSize(s),reason:baseReason(s),priority:action==='Strong Buy'?'Top Tier':action==='Buy'?'Actionable':action==='Watch'?'Watch':'Avoid',nextTrigger:action==='Watch'?priceTrigger(s):planText(s,action),planText:planText(s,action),relativeCapitalScore:Math.round(score*10)/10,standaloneAction:action,source:'standalone'}}}
function percentile(values=[],p=.8){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo)}
function actionRank(a){return a==='Strong Buy'?4:a==='Buy'?3:a==='Watch'?1:0}

// On Deck means near-Buy, not merely interesting. No numerical cap: qualification controls list size.
function visibleWatchEligible(s={}){
  const r=rec(s),e=expert(s),capital=num(r.capitalScore??s.capitalScore??e.capitalScore),trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore),technical=num(s.technicalScore??r.technicalScore),leadership=num(s.relativeStrengthScore??r.relativeStrengthScore??r.leadershipScore),momentum=num(s.momentumScore??r.momentumScore),raw=num(s.score??s.compositeScore??r.score),risk=num(r.riskScore??s.riskScore,50),extension=num(r.extensionRisk??s.extensionRisk,50);
  const eventStatus=String(s?.eventRisk?.status??s?.preTradeCheck?.status??'').toLowerCase();
  const coreNearBuy=capital>=69&&trade>=73&&raw>=68&&risk<=78&&extension<=62;
  const execution=[technical>=58,leadership>=62,momentum>=52].filter(Boolean).length;
  // Normal Watches must be one modest confirmation away from Buy, not several repairs away.
  if(eventStatus==='blocked'||eventStatus==='caution')return coreNearBuy&&technical>=57&&leadership>=60&&execution>=2;
  return coreNearBuy&&execution>=2&&(technical>=60||leadership>=64);
}

export function finalizeBroadOpportunityDecisions(rows=[]){
  const base=rows.map(finalizeStandaloneOpportunityDecision),actionable=base.filter(s=>['Strong Buy','Buy'].includes(s.finalDecision.action)),scores=actionable.map(relativeCapitalScore),best=scores.length?Math.max(...scores):0,cutoff=scores.length>1?Math.max(percentile(scores,.8),best-3):best;
  let finalized=base.map(s=>{const d=s.finalDecision,a=d.action,peer=relativeCapitalScore(s);
    if(a==='Watch'&&!visibleWatchEligible(s))return{...s,finalDecision:{...d,action:'Avoid',timing:'Wait',size:'None',priority:'Below On Deck',reason:'Interesting enough to remain in the research universe, but not close enough to a Buy to deserve active monitoring.',nextTrigger:'Re-enter On Deck only after the setup materially improves.',planText:'No new capital.',relativeCapitalScore:Math.round(peer*10)/10,standaloneAction:a,source:'watch-quality-filter'}};
    if(!['Strong Buy','Buy'].includes(a))return s;
    if(a==='Strong Buy')return{...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10}};
    const capital=num(rec(s)?.capitalScore??s.capitalScore??expert(s)?.capitalScore),trade=num(rec(s)?.tradeSetupScore??s.tradeSetupScore??expert(s)?.tradeSetupScore),competitive=peer>=cutoff&&capital>=70&&trade>=74;
    if(competitive)return{...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10}};
    return{...s,finalDecision:{...d,action:'Watch',timing:'Wait',size:'None',priority:'Qualified Watch',reason:'Meets the standalone Buy standard, but stronger current setups have a clear capital-allocation edge. Keep it on Watch; it has not become a bad setup.',nextTrigger:'Re-rank when its relative capital advantage improves.',planText:'No new capital while stronger qualified setups offer a clear edge.',relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10,standaloneAction:a,source:'relative-demotion'}};
  });
  finalized=finalized.sort((a,b)=>{const da=a.finalDecision,db=b.finalDecision,ar=actionRank(db.action)-actionRank(da.action);if(ar)return ar;const qa=da.priority==='Qualified Watch'?1:0,qb=db.priority==='Qualified Watch'?1:0;if(qa!==qb)return qb-qa;return num(db.relativeCapitalScore)-num(da.relativeCapitalScore)});
  const firstActionable=finalized.find(s=>['Strong Buy','Buy'].includes(s.finalDecision.action));if(firstActionable){const key=String(firstActionable.symbol||firstActionable.ticker||'').toUpperCase();finalized=finalized.map(s=>String(s.symbol||s.ticker||'').toUpperCase()===key?{...s,finalDecision:{...s.finalDecision,priority:'Best Opportunity'}}:s)}return finalized;
}
