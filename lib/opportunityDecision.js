const num=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f};
const normalize=v=>{const x=String(v||'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim().toUpperCase();if(x==='STRONG BUY')return'Strong Buy';if(x.includes('BUY'))return'Buy';if(x.includes('WATCH')||x.includes('STARTER')||x.includes('SETUP')||x==='BREAKOUT'||x==='NEAR MISS')return'Watch';return'Avoid'};
const money=v=>Number.isFinite(+v)?`$${(+v).toFixed(2)}`:'';
const rec=s=>s?.recommendation&&typeof s.recommendation==='object'?s.recommendation:{};
const expert=s=>rec(s)?.expertDecision||s?.expertDecision||{};
const plan=s=>s?.riskPlan??rec(s)?.riskPlan??{};

export function relativeCapitalScore(s={}){
  const r=rec(s),e=expert(s);
  return num(r.capitalScore??s.capitalScore??e.capitalScore)*.45+
    num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore)*.30+
    num(s.relativeStrengthScore??r.relativeStrengthScore)*.15+
    num(s.technicalScore??r.technicalScore)*.10;
}

function absoluteAction(s={}){return normalize(rec(s)?.displayLabel??rec(s)?.label??rec(s)?.recommendation??rec(s)?.tradeAction??s?.action)}
function baseReason(s={}){const r=rec(s),e=expert(s);return r.decisionWhy||e.decisionWhy||r.actionSummary||r.dominantReason||'No new capital until the setup improves.'}
function baseTiming(s={}){const a=absoluteAction(s),r=rec(s),e=expert(s);return r.decisionTiming||e.timing||(['Strong Buy','Buy'].includes(a)?'Now':a==='Watch'?'Wait for Trigger':'Wait')}
function baseSize(s={}){const a=absoluteAction(s),r=rec(s),e=expert(s);return r.positionSize||e.size||(a==='Strong Buy'?'Full':a==='Buy'?'Partial':'None')}
function priceTrigger(s={}){const p=plan(s),add=Number(p.addAbovePrice);return Number.isFinite(add)&&add>0?`Trigger above ${money(add)}`:'Wait for confirmation'}
function planText(s={},action=absoluteAction(s)){const p=plan(s),inv=Number(p.invalidationPrice),trim=Number(p.firstTrimPrice);if(['Strong Buy','Buy'].includes(action)){const left=Number.isFinite(inv)&&inv>0?`Review below ${money(inv)}`:'Define risk before entry';const right=Number.isFinite(trim)&&trim>0?` • Profit review ${money(trim)}`:'';return`${left}${right}`}return priceTrigger(s)}

export function finalizeStandaloneOpportunityDecision(s={}){
  const action=absoluteAction(s),score=relativeCapitalScore(s);
  const decision={
    action,
    timing:baseTiming(s),
    size:baseSize(s),
    reason:baseReason(s),
    priority:action==='Strong Buy'?'Top Tier':action==='Buy'?'Actionable':action==='Watch'?'Watch':'Avoid',
    nextTrigger:action==='Watch'?priceTrigger(s):planText(s,action),
    planText:planText(s,action),
    relativeCapitalScore:Math.round(score*10)/10,
    standaloneAction:action,
    source:'standalone'
  };
  return{...s,finalDecision:decision};
}

function percentile(values=[],p=.8){if(!values.length)return 0;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo)}
function actionRank(a){return a==='Strong Buy'?4:a==='Buy'?3:a==='Watch'?1:0}

