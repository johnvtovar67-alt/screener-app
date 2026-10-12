// Offline adapter: execute pinned production modules; cache computation, never policy.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const digest=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
const MAPS=['pendingActualRiskExits','persistence','researchPersistence','cooldownThrough','positions','benchmarkShares','lastActivePrices','pendingUniverseRemovalActions'];
const ARRAYS=['pending','trades','skippedOrders','curve','rankContextObservations'];
const SCALARS=['cash','nextPositionId','currentSessionIndex','activeSessionNumber','lastActiveSession','persistentQualityLeadership','persistentQualityLeadershipThrough','portfolioHighWatermark','portfolioRiskPausedThrough'];
function once(source,needle,replacement,label){if(source.split(needle).length!==2)throw new Error('Pinned source seam changed: '+label);return source.replace(needle,replacement);}
function createProductionReplayLoader(root,{cached=true,slippageBps=12}={}){
 if(![12,25,50].includes(slippageBps))throw new Error('Only requested 12/25/50 bps costs are supported');
 const modules=new Map(),pins={},transforms={},checkpoints=new Map(),traceBySleeve={};
 const memo=new Map(),stats={resumes:0,sessionsExecuted:0,memoHits:0,memoMisses:0};
 const configObjects=new WeakMap(),configKeys=new Map();
 const configKey=config=>{if(configObjects.has(config))return configObjects.get(config);const text=JSON.stringify(Object.fromEntries(Object.entries(config).filter(([k])=>k!=='endDate')));if(!configKeys.has(text))configKeys.set(text,'config-'+configKeys.size);const key=configKeys.get(text);configObjects.set(config,key);return key;};
 const memoize=(name,fn,configIndex)=>{const cache=new WeakMap();memo.set(name,cache);return function(...args){const first=args[0];if(!cached||!first||typeof first!=='object')return fn(...args);let values=cache.get(first);if(!values)cache.set(first,values=new Map());const key=configIndex==null?'one':configKey(args[configIndex]);if(values.has(key)){stats.memoHits++;return values.get(key);}stats.memoMisses++;const value=fn(...args);values.set(key,value);return value;};};
 const snapshotKey=(config,seed)=>configKey(config)+'|'+JSON.stringify(seed);
 function getSnapshot(sessions,config,seed,executions){
  if(!cached||!seed||!executions)return null;
  const cp=checkpoints.get(snapshotKey(config,seed));if(!cp||cp.nextIndex>sessions.length)return null;
  if(cp.prefix.some((s,i)=>sessions[i]!==s))return null;
  const records=(executions.sessions||[]).filter(r=>r.date<=cp.through);
  if(JSON.stringify(records)!==cp.recordsJson)return null;
  stats.resumes++;return clone(cp.state);
 }
 function checkpoint(sessions,config,seed,executions,nextIndex,state){
  stats.sessionsExecuted++;
  if(!seed)return;
  const through=sessions[nextIndex-1].date;
  if(!executions||executions.projectionDate)return;
  const summary={date:through,cash:state.cash,positions:state.positions,pending:state.pending,persistence:state.persistence,researchPersistence:state.researchPersistence,cooldownThrough:state.cooldownThrough,pendingActualRiskExits:state.pendingActualRiskExits,pendingUniverseRemovalActions:state.pendingUniverseRemovalActions,accountRisk:{highWater:state.portfolioHighWatermark,pausedThrough:state.portfolioRiskPausedThrough,activeSessionNumber:state.activeSessionNumber},nextPositionId:state.nextPositionId};
  (traceBySleeve[seed.sleeve]??=new Map()).set(through,clone(summary));
  if(cached)checkpoints.set(snapshotKey(config,seed),{nextIndex,through,prefix:sessions.slice(0,nextIndex),recordsJson:JSON.stringify((executions.sessions||[]).filter(r=>r.date<=through)),state:clone({...state,__nextIndex:nextIndex,__through:through})});
 }
 function transform(file,source){
  if(file==='lib/c1AccountSimulator.js'){
   const capture='{benchmarkCurves,'+[...MAPS.map(n=>n+':[...'+n+']'),...ARRAYS,...SCALARS].join(',')+'}';
   const restore=[`for(const [key,rows] of Object.entries(__restored.benchmarkCurves))benchmarkCurves[key].push(...rows);`,...MAPS.map(n=>`${n}.clear();for(const [k,v] of __restored.${n})${n}.set(k,v);`),...ARRAYS.map(n=>`${n}.push(...__restored.${n});`),...SCALARS.map(n=>`${n}=__restored.${n};`)].join('\n');
   source=once(source,'  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex++) {\n    currentSessionIndex = sessionIndex;',`  const __restored=__auditGetSnapshot(sessions,config,accountSeed,actualExecutions);\n  if(__restored){${restore}\n    actualReplay?.__auditConsumeThrough(__restored.__through);\n  }\n  for (let sessionIndex = __restored?.__nextIndex??0; sessionIndex < sessions.length; sessionIndex++) {\n    currentSessionIndex = sessionIndex;`,'resume-state');
   source=once(source,'    }\n  }\n  if (config.liquidateAtEnd && lastActiveSession && positions.size) {',`    }\n    __auditCheckpoint(sessions,config,accountSeed,actualExecutions,sessionIndex+1,${capture});\n  }\n  if (config.liquidateAtEnd && lastActiveSession && positions.size) {`,'completed-state');
   source+='\npriceMap=__auditMemoize("priceMap",priceMap);\nentrySignalPool=__auditMemoize("entrySignalPool",entrySignalPool,1);\ncrossSectionalRankContext=__auditMemoize("crossSectionalRankContext",crossSectionalRankContext);\nentrySignalQualifies=__auditMemoize("entrySignalQualifies",entrySignalQualifies,1);\n';
  }
  if(file==='lib/c1ActualFillReplay.js')source=once(source,'  return {\n    has(date,symbol,side,reason)',`  return {\n    __auditConsumeThrough(through){for(const [date,fills] of records)if(date<=through)for(const fill of fills)used.add(fill.key);},\n    has(date,symbol,side,reason)`,'restore-consumed-fill-keys');
  return source;
 }
 function resolve(request,from){if(request.startsWith('node:'))return request;if(!request.startsWith('.'))return path.resolve(root,request);const candidate=path.resolve(path.dirname(from),request);for(const name of [candidate,candidate+'.js',path.join(candidate,'index.js')])if(fs.existsSync(name))return name;throw new Error('Cannot resolve '+request);}
 function load(request,from=path.join(root,'__audit__.js')){
  const file=resolve(request,from);if(file.startsWith('node:'))return require(file);if(modules.has(file))return modules.get(file).exports;
  const relative=path.relative(root,file),original=fs.readFileSync(file,'utf8');pins[relative]=digest(original);let source=transform(relative,original);if(source!==original)transforms[relative]={originalSha256:digest(original),adaptedSha256:digest(source)};
  const record={exports:{}};modules.set(file,record);const imported={};
  source=source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];?/g,(_,specifiers,dependency)=>{const values=load(dependency,file);for(const raw of specifiers.split(',')){const [remote,local=remote]=raw.trim().split(/\s+as\s+/);if(!remote)continue;if(!(remote in values))throw new Error(remote+' missing in '+dependency);imported[local]=values[remote];}return '';});
  if(/^\s*import\s/m.test(source))throw new Error('Unsupported import: '+relative);const names=new Set();source=source.replace(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,(match,name)=>{names.add(name);return match.replace('export ','');}).replace(/export\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g,(match,name)=>{names.add(name);return match.replace('export ','');}).replace(/export\s*{([\s\S]*?)}\s*;?/g,(_,list)=>{for(const name of list.split(',')){const clean=name.trim();if(/\s+as\s+/.test(clean))throw new Error('Aliased export unsupported');if(clean)names.add(clean);}return '';});source+='\nmodule.exports={'+[...names].join(',')+'};';
  const context={module:record,exports:record.exports,console,process,performance,Date,Intl,Math,Number,String,Object,Array,Set,Map,WeakMap,Boolean,RegExp,Error,TypeError,JSON,URL,URLSearchParams,AbortController,AbortSignal,Response,fetch,setTimeout,clearTimeout,__auditGetSnapshot:getSnapshot,__auditCheckpoint:checkpoint,__auditMemoize:memoize,...imported};vm.createContext(context);vm.runInContext(source,context,{filename:file});record.exports=context.module.exports;
  if(relative==='lib/c1AccountSimulator.js'){const simulate=record.exports.simulatePointInTimePortfolio;record.exports.simulatePointInTimePortfolio=(...args)=>{try{return simulate(...args);}catch(error){checkpoints.clear();throw error;}};}
  if(relative==='lib/c1FrozenOptions.js')for(const config of Object.values(record.exports.C1_FROZEN_OPTIONS))config.slippageBps=slippageBps;
  return record.exports;
 }
 return {load,stats,pins,transforms,traceBySleeve,identity(){return {contract:'c1-production-policy-source-pin-v1',sources:pins,sourceGraphSha256:digest(JSON.stringify(Object.entries(pins).sort())),transforms,costOverlay:{onlyChangedOption:'slippageBps',value:slippageBps},adapterSha256:digest(fs.readFileSync(__filename)),cached};}};
}
module.exports={createProductionReplayLoader,digest};
