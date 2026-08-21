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
  return {currentShares,priorTrimCount,priorTrimShares,originalShares,cumulativeTrimPct,lastTrimAt:history.lastTrimAt||null,lastTrimPrice:Number.isFinite(+history.lastTrimPrice)?+history.lastTrimPrice:null,lastTrimExtension:Number.isFinite(+history.lastTrimExtension)?+history.lastTrimExtension:null};
}

export function winnerTrimGate({position={},decision={},history={}}={}){
  const life=normalizeWinnerLifecycle(position,history),pp=decision?.profitProtection||{};
  const pnl=Number.isFinite(+pp.pnlPct)?+pp.pnlPct:(+position.gainLossPct||0);
  const extension=Number.isFinite(+pp.extension)?+pp.extension:Number.isFinite(+pp.extensionScore)?+pp.extensionScore:null;
  const vs50=Number.isFinite(+pp.vs50)?+pp.vs50:null,day=Number.isFinite(+pp.day)?+pp.day:null;
  const fading=Boolean(pp.winnerFading),highFroth=Boolean(pp.highFroth),moderateFroth=Boolean(pp.moderateFroth);
  const exceptionalFroth=(extension!==null&&extension>=90)||(vs50!==null&&vs50>=85)||(day!==null&&day>=15);

  // The first two trims may respond to extension. After two trims, the runner is
  // protected: another sale needs actual deterioration or genuinely exceptional
  // new froth, not merely the same extended condition persisting.
  if(life.priorTrimCount>=2&&!fading&&!exceptionalFroth){
    return {pass:false,reason:`Winner lifecycle: ${life.priorTrimCount} prior trims already banked profit; preserve the runner unless the trend fades or a genuinely exceptional new extension develops.`,life,exceptionalFroth};
  }
  if(life.cumulativeTrimPct>=0.60&&!fading){
    return {pass:false,reason:`Winner lifecycle: ${Math.round(life.cumulativeTrimPct*100)}% of the original position has already been harvested; no further trim without trend deterioration.`,life,exceptionalFroth};
  }

  // Require incremental evidence after a prior trim rather than repeatedly
  // responding to the same extension state.
  if(life.priorTrimCount>0&&extension!==null&&life.lastTrimExtension!==null&&!fading&&!exceptionalFroth&&extension<life.lastTrimExtension+8){
    return {pass:false,reason:"Winner lifecycle: extension has not worsened enough since the previous trim to justify harvesting again.",life,exceptionalFroth};
  }

  let maxPct=0.25;
  if(highFroth||(fading&&pnl>=60))maxPct=0.45;
  else if(fading||moderateFroth||pnl>=75)maxPct=0.35;

  // Progressive de-risking, not geometric liquidation: later trims are capped.
  if(life.priorTrimCount===1)maxPct=Math.min(maxPct,0.25);
  if(life.priorTrimCount>=2)maxPct=Math.min(maxPct,0.15);
  const remainingHarvestBudget=clamp(0.65-life.cumulativeTrimPct,0,1);
  maxPct=Math.min(maxPct,remainingHarvestBudget);
  if(maxPct<0.10&&!fading)return {pass:false,reason:"Winner lifecycle: remaining harvest budget is too small for another meaningful trim; preserve the runner.",life,exceptionalFroth};

  return {pass:true,maxTrimPct:maxPct,reason:`Winner lifecycle permits another trim, capped at ${Math.round(maxPct*100)}% of remaining shares after ${life.priorTrimCount} prior trim${life.priorTrimCount===1?"":"s"}.`,life,exceptionalFroth};
}

export function recordWinnerTrim(history={},trade={}){
  const shares=Math.max(0,Math.floor(+trade.shares||0));
  const priorTrimmed=Math.max(0,Math.floor(+history.trimmedShares||0));
  const originalShares=Math.max(Math.floor(+history.originalShares||0),Math.floor(+trade.originalShares||0),priorTrimmed+shares+Math.max(0,Math.floor(+trade.remainingShares||0)));
  return {...history,originalShares,trimCount:Math.max(0,Math.floor(+history.trimCount||0))+1,trimmedShares:priorTrimmed+shares,lastTrimAt:trade.at||new Date().toISOString(),lastTrimPrice:Number.isFinite(+trade.price)?+trade.price:null,lastTrimExtension:Number.isFinite(+trade.extensionScore)?+trade.extensionScore:null};
}
