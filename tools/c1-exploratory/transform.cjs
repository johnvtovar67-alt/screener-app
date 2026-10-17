// Checked, in-memory challenger seams only. No source file is rewritten.
const {replaceOnce}=require('../c1-research/engine.cjs');
function challengerTransform(arm){return (file,source)=>{
 const c=(a,b)=>{source=replaceOnce(source,a,b);};
 const sizing=typeof arm.sizing==='object'?arm.sizing:null;
 if(file==='lib/c1FrozenOptions.js'&&sizing)c('// Owner-authorized live-account overlay.',`for(const config of Object.values(C1_FROZEN_OPTIONS))Object.assign(config,${JSON.stringify({maxPositions:arm.position_capacity,rankedTargetCount:arm.position_capacity,buyMaxPositionPct:sizing.high,strongBuyMaxPositionPct:sizing.high})});\n// Owner-authorized live-account overlay.`);
 if(file==='lib/c1StockClassification.js'&&arm.entry_selection_cap===9){c('const V11_PRODUCTION_TARGET_COUNT=3,','const V11_PRODUCTION_TARGET_COUNT=9,');c('candidates.length < V11_PRODUCTION_TARGET_COUNT','candidates.length < 3');}
 if(file==='lib/c1RecentMomentumGate.js'){
  if(arm.id==='M-entry-off')c('entryAllowed: !weakLatest && (!negativeWindows || recovery)','entryAllowed: true');
  if(arm.id==='M-macd-off'){
   c('const weakLatest = ret1 < 0 && macdImproving === false;','const weakLatest = ret1 < 0;');c('const recovery = ret1 > 0 && macdImproving === true;','const recovery = ret1 > 0;');c('entryAllowed: !weakLatest && (!negativeWindows || recovery)','entryAllowed: !negativeWindows || ret1 > 0');c('const canStart = negativeWindows && ret1 < 0 && macdImproving === false;','const canStart = negativeWindows && ret1 < 0;');c('const canContinue = consecutive && previousStreak > 0 && negativeWindows && macdImproving === false;','const canContinue = consecutive && previousStreak > 0 && negativeWindows;');
  }
  if(arm.id==='M-deterioration-off'){c('const canStart = negativeWindows && ret1 < 0 && macdImproving === false;','const canStart = false;');c('const canContinue = consecutive && previousStreak > 0 && negativeWindows && macdImproving === false;','const canContinue = false;');}
  if(arm.id==='M-giveback-off')c('const profitGivebackQualified = meaningfulGiveback && weakLatest;','const profitGivebackQualified = false;');
 }
 if(file==='lib/c1RecentMomentumChallengerSimulator.js'&&sizing){
  c('        if(recordedBuy && !recordedBuy.shares)continue;',"        if(recordedBuy && !recordedBuy.shares)continue;\n        if(!recordedBuy && config.researchTargetPct(order.signal,{date:order.recentMomentumSourceSession})===null){noteEntrySkip('outside-frozen-nine-name-queue');continue;}");
  c('      const rankedExitBuffer = Math.max(\n        rankedTargetCount,','      const rankedExitBuffer = Math.max(\n        1,');
  c('          targetPct: Array.isArray(config.rankedTargetWeights)','          researchTargetDollars: config.researchTargetPct(signal,session)===null?null:config.researchTargetPct(signal,session)*equityValue(cash,positions,prices),\n          researchLowerDollars: config.researchTargetPct(signal,session)===null?null:config.researchLowerPct*equityValue(cash,positions,prices),\n          targetPct: config.researchTargetPct(signal,session) ?? (Array.isArray(config.rankedTargetWeights)');
  c('            : null,\n          factor: factorOf(signal),','            : null),\n          factor: factorOf(signal),');
  c('Math.max(0,currentEquity * targetPct-existingValue)','Math.max(0,(order.researchTargetDollars ?? currentEquity * targetPct)-existingValue)');
  c('        if (!recordedBuy && (shares < 1 || cost < config.minimumTrade || cost > cash))',"        if(!completion && !recordedBuy && shares*fill+fill < order.researchLowerDollars){noteEntrySkip('research-minimum-allocation');continue;}\n        if (!recordedBuy && (shares < 1 || cost < config.minimumTrade || cost > cash))");
 }
 return source;
};}
module.exports={challengerTransform};
