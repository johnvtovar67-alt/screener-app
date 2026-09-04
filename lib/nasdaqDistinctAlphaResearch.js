// Concentrated full-evidence factor batch derived from the auditable V11 dataset.
// Preview research only; production V11 remains untouched.
const root=Object.freeze({researchSignalSource:"full-evidence",independentLifecycle:true,ignoreSignalPositionActions:true,exitOnUniverseRemoval:true,benchmarkSymbols:["SPY","QQQ"],benchmarkCompletionSymbol:null,liquidateAtEnd:true,requireLiquidityPass:true,minimumAverageDollarVolume:30_000_000,minimumPrice:5,slippageBps:12,commissionPerOrder:0,requireEntryTimingPass:false,requireTrendAlignment:false,requireRelativeStrength:false,minimumResearchFactorCoverage:7,blockChaseEntries:true,maxEntryGapPct:3,selectionMode:"ranked",minimumQualifiedSessions:1,maxIssuerPositions:1,classifyStopExits:true,ratchetRiskPlanStop:false,timeStopMaxReturnPct:1000,timeStopSessions:126,maxVolatility60Pct:100,volatilityTargetPct:null,riskBudgetPct:null,baseRankWeight:0});
function cfg(mode,target,hold,reb,stop,buffer=2){const pct=.99/target;return{...root,researchRankMode:mode,rankedTargetCount:target,rankedExitBuffer:target*buffer,rankedEntryQueueCount:target*3,rankedMinimumHoldSessions:hold,rankedRebalanceSessions:reb,buyTargetPct:pct,strongBuyTargetPct:pct,buyMaxPositionPct:1/target,strongBuyMaxPositionPct:1/target,buyMaxFactorPct:1,strongBuyMaxFactorPct:1,maxPositions:target,maxSectorPositions:Math.max(2,Math.ceil(target/2)),maxSectorPct:.5,minimumInitialStopPct:stop,maximumInitialStopPct:stop};}
const v=Object.freeze([
 ["v11blend-t4","momentum-dominant-quality-blend",4,15,5,16,2],["v11blend-t6","momentum-dominant-quality-blend",6,15,5,16,2],["v11blend-t8","momentum-dominant-quality-blend",8,20,10,18,2],
 ["durable-t4","durable-quality-momentum",4,20,10,18,2],["durable-t6","durable-quality-momentum",6,20,10,18,2],
 ["qualitymom-t4","quality-momentum-leadership",4,15,5,16,2],["qualitymom-t6","quality-momentum-leadership",6,20,10,18,2],
 ["quality-t4","quality-only",4,30,15,20,3],["entrymom-t4","momentum-first-entry-disciplined-blend",4,15,5,14,2],["entrymom-t6","momentum-first-entry-disciplined-blend",6,15,5,16,2]
]);
export function pointInTimeNasdaqDistinctAlphaDefinitions(){return v.map((x,i)=>({id:`r${45+i}-full-${x[0]}`,researchGeneration:`R${45+i}`,label:x[0],family:"concentrated-full-evidence",mechanism:"Auditable full-evidence quality and momentum leadership",control:false,overrides:cfg(...x.slice(1))}));}
export function pointInTimeNasdaqDistinctAlphaControls(){return[
 {id:"r45-control-random",label:"Matched random full-evidence t6",family:"control",control:true,overrides:{...cfg("momentum-dominant-quality-blend",6,15,5,16,2),researchRankMode:"random-placebo",researchRandomSeed:65}},
 {id:"r45-control-momentum",label:"Matched simple momentum t6",family:"control",control:true,overrides:{...cfg("momentum-dominant-quality-blend",6,15,5,16,2),researchRankMode:"momentum-only"}}
];}