// Visible On Deck should mean near-actionable, not merely interesting.
// This is deliberately stricter than the broad internal Watch state used by the expert engine.
function visibleWatchEligible(s={}){
  const r=rec(s),e=expert(s);
  const capital=num(r.capitalScore??s.capitalScore??e.capitalScore);
  const trade=num(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore);
  const technical=num(s.technicalScore??r.technicalScore);
  const leadership=num(s.relativeStrengthScore??r.relativeStrengthScore??r.leadershipScore);
  const raw=num(s.score??s.compositeScore??r.score);
  const risk=num(r.riskScore??s.riskScore,50);
  const extension=num(r.extensionRisk??s.extensionRisk,50);
  const eventStatus=String(s?.eventRisk?.status??s?.preTradeCheck?.status??'').toLowerCase();

  // Event-downgraded candidates remain visible because the setup itself may still be actionable once the event clears.
  if(eventStatus==='blocked'||eventStatus==='caution')return capital>=66&&trade>=70;

  // Near-Buy standard: broad quality plus at least two strong execution pillars.
  const pillars=[capital>=66,trade>=70,technical>=56,leadership>=60,raw>=66].filter(Boolean).length;
  return pillars>=4&&risk<=82&&extension<=68;
}

export function finalizeBroadOpportunityDecisions(rows=[]){
  const base=rows.map(finalizeStandaloneOpportunityDecision);
  const actionable=base.filter(s=>['Strong Buy','Buy'].includes(s.finalDecision.action));
  const scores=actionable.map(relativeCapitalScore);
  const best=scores.length?Math.max(...scores):0;
  const cutoff=scores.length>1?Math.max(percentile(scores,.8),best-3):best;

  let finalized=base.map(s=>{
    const d=s.finalDecision,a=d.action,peer=relativeCapitalScore(s);

    if(a==='Watch'&&!visibleWatchEligible(s)){
      return{...s,finalDecision:{...d,action:'Avoid',timing:'Wait',size:'None',priority:'Below On Deck',reason:'Interesting enough to remain in the research universe, but not close enough to a Buy to deserve active monitoring.',nextTrigger:'Re-enter On Deck only after the setup materially improves.',planText:'No new capital.',relativeCapitalScore:Math.round(peer*10)/10,standaloneAction:a,source:'watch-quality-filter'}};
    }

    if(!['Strong Buy','Buy'].includes(a))return s;
    if(a==='Strong Buy')return{...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10}};
    const capital=num(rec(s)?.capitalScore??s.capitalScore??expert(s)?.capitalScore),trade=num(rec(s)?.tradeSetupScore??s.tradeSetupScore??expert(s)?.tradeSetupScore);
    const competitive=peer>=cutoff&&capital>=70&&trade>=74;
    if(competitive)return{...s,finalDecision:{...d,relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10}};
    const reason='Meets the standalone Buy standard, but stronger current setups have a clear capital-allocation edge. Keep it on Watch; it has not become a bad setup.';
    return{...s,finalDecision:{...d,action:'Watch',timing:'Wait',size:'None',priority:'Qualified Watch',reason,nextTrigger:'Re-rank when its relative capital advantage improves.',planText:'No new capital while stronger qualified setups offer a clear edge.',relativeCapitalScore:Math.round(peer*10)/10,relativeCapitalCutoff:Math.round(cutoff*10)/10,standaloneAction:a,source:'relative-demotion'}};
  });

  finalized=finalized.sort((a,b)=>{
    const da=a.finalDecision,db=b.finalDecision;
    const ar=actionRank(db.action)-actionRank(da.action);if(ar)return ar;
    const qa=(da.priority==='Qualified Watch'?1:0),qb=(db.priority==='Qualified Watch'?1:0);if(qa!==qb)return qb-qa;
    return num(db.relativeCapitalScore)-num(da.relativeCapitalScore);
  });

  const firstActionable=finalized.find(s=>['Strong Buy','Buy'].includes(s.finalDecision.action));
  if(firstActionable){const key=String(firstActionable.symbol||firstActionable.ticker||'').toUpperCase();finalized=finalized.map(s=>String(s.symbol||s.ticker||'').toUpperCase()===key?{...s,finalDecision:{...s.finalDecision,priority:'Best Opportunity'}}:s)}
  return finalized;
}
