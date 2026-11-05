import {createHash} from 'node:crypto';

const fields=['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'];
const limit=12,sampleByteLimit=4800;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const kinds=['financial-state','decision-state','representation-order','representation-json','unclassified'];
const types=['missing','null','number','boolean','string','array','object'];
const keys=new Set(('ledger pendingBySleeve paperExecution paperExecutionStatus summary version kind initialCapital startDate sleeves base cooldown15 sector40 cash positions lastDate fills id sleeve date symbol side shares price fee priceBasis eventHistory modelHistory fill reason status proposedOrderCount executable basis contract sourceSessionDate modelRevision firstDecisionSession modelIdentity observedForwardSessions eligibleForLiveCapital eligibleForAlphaClaim pointInTimeMembershipAvailable cohort equity virtualShares combinedPortfolio tradeCount pendingDecisions earliestExecutionSession buyCandidates pendingExits modelQueue sequence rank buy sell orders cashAfter sessionDate modelEventId phase weight targetWeight targetShares modelShares research-queue-only').split(' '));
const type=value=>value===undefined?'missing':value===null?'null':Array.isArray(value)?'array':typeof value;
const token=key=>keys.has(key)||/^(0|[1-9][0-9]*)$/.test(key)||/^[A-Z][A-Z0-9.-]{0,15}$/.test(key)?key:
 '~'+createHash('sha256').update(key).digest('hex').slice(0,12);
const pathFor=parts=>{
 const path='/'+parts.map(token).join('/');
 return path.length<=256?path:'/'+parts[0]+'/~'+createHash('sha256').update(path).digest('hex').slice(0,12);
};
function category(parts){
 if(parts[0]==='ledger'||parts[0]==='pendingBySleeve')return 'financial-state';
 if(parts[0]==='paperExecutionStatus')return 'decision-state';
 if(parts[0]==='paperExecution'&&parts[1]!=='modelHistory')return 'financial-state';
 if(parts[0]==='summary'&&['cash','equity','virtualShares','combinedPortfolio','sleeves','modelQueue','pendingDecisions','paperExecution'].includes(parts[1]))
  return ['modelQueue','pendingDecisions','paperExecution'].includes(parts[1])?'decision-state':'financial-state';
 return 'unclassified';
}
function snapshot(value,digest){
 const present=value!==undefined,t=type(value),out={present,type:t,sha256:digest(present?{value}:{present:false})};
 // Provider strings, serialized fill histories and unknown metadata values are
 // hash-only. This helper receives the virtual model, never an actual account.
 if(t==='null'||t==='boolean'||(t==='number'&&Number.isFinite(value)))out.value=value;
 return out;
}
function serializedHistoryEquivalent(parts,before,after){
 if(parts.length!==2||parts[0]!=='paperExecution'||parts[1]!=='modelHistory'||typeof before!=='string'||typeof after!=='string'||
  before===after||before.length>2097152||after.length>2097152)return false;
 try{
  const left=JSON.parse(before),right=JSON.parse(after);
  const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?
   Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  return Array.isArray(left)&&Array.isArray(right)&&canonical(left)===canonical(right);
 }catch{return false;}
}

// Diagnostic only: every comparison still uses the original economic hashes.
// Traverse all changed leaves, retain complete counts and a deterministic hash
// of all differences, and bound the log sample. Object enumeration order is
// representational only when its child keys and every child value agree.
// The known modelHistory JSON string is representational only when both parse
// to arrays with exactly identical canonical structures. Other string/value
// differences stay unclassified; neither classification relaxes acceptance.
// Forward-model output omits simulator openPositions (including stop/high-water
// state). This report cannot establish stop parity or private-account parity.
export function buildC1ModelParityDiagnostic(original,corrected,digest){
 const changes=[],stream=createHash('sha256'),counts=Object.fromEntries(kinds.map(k=>[k,0]));
 let changedPathCount=0;
 function change(before,after,parts,kind=category(parts)){
  if(kind==='unclassified'&&serializedHistoryEquivalent(parts,before,after))kind='representation-json';
  const row={path:pathFor(parts),kind,before:snapshot(before,digest),after:snapshot(after,digest)};
  changedPathCount++;counts[kind]++;stream.update(JSON.stringify({parts,...row})+'\n');
  if(changes.length<limit&&JSON.stringify([...changes,row]).length<=sampleByteLimit)changes.push(row);
 }
 function walk(before,after,parts){
  if(digest(before===undefined?{present:false}:{value:before})===digest(after===undefined?{present:false}:{value:after}))return;
  if(type(before)===type(after)&&(Array.isArray(before)||(before&&typeof before==='object'))){
   const childKeys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort((a,b)=>Array.isArray(before)?Number(a)-Number(b):a.localeCompare(b));
   const start=changedPathCount;
   for(const key of childKeys)walk(Object.hasOwn(before,key)?before[key]:undefined,Object.hasOwn(after,key)?after[key]:undefined,[...parts,key]);
   if(changedPathCount===start&&!Array.isArray(before)&&JSON.stringify(Object.keys(before))!==JSON.stringify(Object.keys(after)))
    change(before,after,parts,'representation-order');
   return;
  }
  change(before,after,parts);
 }
 const comparedFields=fields.map(field=>{
  const before=changedPathCount;walk(original[field],corrected[field],[field]);
  return {field,originalHash:digest({value:original[field]}),revisedHash:digest({value:corrected[field]}),changedPathCount:changedPathCount-before};
 });
 return {contract:'c1-model-parity-diagnostic-v1',comparedFields,changedPathCount,counts,
  changesHash:stream.digest('hex'),sampleLimit:limit,sampleByteLimit,sample:changes,truncated:changedPathCount>changes.length,
  interpretation:'requires-evidence-review',simulatorStops:'not-present-in-compared-model',privateAccounts:'not-compared'};
}

