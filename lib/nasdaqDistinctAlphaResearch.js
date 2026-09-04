// Broader regime-conditioned leadership batch.
const base=Object.freeze({researchSignalSource:"price-only",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumAverageDollarVolume:30_000_000,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1_000,timeStopSessions:252,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0,rankedAdaptiveRebalanceEnabled:true,rankedAdaptiveEqualWeightEnabled:true});
const w={momentum:.08,longMomentum:.14,mediumMomentum:.12,shortMomentum:.04,veryShortMomentum:0,relativeStrength:.3,stability:.06,lowVolatility:.06,technical:.04,pullback:.03,liquidity:.03};
function make(key,weak,strong,weakCad,strongCad,threshold,hold,buffer,stop=16){const t=strong;return{key,overrides:{...base,researchRankMode:"multi-horizon-price-alpha",priceAlphaWeights:w,rankedWeakBreadthThresholdPct:threshold,rankedWeakBreadthRebalanceSessions:weakCad,rankedStrongBreadthRebalanceSessions:strongCad,rankedAdaptiveTargetEnabled:weak!==strong,rankedWeakBreadthTargetCount:weak,rankedStrongBreadthTargetCount:strong,rankedTargetCount:t,rankedExitBuffer:buffer,rankedMinimumHoldSessions:hold,rankedEntryQueueCount:t*3,buyTargetPct:.99/t,strongBuyTargetPct:.99/t,buyMaxPositionPct:1/t,strongBuyMaxPositionPct:1/t,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:t,maxSectorPositions:t,maxSectorPct:1,minimumInitialStopPct:stop,maximumInitialStopPct:stop}};}
export function pointInTimeNasdaqDistinctAlphaDefinitions(){const v=[
 make("fixed4-5-15",4,4,5,15,50,15,8),
 make("fixed4-3-15",4,4,3,15,50,15,8),
 make("fixed4-5-10",4,4,5,10,50,15,8),
 make("fixed5-5-15",5,5,5,15,50,15,10),
 make("three-five",3,5,5,15,50,15,10),
 make("two-five",2,5,5,15,50,15,10),
 make("three-four",3,4,5,15,50,15,8),
 make("threshold45",3,5,5,15,45,15,10),
 make("threshold55",3,5,5,15,55,15,10),
 make("patient",3,5,5,20,50,20,12,18)];
 return v.map((x,i)=>({id:`r${45+i}-regime-${x.key}`,researchGeneration:`R${45+i}`,label:`Regime leadership ${x.key}`,family:"broader-regime-leadership",mechanism:"Breadth-conditioned multi-horizon leadership",control:false,overrides:x.overrides}));}
export function pointInTimeNasdaqDistinctAlphaControls(){const m=make("control",4,4,5,15,50,15,8).overrides;return[{id:"r45-control-momentum",label:"Matched simple momentum",family:"control",control:true,overrides:{...m,researchRankMode:"momentum-only"}},{id:"r45-control-random",label:"Matched random ranking",family:"control",control:true,overrides:{...m,researchRankMode:"random-placebo",researchRandomSeed:45}}];}
