// Synthetic compiler mechanics only. No historical thesis experiment or I/O.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const root=process.cwd(),compilerFile=path.join(root,'lib/historicalSignalEvaluator.js'),engineFile=path.join(root,'lib/walkForwardBacktest.js');
const source=fs.readFileSync(compilerFile,'utf8'),oldImport='import { POINT_IN_TIME_SCHEMA } from "./walkForwardBacktest";',newImport='import { POINT_IN_TIME_SCHEMA } from "./pointInTimeSchema";';
const blob=s=>createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const oldSource=source.replace(newImport,oldImport);
assert.equal(blob(oldSource),'019fbe81dc8f79fbc8662afa2aa5039fb4a9013b','One-import reversal recovers complete frozen compiler source');
assert.equal(blob(fs.readFileSync(engineFile,'utf8')),'9e294411566722e93632d88c9b5a127d29df1535','Original research simulator remains byte-identical');
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-10-25T06:00:00.000Z']));}static now(){return Date.parse('2026-10-25T06:00:00.000Z');}}
let networkCalls=0;
function loader(compilerSource,{rejectEngine=false}={}){
 const reads=[];
 const readFs={...fs,readFileSync(file,...args){const absolute=path.resolve(file);reads.push(absolute);if(absolute===engineFile&&rejectEngine)throw Error('Synthetic research-engine initialization failure');return absolute===compilerFile?compilerSource:fs.readFileSync(file,...args);}};
 const module={exports:{}};
 const context={module,exports:module.exports,require:name=>name==='fs'?readFs:require(name),console,process:{env:{}},Date:Clock,performance,Intl,Math,Number,String,Object,Array,Set,Map,WeakMap,Boolean,RegExp,Error,TypeError,JSON,URL,URLSearchParams,AbortController,AbortSignal,Response,
  fetch:()=>{networkCalls++;throw Error('Network forbidden in synthetic compiler test');},setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync('tools/research-module-loader.cjs','utf8'),context,{filename:'actual-research-module-loader.cjs'});
 return {api:module.exports.createResearchModuleLoader(root),reads};
}
const before=loader(oldSource),after=loader(source,{rejectEngine:true});
const oldCompile=before.api.load('lib/historicalSignalEvaluator.js').compilePointInTimeSignals;
const newCompile=after.api.load('lib/historicalSignalEvaluator.js').compilePointInTimeSignals;
assert.ok(before.reads.includes(engineFile),'Baseline actually loads simulator for its constant');
assert.ok(!after.reads.includes(engineFile),'Runtime compiler must not load simulator, even if it would fail');
assert.throws(()=>loader(oldSource,{rejectEngine:true}).api.load('lib/historicalSignalEvaluator.js'),/Synthetic research-engine initialization failure/);
assert.equal(after.api.load('lib/pointInTimeSchema.js').POINT_IN_TIME_SCHEMA,before.api.load('lib/walkForwardBacktest.js').POINT_IN_TIME_SCHEMA);
const dates=[];for(let date=new Date('2025-01-02T12:00:00Z');dates.length<260;date=new Date(+date+86400000))if(![0,6].includes(date.getUTCDay()))dates.push(date.toISOString().slice(0,10));
const data={metadata:{pointInTime:true,benchmarkSymbol:'SPY',comparisonSymbols:['SPY','QQQ'],source:'synthetic schema-isolation fixture'},
 securities:[{symbol:'AAA',name:'Fixture A',sector:'Technology',listedAt:'2020-01-02',isEtf:false,isFund:false},{symbol:'OLD',name:'Fixture delisted',sector:'Industrials',listedAt:'2020-01-02',delistedAt:dates[30],isEtf:false,isFund:false}],
 fundamentals:[{symbol:'AAA',availableAt:'2024-12-15T12:00:00Z',acceptedDate:'2024-12-15T12:00:00Z',sharesOutstanding:100000000,grossMargin:60,operatingMargin:25,debtToEquity:.2,pe:20,pb:3,currentRatio:2,quickRatio:1.5,freeCashFlowYield:5,revenueGrowth:15,earningsGrowth:18,fundamentalDataStatus:'complete',fundamentalDataVerified:true,revisionSafe:true}],events:[],
 sessions:dates.map((date,index)=>{const at=date+'T20:00:00Z';return{date,decisionAt:at,marketAvailableAt:at,fundamentalCoverageAsOf:at,eventCoverageAsOf:at,eventHistoryComplete:true,universeSymbols:index<30?['AAA','OLD']:['AAA'],prices:[['AAA',80+index*.35,2000000],['OLD',20,1000000],['SPY',500+index*.2,50000000],['QQQ',450+index*.25,40000000]].map(([symbol,close,volume])=>({symbol,open:close-.1,high:close+.5,low:close-.5,close,volume,adjusted:true}))};})};
const clone=x=>JSON.parse(JSON.stringify(x));
function run(compile,input,options){const raw=clone(input),opts=clone(options||{}),original=JSON.stringify(raw);const result=compile(raw,opts);assert.equal(JSON.stringify(raw),original,'Raw inputs remain immutable');return clone(result);}
function parity(input,options){const a=run(oldCompile,input,options),b=run(newCompile,input,options);assert.deepEqual(b,a,'Complete return object parity, including metadata/checkpoints/diagnostics');return b;}
const full=parity(data);assert.equal(full.sessions.length,260);assert.ok(full.sessions.at(-1).positionSignals.some(row=>row.symbol==='AAA'),'Fixture must exercise qualified real compiler output');
for(const input of [{},{metadata:{},sessions:[],securities:[]},{...data,sessions:data.sessions.slice(0,12)}])parity(input);
for(const independentChunks of [false,true]){
 let resume=null,done=false;const collected=[];
 while(!done){const part=parity(data,{maxSessions:13,resume});if(independentChunks)collected.push(...part.sessions);
  done=part.compilerProgress.complete;resume={sessions:independentChunks?[]:part.sessions,completedSessions:part.compilerProgress.completedSessions,decisionMemory:part.compilerCheckpoint?.decisionMemory||[]};
  if(done)assert.deepEqual(independentChunks?collected:part.sessions,full.sessions,'Cumulative and independent chunks retain exact full decisions');
 }
}
assert.equal(networkCalls,0);assert.ok(!after.reads.includes(engineFile),'No later compiler path can load the research engine');
console.log('PASS: runtime schema isolation preserves complete full/empty/short/resumed/chunked compiler outputs, source/engine hashes and input immutability; zero network; old engine-init failure reproduced and isolated.');