// Exception properties are untrusted. Rebuild the small, typed diagnostic
// rather than allowing arbitrary strings/objects into normal scheduled logs.
export function safeC1ModelParityDiagnostic(detail){
 if(!detail||detail.contract!=='c1-model-parity-diagnostic-v1'||detail.sampleLimit!==limit||detail.sampleByteLimit!==sampleByteLimit||
  detail.interpretation!=='requires-evidence-review'||detail.simulatorStops!=='not-present-in-compared-model'||detail.privateAccounts!=='not-compared'||
  !Number.isSafeInteger(detail.changedPathCount)||detail.changedPathCount<0||!hash(detail.changesHash)||
  !Array.isArray(detail.comparedFields)||detail.comparedFields.length!==fields.length||!Array.isArray(detail.sample)||
  detail.sample.length>Math.min(limit,detail.changedPathCount)||
  detail.truncated!==(detail.changedPathCount>detail.sample.length))return undefined;
 const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=detail.changedPathCount;
 if(!detail.counts||!kinds.every(k=>count(detail.counts[k]))||kinds.reduce((sum,k)=>sum+detail.counts[k],0)!==detail.changedPathCount)return undefined;
 const comparedFields=[];
 for(let index=0;index<fields.length;index++){
  const row=detail.comparedFields[index];
  if(row?.field!==fields[index]||!hash(row.originalHash)||!hash(row.revisedHash)||!count(row.changedPathCount))return undefined;
  comparedFields.push({field:row.field,originalHash:row.originalHash,revisedHash:row.revisedHash,changedPathCount:row.changedPathCount});
 }
 if(comparedFields.reduce((sum,row)=>sum+row.changedPathCount,0)!==detail.changedPathCount)return undefined;
 const sample=[],seen=new Set();
 function safeSnapshot(row){
  if(!row||!types.includes(row.type)||row.present!==(row.type!=='missing')||!hash(row.sha256))return null;
  const out={present:row.present,type:row.type,sha256:row.sha256};
  if(Object.hasOwn(row,'value')){
   if(!((row.type==='null'&&row.value===null)||(row.type==='boolean'&&typeof row.value==='boolean')||
    (row.type==='number'&&typeof row.value==='number'&&Number.isFinite(row.value))))return null;
   out.value=row.value;
  }
  return out;
 }
 for(const row of detail.sample){
  if(typeof row?.path!=='string'||row.path.length>256||!kinds.includes(row.kind)||seen.has(row.path))return undefined;
  const parts=row.path.split('/').slice(1);
  if(!row.path.startsWith('/')||!fields.includes(parts[0])||parts.some(p=>!p||!(keys.has(p)||/^(0|[1-9][0-9]*)$/.test(p)||/^[A-Z][A-Z0-9.-]{0,15}$/.test(p)||/^~[a-f0-9]{12}$/.test(p))))return undefined;
  const before=safeSnapshot(row.before),after=safeSnapshot(row.after);if(!before||!after||
   (row.kind==='representation-order'&&(before.type!=='object'||after.type!=='object'))||
   (row.kind==='representation-json'&&(row.path!=='/paperExecution/modelHistory'||before.type!=='string'||after.type!=='string')))return undefined;
  seen.add(row.path);sample.push({path:row.path,kind:row.kind,before,after});
 }
 if(JSON.stringify(sample).length>sampleByteLimit)return undefined;
 return {contract:detail.contract,comparedFields,changedPathCount:detail.changedPathCount,
  counts:Object.fromEntries(kinds.map(k=>[k,detail.counts[k]])),changesHash:detail.changesHash,sampleLimit:limit,sampleByteLimit,sample,truncated:detail.truncated,
  interpretation:detail.interpretation,simulatorStops:detail.simulatorStops,privateAccounts:detail.privateAccounts};
}
