// Persistent price-pattern consensus proxies.
// Preview research only; production V11 remains untouched.
const root=Object.freeze({researchSignalSource:"price-only",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:0,blockChaseEntries:false,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1000,timeStopSessions:252,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0,researchRankMode:"price-pattern"});
const weights=Object.freeze({
 persistent:{return120Ex20:.35,return60Ex5:.25,return20:.05,return5:-.08,volatility60Pct:-.12,alpha60VsSpy:.12,alpha60VsQqq:.16,controlledPullbackScore:.05},
 medium:{return120Ex20:.18,return60Ex5:.36,return20:.16,return5:-.12,volatility60Pct:-.10,alpha60VsSpy:.12,alpha60VsQqq:.18,controlledPullbackScore:.06},
 restrained:{return120Ex20:.25,return60Ex5:.25,return20:.05,return5:-.10,volatility60Pct:-.25,alpha60VsSpy:.13,alpha60VsQqq:.18,controlledPullbackScore:.10}
});
function cfg(target,liq,hold,reb,stop,key){const pct=.99/target;return{...root,minimumAverageDollarVolume:liq,rankedTargetCount:target,rankedExitBuffer:target*2,rankedEntryQueueCount:target*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:reb,buyTargetPct:pct,strongBuyTargetPct:pct,buyMaxPositionPct:1/target,strongBuyMaxPositionPct:1/target,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:target,maxSectorPositions:Math.max(2,Math.ceil(target/2)),maxSectorPct:.5,minimumInitialStopPct:stop,maximumInitialStopPct:stop,pricePatternWeights:weights[key]};}
const v=Object.freeze([
 ["persistent4",4,100e6,20,10,16,"persistent"],["persistent6",6,100e6,20,10,18,"persistent"],["persistent8",8,100e6,30,15,20,"persistent"],
 ["medium4",4,100e6,15,5,14,"medium"],["medium6",6,100e6,20,10,16,"medium"],["medium8",8,100e6,25,10,18,"medium"],
 ["restrained4",4,300e6,20,10,16,"restrained"],["restrained6",6,300e6,25,10,18,"restrained"],["restrained8",8,300e6,30,15,20,"restrained"],
 ["persistent6slow",6,300e6,40,20,22,"persistent"]
]);
export function pointInTimeNasdaqDistinctAlphaDefinitions(){return v.map((x,i)=>({id:`r${45+i}-pattern-${x[0]}`,researchGeneration:`R${45+i}`,label:x[0],family:"persistent-price-pattern",mechanism:"Explicit causal multi-horizon return and dual-benchmark alpha pattern",control:false,overrides:cfg(...x.slice(1))}));}
export function pointInTimeNasdaqDistinctAlphaControls(){return[
 {id:"r45-control-random",label:"Matched random price-pattern lifecycle",family:"control",control:true,overrides:{...cfg(6,100e6,20,10,18,"persistent"),researchRankMode:"random-placebo",researchRandomSeed:85}},
 {id:"r45-control-momentum",label:"Matched simple momentum lifecycle",family:"control",control:true,overrides:{...cfg(6,100e6,20,10,18,"persistent"),researchRankMode:"momentum-only"}}
];}
