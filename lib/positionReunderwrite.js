// Second-stage existing-position review. This does NOT create automatic exits or
// lower rotation hurdles. It prevents weak/oversized Swing holdings from being
// grandfathered by generic Hold language and forces explicit capital review.

const n=(v,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f};
const sym=s=>String(s?.symbol||s?.ticker||'').toUpperCase();

function metrics(s={}){
  const e=s?.recommendation?.expertDecision||s?.expertDecision||{};
  const m=e?.metrics||{};
  return{
    thesis:n(e?.thesisScore??s?.thesisScore,50),
    trade:n(e?.tradeSetupScore??s?.tradeSetupScore,50),
    capital:n(e?.capitalScore??s?.capitalScore??s?.finalDecision?.relativeCapitalScore,50),
    technical:n(m?.technical??s?.technicalScore,50),
    momentum:n(m?.momentum??s?.momentumScore,50),
    leadership:n(m?.leadership??s?.relativeStrengthScore,50),
    risk:n(m?.risk??s?.riskScore,50)
  };
}

export function reunderwriteExistingPosition({stock={},decision={},risk={},timeReview={}}={}){
  if(String(stock?.role||'Swing').toLowerCase()==='core'||['Cash','Exit','Rotate','Trim','Add'].includes(decision?.action))return{override:false,action:decision?.action||'Hold',reason:decision?.reason||''};
  if(decision?.action!=='Hold')return{override:false,action:decision?.action||'Review',reason:decision?.reason||''};

  const key=sym(stock),pos=risk?.positions?.[key]||{},pctSwing=n(pos?.pctSwing),pnl=n(stock?.gainLossPct),m=metrics(stock),weights=pos?.factorWeights||{};
  let crowdedFactor='',crowdedPct=0,weightedCrowding=0;
  for(const[f,wRaw]of Object.entries(weights)){const w=n(wRaw),p=n(risk?.factorPct?.[f]);if(w>=.20&&p>crowdedPct){crowdedPct=p;crowdedFactor=f;}weightedCrowding+=w*p;}
  const concentrated=crowdedPct>.35;
  const oversized=pctSwing>=.15;
  const veryOversized=pctSwing>=.20;
  const losing=pnl<=-7;
  const materiallyLosing=pnl<=-10;
  const weakForward=m.trade<58||m.technical<55||m.momentum<52||m.leadership<55||m.capital<62;
  const broadWeak=m.trade<52&&m.technical<52&&m.momentum<50&&m.leadership<52;
  const matureReview=Boolean(timeReview?.review);

  // Do not force a sale. Escalate the burden of proof when multiple independent
  // reasons make passive Hold inappropriate.
  const reviewPoints=[veryOversized,oversized&&concentrated,materiallyLosing,concentrated&&losing,weakForward,matureReview].filter(Boolean).length;
  const capitalReview=reviewPoints>=3||(veryOversized&&concentrated&&weakForward)||(materiallyLosing&&concentrated&&weakForward);

  if(capitalReview){
    const reasons=[];
    if(oversized)reasons.push(`${Math.round(pctSwing*100)}% of Swing capital`);
    if(concentrated)reasons.push(`${crowdedFactor} is ${Math.round(crowdedPct*100)}% of Swing capital`);
    if(losing)reasons.push(`${pnl.toFixed(1)}% from cost`);
    reasons.push(`forward scores: trade ${Math.round(m.trade)}, technical ${Math.round(m.technical)}, momentum ${Math.round(m.momentum)}, leadership ${Math.round(m.leadership)}, thesis ${Math.round(m.thesis)}`);
    return{override:true,action:'Review',reason:`Capital re-underwrite required: ${reasons.join('; ')}. Do not add. Keep only if the forward thesis/setup affirmatively justifies this risk; concentration or stabilization alone is not enough.`,status:'Capital Review',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m};
  }

  // Replace generic stabilization prose with an affirmative Hold explanation.
  const positives=[];
  if(m.thesis>=65)positives.push(`thesis ${Math.round(m.thesis)}`);
  if(m.trade>=60)positives.push(`trade setup ${Math.round(m.trade)}`);
  if(m.leadership>=60)positives.push(`leadership ${Math.round(m.leadership)}`);
  if(m.technical>=58)positives.push(`technical ${Math.round(m.technical)}`);
  if(!positives.length&&broadWeak)return{override:true,action:'Review',reason:`Capital re-underwrite required: forward evidence is broadly weak (trade ${Math.round(m.trade)}, technical ${Math.round(m.technical)}, momentum ${Math.round(m.momentum)}, leadership ${Math.round(m.leadership)}). Hold-by-inertia is not permitted; reassess the thesis and opportunity cost before continuing.`,status:'Capital Review',metrics:m};
  if(positives.length)return{override:true,action:'Hold',reason:`Conviction hold: the position still earns capital on forward evidence (${positives.join(', ')}). ${concentrated?'No add while its factor remains above the concentration budget.':'No add unless the fresh-capital standard is independently met.'}`,status:'Conviction Hold',pctSwing,crowdedFactor,crowdedPct,metrics:m};

  return{override:true,action:'Hold',reason:`Conditional hold: forward evidence is mixed (trade ${Math.round(m.trade)}, technical ${Math.round(m.technical)}, momentum ${Math.round(m.momentum)}, leadership ${Math.round(m.leadership)}, thesis ${Math.round(m.thesis)}). Do not add; the position must improve or it will move to capital review as time/opportunity cost rises.`,status:'Conditional Hold',pctSwing,crowdedFactor,crowdedPct,metrics:m};
}
