// R53 concentrated robustness batch.
const common=Object.freeze({researchSignalSource:"price-only",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumAverageDollarVolume:30_000_000,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1_000,timeStopSessions:252,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0});
function life(target,hold,rebalance,buffer,stop){return{rankedTargetCount:target,rankedExitBuffer:buffer,rankedEntryQueueCount:target*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:rebalance,buyTargetPct:.99/target,strongBuyTargetPct:.99/target,buyMaxPositionPct:1/target,strongBuyMaxPositionPct:1/target,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:target,maxSectorPositions:target,maxSectorPct:1,minimumInitialStopPct:stop,maximumInitialStopPct:stop};}
const w={momentum:.08,longMomentum:.14,mediumMomentum:.12,shortMomentum:.04,veryShortMomentum:0,relativeStrength:.3,stability:.06,lowVolatility:.06,technical:.04,pullback:.03,liquidity:.03};
export function pointInTimeNasdaqDistinctAlphaDefinitions(){
 const v=[
 {key:"base",hold:20,reb:10,buf:6,stop:18,weights:w},
 {key:"reb5",hold:20,reb:5,buf:6,stop:18,weights:w},
 {key:"reb15",hold:20,reb:15,buf:6,stop:18,weights:w},
 {key:"hold10",hold:10,reb:10,buf:6,stop:18,weights:w},
 {key:"hold30",hold:30,reb:10,buf:6,stop:18,weights:w},
 {key:"tight-buffer",hold:20,reb:10,buf:4,stop:18,weights:w},
 {key:"wide-buffer",hold:20,reb:10,buf:9,stop:18,weights:w},
 {key:"stop14",hold:20,reb:10,buf:6,stop:14,weights:w},
 {key:"stop22",hold:20,reb:10,buf:6,stop:22,weights:w},
 {key:"balanced-rs",hold:20,reb:10,buf:6,stop:18,weights:{momentum:.06,longMomentum:.16,mediumMomentum:.14,shortMomentum:.03,veryShortMomentum:0,relativeStrength:.34,stability:.07,lowVolatility:.07,technical:.03,pullback:.02,liquidity:.02}}];
 return v.map((x,i)=>{const g=45+i;return{id:`r${g}-r53c-${x.key}`,researchGeneration:`R${g}`,label:`R53 concentrated ${x.key}`,family:"r53-concentrated-robustness",mechanism:"Three-position multi-horizon leadership robustness",control:false,overrides:{...common,...life(3,x.hold,x.reb,x.buf,x.stop),researchRankMode:"multi-horizon-price-alpha",priceAlphaWeights:x.weights}};});
}
export function pointInTimeNasdaqDistinctAlphaControls(){const m={...common,...life(6,20,15,12,18)};return[{id:"r45-control-momentum",label:"Matched simple momentum",family:"control",control:true,overrides:{...m,researchRankMode:"momentum-only"}},{id:"r45-control-random",label:"Matched random ranking",family:"control",control:true,overrides:{...m,researchRankMode:"random-placebo",researchRandomSeed:45}}];}
