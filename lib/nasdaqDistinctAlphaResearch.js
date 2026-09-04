// Bounded neighborhood around the strongest persistent price-pattern result.
// Preview research only; production V11 remains untouched.
const root=Object.freeze({researchSignalSource:"price-only",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1000,timeStopSessions:252,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0,researchRankMode:"price-pattern",pricePatternWeights:{return120Ex20:.18,return60Ex5:.36,return20:.16,return5:-.12,volatility60Pct:-.10,alpha60VsSpy:.12,alpha60VsQqq:.18,controlledPullbackScore:.06}});
function cfg(target,liq,hold,reb,stop){const pct=.99/target;return{...root,minimumAverageDollarVolume:liq,rankedTargetCount:target,rankedExitBuffer:target*2,rankedEntryQueueCount:target*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:reb,buyTargetPct:pct,strongBuyTargetPct:pct,buyMaxPositionPct:1/target,strongBuyMaxPositionPct:1/target,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:target,maxSectorPositions:target,maxSectorPct:1,minimumInitialStopPct:stop,maximumInitialStopPct:stop};}
const v=Object.freeze([
 ["t3-fast",3,100e6,10,5,12],["t3-base",3,100e6,15,5,14],["t3-medium",3,100e6,20,10,16],["t3-slow",3,100e6,30,15,18],["t3-liquid",3,300e6,15,5,14],
 ["t4-fast",4,100e6,10,5,12],["t4-medium",4,100e6,20,10,16],["t4-sticky",4,100e6,30,10,18],
 ["t5-fast",5,100e6,15,5,14],["t5-medium",5,100e6,20,10,16]
]);
export function pointInTimeNasdaqDistinctAlphaDefinitions(){return v.map((x,i)=>({id:`r${45+i}-pattern2-${x[0]}`,researchGeneration:`R${45+i}`,label:x[0],family:"medium-price-pattern-neighborhood",mechanism:"Medium-horizon leadership with recent-spike and volatility restraint",control:false,overrides:cfg(...x.slice(1))}));}
export function pointInTimeNasdaqDistinctAlphaControls(){return[
 {id:"r45-control-random3",label:"Matched random three-stock lifecycle",family:"control",control:true,overrides:{...cfg(3,100e6,15,5,14),researchRankMode:"random-placebo",researchRandomSeed:95}},
 {id:"r45-control-random4",label:"Matched random four-stock lifecycle",family:"control",control:true,overrides:{...cfg(4,100e6,15,5,14),researchRankMode:"random-placebo",researchRandomSeed:96}}
];}
