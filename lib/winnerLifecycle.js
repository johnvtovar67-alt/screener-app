// Winner lifecycle governor: prevent repeated percentage trims from mechanically
// liquidating a successful Swing position. The caller supplies persisted trim
// history; this module decides whether another trim is permitted and how large.

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,+v||0));

export function normalizeWinnerLifecycle(position={},history={}){
  const currentShares=Math.max(0,Math.floor(+position.shares||0));
  const priorTrimCount=Math.max(0,Math.floor(+history.trimCount||0));
  const priorTrimShares=Math.max(0,Math.floor(+history.trimmedShares||0));
  const originalShares=Math.max(currentShares+priorTrimShares,Math.floor(+history.originalShares||0),currentShares);
  const cumulativeTrimPct=originalShares>0?priorTrimShares/originalShares:0;
  return {currentShares,priorTrimCount,priorTrimShares,originalShares,cumulativeTrimPct,lastTrimAt:history.lastTrimAt||null,lastTrimPrice:+history.lastTrimPrice||null,lastTrimExtension:+history.lastTrimExtension||null};
}

export function winnerTrimGate({position={},decision={},history={}}={}){
  const life=normalizeWinnerLifecycle(position,history),pp=decision?.profitProtection||{};
  const pnl=Number.isFinite(+pp.pnlPct)?+pp.pnlPct:(+position.gainLossPct||0);
  const extension=Number.isFinite(+pp.extensionScore)?+pp.extensionScore:null;
  const fading=Boolean(pp.winnerFading),highFroth=Boolean(pp.highFroth),moderateFroth=Boolean(pp.moderateFroth);

  // Each completed trim raises the hurdle. After two trims, extension alone is
  // insufficient: require fresh deterioration or genuinely exceptional froth.
  if(life.priorTrimCount>=2&&!fading&&!highFroth){
    return {pass:false,reason:`Winner lifecycle: ${life.priorTrimCount} prior trims already banked profit; preserve the runner unless the trend fades or froth becomes exceptional.`,life};
  }
  if(life.cumulativeTrimPct>=0.60&&!fading){
    return {pass:false,reason:`Winner lifecycle: ${Math.round(life.cumulativeTrimPct*100)}% of the original position has already been harvested; no further trim without trend deterioration.`,life};
  }

  // Require incremental evidence after a prior trim rather than repeatedly
  // responding to the same extension state.
  if(life.priorTrimCount>0&&extension!==null&&life.lastTrimExtension!==null&&!fading&&!highFroth&&extension<life.lastTrimExtension+8){
    return {pass:false,reason:"Winner lifecycle: extension has not worsened enough since the previous trim to justify harvesting again.",life};
  }

  let maxPct=0.25;
  if(highFroth||(fading&&pnl>=60))maxPct=0.45;
  else if(fading||moderateFroth||pnl>=75)maxPct=0.35;

  // Progressive de-risking, not geometric liquidation: later trims are capped.
  if(life.priorTrimCount===1)maxPct=Math.min(maxPct,0.25);
  if(life.priorTrimCount>=2)maxPct=Math.min(maxPct,0.15);
  const remainingHarvestBudget=clamp(0.65-life.cumulativeTrimPct,0,1);
  maxPct=Math.min(maxPct,remainingHarvestBudget);
  if(maxPct<0.10&&!fading)return {pass:false,reason:"Winner lifecycle: remaining harvest budget is too small for another meaningful trim; preserve the runner.",life};

  return {pass:true,maxTrimPct:maxPct,reason:`Winner lifecycle permits another trim, capped at ${Math.round(maxPct*100)}% of remaining shares after ${life.priorTrimCount} prior trim${life.priorTrimCount===1?"":"s"}.`,life};
}

export function recordWinnerTrim(history={},trade={}){
  const shares=Math.max(0,Math.floor(+trade.shares||0));
  return {...history,trimCount:Math.max(0,Math.floor(+history.trimCount||0))+1,trimmedShares:Math.max(0,Math.floor(+history.trimmedShares||0))+shares,lastTrimAt:trade.at||new Date().toISOString(),lastTrimPrice:Number.isFinite(+trade.price)?+trade.price:null,lastTrimExtension:Number.isFinite(+trade.extensionScore)?+trade.extensionScore:null};
}
