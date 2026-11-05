// Offline incident reproduction, not a strategy experiment. Reads only explicit
// local market artifacts; never invokes provider/storage/account/HTTP endpoints.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const root=path.resolve(__dirname,'..');
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const digest=value=>crypto.createHash('sha256').update(canonical(value)).digest('hex');
const rawDigest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const own=(value,key)=>Object.hasOwn(value,key);
const fields=['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'];
function readArtifact(file){
 const bytes=fs.readFileSync(file);if(bytes.length>32*1024*1024)throw new Error('Local artifact exceeds 32 MiB');
 const source=bytes[0]===31&&bytes[1]===139?zlib.gunzipSync(bytes,{maxOutputLength:128*1024*1024}):bytes;
 return JSON.parse(source.toString('utf8'));
}
function difference(before,after){
 const changes=[];
 function walk(left,right,parts){
  if(digest(left===undefined?{present:false}:{value:left})===digest(right===undefined?{present:false}:{value:right}))return;
  if(left&&right&&typeof left==='object'&&typeof right==='object'&&Array.isArray(left)===Array.isArray(right)){
   const keys=[...new Set([...Object.keys(left),...Object.keys(right)])].sort((a,b)=>Array.isArray(left)?Number(a)-Number(b):a.localeCompare(b));
   for(const key of keys)walk(own(left,key)?left[key]:undefined,own(right,key)?right[key]:undefined,[...parts,key]);
   return;
  }
  const record={path:'/'+parts.map(part=>String(part).replace(/~/g,'~0').replace(/\//g,'~1')).join('/'),
   originalPresent:left!==undefined,revisedPresent:right!==undefined};
  if(left!==undefined)record.original=left;if(right!==undefined)record.revised=right;
  changes.push(record);
 }
 for(const field of fields)walk(before[field],after[field],[field]);
 return changes;
}
function validateObservation(record,market){
 const p=record?.payload;
 if(record?.contract!=='c1-index-observation-v1'||record.acceptedModelInput!==false||record.executable!==false||
  p?.contract!=='c1-dated-index-input-v1'||p.universe!=='sp500'||!/^\d{4}-\d{2}-\d{2}$/.test(p.sourceSessionDate||'')||
  record.sourceSessionDate!==p.sourceSessionDate||record.observedAt!==p.observedAt||p.session?.date!==p.sourceSessionDate||
  p.session.decisionAt!==p.observedAt||!Number.isFinite(Date.parse(p.observedAt))||
  market.latestCompletedMarketSessionDay(new Date(p.observedAt))!==p.sourceSessionDate||
  p.sourceReceipt?.provider!=='FMP'||p.sourceReceipt.membershipCheckedTwice!==true||
  !/^[a-f0-9]{64}$/.test(record.observationHash||'')||rawDigest(p)!==record.observationHash)
  throw new Error('Local observation envelope or payload hash failed');
 return record;
}
function simulatorState(model,simulate,options){
 // Capture operational stop/high-water state omitted by the stored forward
 // summary. Use the same accepted inputs and existing frozen sleeve options;
 // no parameter search, additional dates or return experiment is performed.
 return Object.fromEntries(Object.entries(options).map(([id,config])=>{
  const run=simulate({metadata:{},sessions:model.sessions},{...config,startDate:model.simulationStartSession||model.firstDecisionSession,
   endDate:model.sessions.at(-1).date,liquidateAtEnd:false});
  return [id,{openPositions:run.openPositions,pendingDecisions:run.pendingDecisions,trades:run.trades,
   unresolvedUniverseRemovals:run.unresolvedUniverseRemovals,skippedOrders:run.skippedOrders}];
 }));
}
function inspect({bookFile,observationFiles,targetHash,outputDir}){
 if(!bookFile||!Array.isArray(observationFiles)||!observationFiles.length||observationFiles.length>100||!outputDir)
  throw new Error('Usage: node tools/inspect-c1-index-transition.cjs --book BOOK[.gz] --observation OBS[.gz] [--observation OBS...] [--target SHA256] --output NEW_DIRECTORY');
 const loader=createResearchModuleLoader(root),market=loader.load('lib/marketSession.js'),book=readArtifact(bookFile);
 const {recordHash,...content}=book;
 if(book?.contract!=='c1-dated-index-book-v1'||book.universe!=='sp500'||book.model?.ledger?.kind!=='virtual-model'||
  !Array.isArray(book.captures)||!book.captures.length||!Array.isArray(book.model.sessions)||!book.model.sessions.length||
  digest(content)!==recordHash)throw new Error('An intact accepted virtual market book is required; private accounts are not supported');
 const observations=observationFiles.map(file=>validateObservation(readArtifact(file),market));
 if(new Set(observations.map(o=>o.observationHash)).size!==observations.length)throw new Error('Duplicate local observation artifacts');
 const dates=new Set(observations.map(o=>o.sourceSessionDate));if(dates.size!==1)throw new Error('One transition/session per inspection is required');
 observations.sort((a,b)=>a.observedAt.localeCompare(b.observedAt)||a.observationHash.localeCompare(b.observationHash));
 const selected=targetHash?observations.find(o=>o.observationHash===targetHash):observations.at(-1);
 if(!selected)throw new Error('Explicit target observation was not supplied');
 const eligible=observations.filter(o=>o.observedAt<=selected.observedAt),runs=[],advance=loader.load('lib/c1ForwardModel.js').advanceC1ForwardModel;
 const box={createHash:crypto.createHash,...loader.load('lib/c1DecisionSnapshot.js'),...loader.load('lib/c1HoldingsComparison.js'),...market,
  ...loader.load('lib/c1LiveInput.js'),...loader.load('lib/c1BaselineReconciliation.js'),Date,
  advanceC1ForwardModel(model,incoming,now,initialization){
   const result=advance(model,incoming,now,initialization);runs.push({inputModel:clone(model),result:clone(result)});return result;
  }};
 vm.createContext(box);vm.runInContext(fs.readFileSync(path.join(root,'lib/c1DatedBook.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+';this.accept=acceptC1DatedInput;',box,{filename:'lib/c1DatedBook.js'});
 const before=digest(book),inputBefore=rawDigest(selected.payload);let accepted,error;
 try{accepted=box.accept(book,selected.payload,new Date(selected.observedAt),{observations:eligible});}catch(cause){error=cause;}
 if(digest(book)!==before||rawDigest(selected.payload)!==inputBefore)throw new Error('Inspection mutated original market evidence');
 const report={contract:'c1-offline-index-transition-inspection-v1',status:error?'rejected':'accepted',priorRecordHash:recordHash,
  previousSessionDate:book.model.sessions.at(-1).date,currentSessionDate:selected.sourceSessionDate,
  observationHash:selected.observationHash,observedAt:selected.observedAt,eligibleObservationHashes:eligible.map(o=>o.observationHash),
  originalInputsPreserved:true,networkRequests:0,storageWrites:0,privateAccountsRead:false,
  productionConclusion:'requires-actual-incident-artifacts',simulatorStops:'separately-replayed-local-evidence',
  ...(error?{rejection:{message:String(error.message),providerRevision:error.providerRevisionDiagnostic||null}}:{acceptedRecordHash:accepted.recordHash})};
 // Capture the first original/revised pair used by the real acceptance path.
 // Later legacy fallbacks may repeat replay, but never select another result.
 const original=runs[0],revised=runs[1];
 if(original&&revised){
  const changes=difference(original.result,revised.result);
  report.comparedFields=fields.map(field=>({field,originalHash:digest({value:original.result[field]}),
   revisedHash:digest({value:revised.result[field]}),changedPathCount:changes.filter(row=>row.path.startsWith('/'+field+'/')||row.path==='/'+field).length}));
  report.completeChangedPathCount=changes.length;report.completeDifferencesHash=digest(changes);
  const simulate=loader.load('lib/c1FrozenSimulator.js').simulatePointInTimePortfolio,options=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
  const states={original:simulatorState(original.result,simulate,options),revised:simulatorState(revised.result,simulate,options)};
  const stopChanges=difference({ledger:states.original},{ledger:states.revised});
  report.simulatorStateChangedPathCount=stopChanges.length;report.simulatorStateDifferencesHash=digest(stopChanges);
  // Require a new directory. A failed/partial older inspection can never be
  // mixed with a new report, and no existing evidence is overwritten.
  fs.mkdirSync(outputDir);
  for(const [name,value] of Object.entries({'model-original.json':original.result,'model-revised.json':revised.result,
   'complete-model-differences.json':changes,'simulator-state.json':states,'complete-simulator-differences.json':stopChanges}))
   fs.writeFileSync(path.join(outputDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 }else fs.mkdirSync(outputDir);
 fs.writeFileSync(path.join(outputDir,'transition-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 return report;
}
function parse(argv){
 const options={observationFiles:[]};
 for(let i=0;i<argv.length;i++){
  const flag=argv[i],value=argv[++i];if(!value)throw new Error('Missing local inspection argument');
  if(flag==='--book')options.bookFile=value;else if(flag==='--observation')options.observationFiles.push(value);
  else if(flag==='--target')options.targetHash=value;else if(flag==='--output')options.outputDir=value;else throw new Error('Unknown local inspection argument');
 }
 return options;
}
if(require.main===module){try{
 const report=inspect(parse(process.argv.slice(2)));
 // Console remains aggregate-only; exact market differences stay local.
 console.log(JSON.stringify({status:report.status,previousSessionDate:report.previousSessionDate,currentSessionDate:report.currentSessionDate,
  completeChangedPathCount:report.completeChangedPathCount??null,simulatorStateChangedPathCount:report.simulatorStateChangedPathCount??null,
  productionConclusion:report.productionConclusion}));
}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={inspect,difference,validateObservation};
