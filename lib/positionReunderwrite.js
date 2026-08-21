// Existing-position review for Swing holdings.
// It can resolve a passive Hold into Keep, Reduce, or Exit, but never creates a
// replacement trade by itself. Rotation still has to clear the separate high hurdle.

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
  const concentrated=crowdedPct>.35,oversized=pctSwing>=.15,veryOversized=pctSwing>=.20;
  const losing=pnl<=-7,materiallyLosing=pnl<=-10,severeLoss=pnl<=-18;
  const weakForward=m.trade<58||m.technical<55||m.momentum<52||m.leadership<55||m.capital<62;
  const broadWeak=m.trade<52&&m.technical<52&&m.momentum<50&&m.leadership<52;
  const brokenForward=m.trade<45&&m.technical<45&&m.momentum<42&&m.leadership<45&&m.thesis<58;
  const matureReview=Boolean(timeReview?.review);
  const reviewPoints=[veryOversized,oversized&&concentrated,materiallyLosing,concentrated&&losing,weakForward,matureReview].filter(Boolean).length;
  const capitalReview=reviewPoints>=3||(veryOversized&&concentrated&&weakForward)||(materiallyLosing&&concentrated&&weakForward);

  if(capitalReview){
    // Exit is intentionally difficult: the forward thesis and setup must both be broken.
    if((severeLoss||matureReview)&&brokenForward)return{override:true,action:'Exit',reason:`Exit: the thesis and setup have both weakened materially. Do not keep capital here just because the position may bounce.`,status:'Exit',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m};

    // Reduce solves portfolio risk without pretending a good company is a bad company.
    const reduce=oversized&&concentrated&&materiallyLosing&&weakForward;
    if(reduce){
      const targetPct=.10,targetValue=n(risk?.swingCapital)*targetPct,currentValue=n(pos?.value),reduceValue=Math.max(0,currentValue-targetValue),pr=n(stock?.price??stock?.currentPrice??stock?.lastPrice),reduceShares=pr>0?Math.max(1,Math.floor(reduceValue/pr)):0;
      return{override:true,action:'Reduce',reason:`Reduce: this Swing is too large while its factor is crowded and relative strength is weak. The thesis is still strong, so cut risk rather than exit.`,status:'Reduce',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m,targetPct,reduceValue,reduceShares};
    }

    return{override:true,action:'Hold',reason:`Hold, but no add: the thesis still supports the position, while weak momentum/leadership and portfolio concentration argue against more risk.`,status:'Conditional Hold',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m};
  }

  const positives=[];
  if(m.thesis>=65)positives.push('thesis');if(m.trade>=60)positives.push('setup');if(m.leadership>=60)positives.push('leadership');if(m.technical>=58)positives.push('technicals');
  if(!positives.length&&broadWeak)return{override:true,action:'Hold',reason:`Hold for now, but no add: forward evidence is weak and the position must improve to keep its capital.`,status:'Conditional Hold',metrics:m};
  if(positives.length)return{override:true,action:'Hold',reason:`Hold: ${positives.join(', ')} remain supportive.${concentrated?' No add while this factor is over the portfolio limit.':' Add only if it independently clears the fresh-capital standard.'}`,status:'Conviction Hold',pctSwing,crowdedFactor,crowdedPct,metrics:m};
  return{override:true,action:'Hold',reason:`Hold for now, but no add: the evidence is mixed and the position needs to improve.`,status:'Conditional Hold',pctSwing,crowdedFactor,crowdedPct,metrics:m};
}
