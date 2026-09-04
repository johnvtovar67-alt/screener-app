// Diversified benchmark-competitive momentum/residual batch.
// Preview research only; production V11 remains untouched.
const root=Object.freeze({researchSignalSource:"price-only",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1_000,timeStopSessions:252,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0});
const factors=Object.freeze({
 long:{mode:"multi-horizon-price-alpha",key:"priceAlphaWeights",weights:{momentum:.1,longMomentum:.45,mediumMomentum:.12,shortMomentum:0,veryShortMomentum:-.05,relativeStrength:.3,stability:.03,lowVolatility:0,technical:0,pullback:.03,liquidity:.02}},
 balanced:{mode:"multi-horizon-price-alpha",key:"priceAlphaWeights",weights:{momentum:.12,longMomentum:.25,mediumMomentum:.25,shortMomentum:.08,veryShortMomentum:-.04,relativeStrength:.25,stability:.03,lowVolatility:0,technical:.02,pullback:.02,liquidity:.02}},
 residual:{mode:"benchmark-residual-momentum",key:"benchmarkResidualWeights",required:"requireBenchmarkResidualFactors",weights:{relative120:.7,relative60:.2,sectorAwareMomentum:0,lowVolatility:0,drawdownResilience:.1,controlledPullback:0}}
});
function cfg(f,target,liq,hold,reb,stop,sectorCount,sectorPct){const x=factors[f],pct=.99/target;return{...root,minimumAverageDollarVolume:liq,rankedTargetCount:target,rankedExitBuffer:Math.ceil(target*1.75),rankedEntryQueueCount:target*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:reb,buyTargetPct:pct,strongBuyTargetPct:pct,buyMaxPositionPct:1/target,strongBuyMaxPositionPct:1/target,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:target,maxSectorPositions:sectorCount,maxSectorPct:sectorPct,minimumInitialStopPct:stop,maximumInitialStopPct:stop,researchRankMode:x.mode,[x.key]:x.weights,...(x.required?{[x.required]:true}:{})};}
const v=Object.freeze([
 ["long-t8", "long",8,100e6,20,10,18,3,.40],["long-t10","long",10,100e6,20,10,18,4,.40],["long-t12","long",12,100e6,30,15,20,4,.35],
 ["balanced-t8","balanced",8,100e6,15,10,16,3,.40],["balanced-t10","balanced",10,100e6,20,10,18,4,.40],["balanced-t12","balanced",12,100e6,30,15,20,4,.35],
 ["residual-t8","residual",8,100e6,20,10,18,3,.40],["residual-t10","residual",10,100e6,30,15,20,4,.40],["residual-t12","residual",12,100e6,30,20,22,4,.35],
 ["long-t10-slow","long",10,300e6,40,20,22,4,.40]
]);
export function pointInTimeNasdaqDistinctAlphaDefinitions(){return v.map((x,i)=>({id:`r${45+i}-div-${x[0]}`,researchGeneration:`R${45+i}`,label:x[0],family:"diversified-benchmark-competitive",mechanism:"Diversified sector-capped long-horizon leadership",control:false,overrides:cfg(...x.slice(1))}));}
export function pointInTimeNasdaqDistinctAlphaControls(){return[
 {id:"r45-control-random",label:"Matched random t10",family:"control",control:true,overrides:{...cfg("long",10,100e6,20,10,18,4,.4),researchRankMode:"random-placebo",researchRandomSeed:45}},
 {id:"r45-control-momentum",label:"Matched simple momentum t10",family:"control",control:true,overrides:{...cfg("long",10,100e6,20,10,18,4,.4),researchRankMode:"momentum-only"}}
];}
