// Research runtime acceleration. Original function bodies and policy unchanged.
const {replaceOnce}=require('../c1-research/engine.cjs');
function calculatorTransform(file,source){
 if(file!=='lib/c1RecentMomentumChallengerSimulator.js')return source;
 const body=source.slice(source.indexOf('function entrySignalQualifies('),source.indexOf('function updateResearchPersistence('));
 if(!body||/config\s*\[/.test(body))throw Error('Unsupported eligibility access changed');
 const expanded=source.slice(source.indexOf('function expandedResearchSource('),source.indexOf('function entrySignalPool('));
 if(expanded.trim()!=="function expandedResearchSource(config = {}) {\n  return [\"full-evidence\", \"price-only\", \"earnings-event\"].includes(\n    config.researchSignalSource,\n  );\n}")throw Error('Expanded-source eligibility helper changed');
 const keys=[...new Set([...body.matchAll(/config\.([A-Za-z0-9_]+)/g)].map(m=>m[1]))].sort();
 if(keys.length!==59||!keys.includes('researchSignalSource'))throw Error('Eligibility cache dependency seam changed');
 const helper=`const researchEligibilityCache=new WeakMap(),researchConfigKeys=new WeakMap(),researchContextCache=new WeakMap(),researchImmutableSignals=new WeakSet();
function researchImmutableSignal(value,visiting=new WeakSet()){
 if(value===null||typeof value!=='object')return typeof value!=='function';
 if(researchImmutableSignals.has(value))return true;
 const proto=Object.getPrototypeOf(value);if(!Object.isFrozen(value)||visiting.has(value)||!Array.isArray(value)&&proto!==Object.prototype&&proto!==null)return false;
 visiting.add(value);for(const d of Object.values(Object.getOwnPropertyDescriptors(value)))if(!('value' in d)||!researchImmutableSignal(d.value,visiting)){visiting.delete(value);return false;}
 visiting.delete(value);researchImmutableSignals.add(value);return true;
}
function researchEligibilityKey(config){
 if(researchConfigKeys.has(config))return researchConfigKeys.get(config);
 const entries=[];for(const key of ${JSON.stringify(keys)}){const d=Object.getOwnPropertyDescriptor(config,key);if(d&&!('value' in d))return null;if(!d&&key in config)return null;const v=d?d.value:undefined;if(v!==null&&typeof v==='object'||typeof v==='function'||typeof v==='symbol'||typeof v==='bigint')return null;entries.push([key,typeof v,typeof v==='number'&&!Number.isFinite(v)?String(v):Object.is(v,-0)?'-0':v]);}
 const key=JSON.stringify(entries);if(Object.isFrozen(config))researchConfigKeys.set(config,key);return key;
}
function entrySignalQualifies(signal={},config={}){
 if(!config||typeof config!=='object'||!signal||typeof signal!=='object'||!researchImmutableSignal(signal))return researchUncachedEntrySignalQualifies(signal,config);
 const key=researchEligibilityKey(config);if(key===null)return researchUncachedEntrySignalQualifies(signal,config);
 let byConfig=researchEligibilityCache.get(signal);if(!byConfig){byConfig=new Map();researchEligibilityCache.set(signal,byConfig);}
 if(byConfig.has(key))return byConfig.get(key);const result=researchUncachedEntrySignalQualifies(signal,config);byConfig.set(key,result);return result;
}
function researchJsonSafe(value){if(value===null||typeof value==='boolean'||typeof value==='string')return true;if(typeof value==='number')return Number.isFinite(value)&&!Object.is(value,-0);if(!value||typeof value!=='object')return false;return Object.values(value).every(researchJsonSafe);}
function crossSectionalRankContext(signals=[]){
 if(!Array.isArray(signals)||!signals.length||!signals.every(s=>s&&typeof s==='object'&&researchImmutableSignal(s)))return researchUncachedRankContext(signals);
 const first=signals[0],saved=researchContextCache.get(first);
 if(saved&&saved.rows.length===signals.length&&saved.rows.every((s,i)=>s===signals[i]))return JSON.parse(saved.json);
 const result=researchUncachedRankContext(signals);if(!researchJsonSafe(result))return result;researchContextCache.set(first,{rows:signals.slice(),json:JSON.stringify(result)});return JSON.parse(JSON.stringify(result));
}
`;
 source=replaceOnce(source,'function entrySignalQualifies(signal = {}, config = {}) {',helper+'function researchUncachedEntrySignalQualifies(signal = {}, config = {}) {');
 source=replaceOnce(source,'function crossSectionalRankContext(signals = []) {','function researchUncachedRankContext(signals = []) {');
 source=replaceOnce(source,'  const allSessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];','  Object.freeze(config); // private research configuration is immutable during one source simulation\n  const allSessions = Array.isArray(dataset.sessions) ? dataset.sessions : [];');
 return source;
}
module.exports={calculatorTransform};
