// Existing-position review for Swing holdings.
// Passive Hold is not a default: aging/losing capital must re-earn its place.
// Replacement trades still must clear the separate high rotation hurdle.

const n=(v,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f};
const sym=s=>String(s?.symbol||s?.ticker||'').toUpperCase();
function metrics(s={}){const e=s?.recommendation?.expertDecision||s?.expertDecision||{},m=e?.metrics||{};return{thesis:n(e?.thesisScore??s?.thesisScore,50),trade:n(e?.tradeSetupScore??s?.tradeSetupScore,50),capital:n(e?.capitalScore??s?.capitalScore??s?.finalDecision?.relativeCapitalScore,50),technical:n(m?.technical??s?.technicalScore,50),momentum:n(m?.momentum??s?.momentumScore,50),leadership:n(m?.leadership??s?.relativeStrengthScore,50),risk:n(m?.risk??s?.riskScore,50)};}
export function reunderwriteExistingPosition({stock={},decision={},risk={},timeReview={}}={}){
  if(String(stock?.role||'Swing').toLowerCase()==='core'||['Cash','Exit','Rotate','Trim','Add'].includes(decision?.action))return{override:false,action:decision?.action||'Hold',reason:decision?.reason||''};
  if(decision?.action!=='Hold')return{override:false,action:decision?.action||'Review',reason:decision?.reason||''};
  const key=sym(stock),pos=risk?.positions?.[key]||{},pctSwing=n(pos?.pctSwing),pnl=n(stock?.gainLossPct),m=metrics(stock),weights=pos?.factorWeights||{},held=timeReview?.held==null?null:n(timeReview.held);
  let crowdedFactor='',crowdedPct=0,weightedCrowding=0;for(const[f,wRaw]of Object.entries(weights)){const w=n(wRaw),p=n(risk?.factorPct?.[f]);if(w>=.20&&p>crowdedPct){crowdedPct=p;crowdedFactor=f;}weightedCrowding+=w*p;}
  const concentrated=crowdedPct>.35,oversized=pctSwing>=.15,veryOversized=pctSwing>=.20,losing=pnl<=-7,materiallyLosing=pnl<=-10,severeLoss=pnl<=-18;
  const weakForward=m.trade<58||m.technical<55||m.momentum<52||m.leadership<55||m.capital<62,broadWeak=m.trade<52&&m.technical<52&&m.momentum<50&&m.leadership<52,brokenForward=m.trade<45&&m.technical<45&&m.momentum<42&&m.leadership<45&&m.thesis<58;
  const aging=held!==null&&held>=28,stale=held!==null&&held>=42,veryStale=held!==null&&held>=60,deadMoney=aging&&pnl<=2&&weakForward,opportunityCost=stale&&pnl<=5&&(m.trade<60||m.momentum<55||m.leadership<55);
  const matureReview=Boolean(timeReview?.review),reviewPoints=[veryOversized,oversized&&concentrated,materiallyLosing,concentrated&&losing,weakForward,matureReview,deadMoney,opportunityCost].filter(Boolean).length;
  const capitalReview=reviewPoints>=3||(veryOversized&&concentrated&&weakForward)||(materiallyLosing&&concentrated&&weakForward)||opportunityCost;
  if(capitalReview){
    if((severeLoss||veryStale||matureReview)&&brokenForward)return{override:true,action:'Exit',reason:'Exit: the forward thesis/setup no longer earns the capital.',status:'Exit',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m,held,opportunityCost:true};
    const reduce=(oversized&&concentrated&&materiallyLosing&&weakForward)||(opportunityCost&&oversized&&weakForward);
    if(reduce){const targetPct=.10,targetValue=n(risk?.swingCapital)*targetPct,currentValue=n(pos?.value),reduceValue=Math.max(0,currentValue-targetValue),pr=n(stock?.price??stock?.currentPrice??stock?.lastPrice),reduceShares=pr>0?Math.max(1,Math.floor(reduceValue/pr)):0;return{override:true,action:'Reduce',reason:opportunityCost?'Reduce: this aging Swing is tying up too much capital without enough forward strength.':'Reduce: this Swing is too large while its factor is crowded and relative strength is weak.',status:'Reduce',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m,targetPct,reduceValue,reduceShares,held,opportunityCost};}
    if(opportunityCost)return{override:true,action:'Hold',reason:`Hold only conditionally: ${held} days in, this position must improve soon or give way to cash/a clearly superior qualified opportunity.`,status:'Opportunity Cost Hold',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m,held,opportunityCost:true};
    return{override:true,action:'Hold',reason:'Hold, but no add: forward evidence does not justify more risk.',status:'Conditional Hold',pctSwing,crowdedFactor,crowdedPct,weightedCrowding,metrics:m,held};
  }
  const positives=[];if(m.thesis>=65)positives.push('thesis');if(m.trade>=60)positives.push('setup');if(m.leadership>=60)positives.push('leadership');if(m.technical>=58)positives.push('technicals');
  if(deadMoney)return{override:true,action:'Hold',reason:`Hold only conditionally: ${held} days in and little progress. Require improving setup/relative strength or redeploy to cash/a superior qualified opportunity.`,status:'Opportunity Cost Hold',metrics:m,held,opportunityCost:true};
  if(!positives.length&&broadWeak)return{override:true,action:'Hold',reason:'Hold for now, but no add: forward evidence is weak.',status:'Conditional Hold',metrics:m,held};
  if(positives.length)return{override:true,action:'Hold',reason:`Hold: ${positives.join(', ')} remain supportive.${concentrated?' No add while this factor is over the portfolio limit.':' Add only if it independently clears the fresh-capital standard.'}`,status:'Conviction Hold',pctSwing,crowdedFactor,crowdedPct,metrics:m,held};
  return{override:true,action:'Hold',reason:'Hold for now, but no add: the evidence is mixed.',status:'Conditional Hold',pctSwing,crowdedFactor,crowdedPct,metrics:m,held};
}
