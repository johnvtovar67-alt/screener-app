// Exact, independently hashed phase seams compose with the prior accounting seam.
// Frozen generators and historical comparison pins are not rewritten.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const META={
  "imports": "import {createC1SimulatorRanking} from './c1SimulatorRanking';\nimport {createC1SimulatorPhases} from './c1SimulatorPhases';\n",
  "setup": "const {researchRank,crossSectionalRankContext,expandedResearchSource,entrySignalPool,entrySignalQualifies} = createC1SimulatorRanking({number,optionalNumber,clamp,average,symbolOf,sectorOf});\nconst {queueC1Entries,c1SaleEconomics,c1PurchaseEconomics,c1ExitEligibility,tradePrice} = createC1SimulatorPhases({number,optionalNumber,clamp,symbolOf,factorOf,sectorOf,issuerOf,entrySignalQualifies,expandedResearchSource,persistenceEligible,researchRank});\n\n",
  "rankModule": {
    "path": "lib/c1SimulatorRanking.js",
    "prefix": "// Pure rank, context and eligibility functions; copied verbatim from the canonical account simulator.\n// Numeric helpers and symbol/sector semantics remain supplied by that engine.\nexport function createC1SimulatorRanking({number,optionalNumber,clamp,average,symbolOf,sectorOf}) {\n",
    "suffix": "  return {researchRank,crossSectionalRankContext,expandedResearchSource,entrySignalPool,entrySignalQualifies};\n}\n"
  },
  "phaseModule": {
    "path": "lib/c1SimulatorPhases.js",
    "prefix": "// Pure queue, fill-price/economics and exit-eligibility phases. State commits stay in the account simulator.\nexport function createC1SimulatorPhases({number,optionalNumber,clamp,symbolOf,factorOf,sectorOf,issuerOf,entrySignalQualifies,expandedResearchSource,persistenceEligible,researchRank}) {\n",
    "suffix": "  return {queueC1Entries,c1SaleEconomics,c1PurchaseEconomics,c1ExitEligibility,tradePrice};\n}\n"
  },
  "parts": [
    {
      "name": "ranking",
      "sha256": "343d48f5b8e6848fe7ae42684cd3f0887c3bc7e3f2251746e4f02014842e1a17",
      "replacement": "// Pure rank/context/eligibility phase is shared through c1SimulatorRanking.\n\n",
      "module": "lib/c1SimulatorRanking.js",
      "prefix": "// Pure rank, context and eligibility functions; copied verbatim from the canonical account simulator.\n// Numeric helpers and symbol/sector semantics remain supplied by that engine.\nexport function createC1SimulatorRanking({number,optionalNumber,clamp,average,symbolOf,sectorOf}) {\n",
      "suffix": "  return {researchRank,crossSectionalRankContext,expandedResearchSource,entrySignalPool,entrySignalQualifies};\n}\n",
      "sourceStart": "function stableResearchHash(",
      "sourceEnd": "function updateResearchPersistence("
    },
    {
      "name": "queue",
      "sha256": "b2020264410e46471b1c0f48ea5926d20d3168b5d99d7a78f4c2c8b36ac63be0",
      "replacement": "      for (const order of queueC1Entries({config,session,sessionIndex,allocationBlocked,cooldownThrough,researchPersistence,persistence,rankedSelection,rankRebalance,rankedPool,entrySignals,rankContext,accountSeed,positions,completionEligible,rankedTargetCount,previousPending:pending})) pending.push(order);\n",
      "module": "lib/c1SimulatorPhases.js",
      "prefix": "function queueC1Entries({config,session,sessionIndex,allocationBlocked,cooldownThrough,researchPersistence,persistence,rankedSelection,rankRebalance,rankedPool,entrySignals,rankContext,accountSeed,positions,completionEligible,rankedTargetCount,previousPending}) {\n  const pending = previousPending.slice();\n",
      "suffix": "  return pending.slice(previousPending.length);\n}\n\n",
      "sourceStart": "      const eligibleForRankedEntry = (signal) =>",
      "sourceEnd": "    }\n  }\n  if (config.liquidateAtEnd"
    },
    {
      "name": "sale",
      "sha256": "393a27519a552b585eb2f8940467b7e096158eb1d8af33269786d6dba81b6658",
      "replacement": "    const sale = c1SaleEconomics({position,shares,fill,commission});\n    if (!sale) return null;\n    const {quantity,entryCommissionAllocated,realizedPnl} = sale;\n",
      "module": "lib/c1SimulatorPhases.js",
      "prefix": "function c1SaleEconomics({position,shares,fill,commission}) {\n",
      "suffix": "  return {quantity,entryCommissionAllocated,realizedPnl};\n}\n\n",
      "sourceStart": "    const quantity = Math.min(position.shares, Math.max(0, shares));",
      "sourceEnd": "    cash += Math.max(0, quantity * fill - commission);"
    },
    {
      "name": "purchase",
      "sha256": "b54279953d815bcfe50352141d452899975a03641090c1be20eaa799dabf3056",
      "replacement": "        const {plannedShares,shares,executionCommission,cost} = c1PurchaseEconomics({budget,fill,completion,existing,recordedBuy,config});\n",
      "module": "lib/c1SimulatorPhases.js",
      "prefix": "function c1PurchaseEconomics({budget,fill,completion,existing,recordedBuy,config}) {\n",
      "suffix": "  return {plannedShares,shares,executionCommission,cost};\n}\n\n",
      "sourceStart": "        const plannedShares=Math.min(",
      "sourceEnd": "        if(recordedBuy && (shares<=0"
    },
    {
      "name": "exit",
      "sha256": "d23d539ae049433ec8ebf69b8c6de2f6f5d03b4c07d9ccec54d5f4d6a6e4bd39",
      "replacement": "        const {heldSessions,pnlPct,alpha20,alpha60,relativeExit,trendExit,timeExit} = c1ExitEligibility({sessionIndex,position,mark,signal,config});\n",
      "module": "lib/c1SimulatorPhases.js",
      "prefix": "function c1ExitEligibility({sessionIndex,position,mark,signal,config}) {\n",
      "suffix": "  return {heldSessions,pnlPct,alpha20,alpha60,relativeExit,trendExit,timeExit};\n}\n\n",
      "sourceStart": "        const heldSessions = Math.max(",
      "sourceEnd": "        if (rankExitSymbols.has(symbol))",
      "sourceAfter": "        let boundedReviewExit = false;"
    },
    {
      "name": "price",
      "sha256": "b55a093974cfe584841ed7e2379644a3bf01a0221ebf83ce85a895b7295d266c",
      "replacement": "// Pure fill-price phase is shared through c1SimulatorPhases.\n\n",
      "module": "lib/c1SimulatorPhases.js",
      "prefix": "function tradePrice(",
      "suffix": "  return {queueC1Entries,c1SaleEconomics,c1PurchaseEconomics,c1ExitEligibility,tradePrice};\n}\n",
      "bodyIncludesPrefix": true,
      "sourceStart": "function tradePrice(",
      "sourceEnd": "// Pure result-accounting phase"
    }
  ]
};
const hash=body=>createHash('sha256').update(body).digest('hex');
function replaceOnce(source,before,after,label){
 assert.equal(source.split(before).length,2,'Expected exactly one simulator phase '+label+' seam');
 return source.replace(before,after);
}
function checked(part,body){assert.equal(hash(body),part.sha256,'Original '+part.name+' phase bytes must remain unchanged');return body;}
function inlineBody(source,part){
 const after=part.sourceAfter?source.indexOf(part.sourceAfter):0;
 const start=source.indexOf(part.sourceStart,after),end=source.indexOf(part.sourceEnd,start);
 assert(start>=0&&end>start,'Original '+part.name+' boundaries required');
 return checked(part,source.slice(start,end));
}
function moduleBody(part){
 const source=fs.readFileSync(part.module,'utf8');
 const container=part.name==='ranking'?META.rankModule:META.phaseModule;
 assert(source.startsWith(container.prefix)&&source.endsWith(container.suffix),'Only declared '+part.module+' wrapper permitted');
 const prefix=source.indexOf(part.prefix),start=prefix+(part.bodyIncludesPrefix?0:part.prefix.length),end=source.indexOf(part.suffix,start+(part.bodyIncludesPrefix?part.prefix.length:0));
 assert(prefix>=0&&end>start,'Extracted '+part.name+' boundaries required');
 return checked(part,source.slice(start,end));
}
function extractSimulatorPhases(source){
 const bodies=META.parts.map(part=>[part,inlineBody(source,part)]);
 for(const [part,body] of bodies)source=replaceOnce(source,body,part.replacement,part.name+' body');
 source=META.imports+source;
 return replaceOnce(source,'export function validatePointInTimeDataset(',META.setup+'export function validatePointInTimeDataset(','helper binding');
}
function restoreSimulatorPhases(source){
 if(!source.includes(META.imports)){
  for(const part of META.parts)assert(!source.includes(part.replacement),'Cannot retain partial '+part.name+' extraction');
  assert(!source.includes(META.setup),'Cannot retain partial phase binding');
  return source;
 }
 source=replaceOnce(source,META.imports,'','imports');
 source=replaceOnce(source,META.setup,'','helper binding');
 for(const part of META.parts)source=replaceOnce(source,part.replacement,moduleBody(part),part.name+' restoration');
 return source;
}
function phaseModuleSources(source){
 const byName=Object.fromEntries(META.parts.map(part=>[part.name,[part,inlineBody(source,part)]]));
 const rank=META.rankModule.prefix+byName.ranking[1]+META.rankModule.suffix;
 let phases=META.phaseModule.prefix;
 for(const name of ['queue','sale','purchase','exit']){const [part,body]=byName[name];phases+=part.prefix+body+part.suffix;}
 phases+=byName.price[1]+META.phaseModule.suffix;
 return {[META.rankModule.path]:rank,[META.phaseModule.path]:phases};
}
module.exports={extractSimulatorPhases,restoreSimulatorPhases,phaseModuleSources,PHASE_HASHES:Object.fromEntries(META.parts.map(p=>[p.name,p.sha256]))};
