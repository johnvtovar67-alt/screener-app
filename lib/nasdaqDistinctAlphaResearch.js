// Diversified momentum-spine and multi-horizon batch.
const base=Object.freeze({researchSignalSource:"price-only",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumAverageDollarVolume:30_000_000,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1_000,timeStopSessions:252,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0});
const multi={momentum:.08,longMomentum:.14,mediumMomentum:.12,shortMomentum:.04,veryShortMomentum:0,relativeStrength:.3,stability:.06,lowVolatility:.06,technical:.04,pullback:.03,liquidity:.03};
const spine={momentum:.15,relative120:.38,relative60:.12,continuity:.2,anchor:.1,stability:.03,contraction:.02};
function life(t,hold,reb,buf,stop=16){return{rankedTargetCount:t,rankedExitBuffer:buf,rankedEntryQueueCount:t*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:reb,buyTargetPct:.99/t,strongBuyTargetPct:.99/t,buyMaxPositionPct:1/t,strongBuyMaxPositionPct:1/t,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:t,maxSectorPositions:t,maxSectorPct:1,minimumInitialStopPct:stop,maximumInitialStopPct:stop};}
const v=[
 ["spine4-fast","momentum-spine",4,20,5,8,{momentumSpineWeights:spine}],
 ["spine4-medium","momentum-spine",4,15,10,8,{momentumSpineWeights:spine}],
 ["spine5","momentum-spine",5,20,10,10,{momentumSpineWeights:spine}],
 ["spine6","momentum-spine",6,20,10,12,{momentumSpineWeights:spine}],
 ["spine4-recent","momentum-spine",4,15,5,8,{momentumSpineWeights:{momentum:.12,relative120:.27,relative60:.28,continuity:.16,anchor:.1,stability:.04,contraction:.03}}],
 ["spine4-stable","momentum-spine",4,20,10,8,{momentumSpineWeights:{momentum:.12,relative120:.34,relative60:.12,continuity:.18,anchor:.08,stability:.1,contraction:.06}}],
 ["multi4-anchor","multi-horizon-price-alpha",4,20,15,8,{priceAlphaWeights:multi}],
 ["multi4-patient","multi-horizon-price-alpha",4,30,20,12,{priceAlphaWeights:multi}],
 ["multi5-patient","multi-horizon-price-alpha",5,30,15,15,{priceAlphaWeights:multi}],
 ["multi6-patient","multi-horizon-price-alpha",6,30,15,18,{priceAlphaWeights:multi}]];
export function pointInTimeNasdaqDistinctAlphaDefinitions(){return v.map((x,i)=>({id:`r${45+i}-hybrid-${x[0]}`,researchGeneration:`R${45+i}`,label:x[0],family:"diversified-leadership",mechanism:x[1],control:false,overrides:{...base,...life(x[2],x[3],x[4],x[5]),researchRankMode:x[1],...x[6]}}));}
export function pointInTimeNasdaqDistinctAlphaControls(){const m={...base,...life(5,20,10,10)};return[{id:"r45-control-momentum",label:"Matched simple momentum",family:"control",control:true,overrides:{...m,researchRankMode:"momentum-only"}},{id:"r45-control-random",label:"Matched random ranking",family:"control",control:true,overrides:{...m,researchRankMode:"random-placebo",researchRandomSeed:45}}];}
