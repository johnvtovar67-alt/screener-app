// Post-earnings drift/price-confirmation batch.
// Preview research only; production V11 remains untouched.
const root=Object.freeze({researchSignalSource:"earnings-event",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1000,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0,researchRankMode:"post-earnings-drift",requireEarningsSurpriseFactors:true});
const weights=Object.freeze({
 surprise:{surprise:.55,residual20:.2,residual60:.15,recency:.1},
 confirm:{surprise:.35,residual20:.3,residual60:.25,recency:.1},
 durable:{surprise:.4,residual20:.15,residual60:.35,recency:.1}
});
function cfg(target,liq,hold,reb,stop,minScore,maxDays,w){const pct=.99/target;return{...root,minimumAverageDollarVolume:liq,rankedTargetCount:target,rankedExitBuffer:target*2,rankedEntryQueueCount:target*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:reb,timeStopSessions:maxDays,buyTargetPct:pct,strongBuyTargetPct:pct,buyMaxPositionPct:1/target,strongBuyMaxPositionPct:1/target,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:target,maxSectorPositions:Math.max(2,Math.ceil(target/2)),maxSectorPct:.5,minimumInitialStopPct:stop,maximumInitialStopPct:stop,earningsDriftWeights:weights[w],minEarningsSurpriseScore:minScore,minSessionsSinceEarnings:1,maxSessionsSinceEarnings:maxDays};}
const v=Object.freeze([
 ["surprise4-fast",4,100e6,5,5,12,.25,20,"surprise"],["surprise6",6,100e6,10,5,14,.25,40,"surprise"],["surprise8",8,100e6,10,5,16,.20,40,"surprise"],
 ["confirm4",4,100e6,5,5,12,.15,20,"confirm"],["confirm6",6,100e6,10,5,14,.15,40,"confirm"],["confirm8",8,100e6,10,10,16,.15,40,"confirm"],
 ["durable4",4,300e6,10,5,14,.20,30,"durable"],["durable6",6,300e6,10,10,16,.20,40,"durable"],["strict4",4,100e6,5,5,12,.40,20,"surprise"],["strict6",6,100e6,10,5,14,.40,40,"confirm"]
]);
export function pointInTimeNasdaqDistinctAlphaDefinitions(){return v.map((x,i)=>({id:`r${45+i}-earn-${x[0]}`,researchGeneration:`R${45+i}`,label:x[0],family:"post-earnings-drift",mechanism:"Causal post-earnings drift with residual price confirmation",control:false,overrides:cfg(...x.slice(1))}));}
export function pointInTimeNasdaqDistinctAlphaControls(){return[
 {id:"r45-control-random",label:"Matched random earnings-eligible ranking",family:"control",control:true,overrides:{...cfg(6,100e6,10,5,14,.25,40,"surprise"),researchRankMode:"random-placebo",researchRandomSeed:55}},
 {id:"r45-control-momentum",label:"Matched earnings-universe momentum",family:"control",control:true,overrides:{...cfg(6,100e6,10,5,14,.25,40,"surprise"),researchRankMode:"momentum-only"}}
];}
