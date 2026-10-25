const assert=require('node:assert/strict'),fs=require('node:fs');
const {createHash}=require('node:crypto');
const babel=require('next/dist/compiled/babel/core');
const FILE='pages/api/research/preview-alpha-lab.js';
// Exact production e0aef6f route, preserved only as an isolated response oracle.
// Never import/run the actual research engine in this test.
const PRIOR=String.raw`import {finalizePointInTimeNasdaqDistinctAlphaDevelopment} from "../../../lib/fmpResearchBacktest";
export const config={maxDuration:800};
export default async function handler(req,res){
 if(process.env.VERCEL_ENV==="production")return res.status(404).json({error:"Not found"});
 res.setHeader("Cache-Control","no-store");
 try{return res.status(200).json({report:await finalizePointInTimeNasdaqDistinctAlphaDevelopment()});}
 catch(error){return res.status(500).json({status:"failed",productionChanged:false,error:String(error?.message||error).slice(0,500)});}
}
`;
assert.equal(createHash('sha1').update('blob '+Buffer.byteLength(PRIOR)+'\0').update(PRIOR).digest('hex'),'7b763fd70ae27e1d3155d62413b01ea10b9ef2db');
const current=fs.readFileSync(FILE,'utf8');
const compiled=new Map();
function load(source,environment,options={}){
 if(!compiled.has(source))compiled.set(source,babel.transformSync(source,{filename:FILE,babelrc:false,configFile:false,
  presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code);
 const record={exports:{}},counts={imports:0,initializations:0,finalizations:0};
 const report=Object.freeze({status:'synthetic',productionChanged:false,executable:false});
 let initialized=false,loadError;
 const engine={finalizePointInTimeNasdaqDistinctAlphaDevelopment:async()=>{
  counts.finalizations++;if(options.callError!==undefined)throw options.callError;return report;
 }};
 const requireLocal=name=>{
  if(name==='../../../lib/researchMutationAuth'){
   const auth=fs.readFileSync('lib/researchMutationAuth.js','utf8').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
   return new Function('process','Buffer','timingSafeEqual',auth+';return {rejectPublicProductionResearch};')(
    {env:environment===undefined?{}:{VERCEL_ENV:environment}},Buffer,require('node:crypto').timingSafeEqual);
  }
  if(name==='../../../lib/fmpResearchBacktest'){
   counts.imports++;
   if(options.initError)throw options.initError;
   if(!initialized){initialized=true;counts.initializations++;}
   return engine;
  }
  if(name.startsWith('@babel/runtime/'))return require('next/dist/compiled/'+name);
  throw Error('Unexpected dependency: '+name);
 };
 try{
  new Function('require','module','exports','process','fetch',compiled.get(source))(
   requireLocal,record,record.exports,{env:environment===undefined?{}:{VERCEL_ENV:environment}},
   ()=>{throw Error('Network is forbidden');});
 }catch(error){loadError=error;}
 return {counts,report,loadError,handler:record.exports.default,config:record.exports.config};
}
async function invoke(harness,method='GET'){
 assert.equal(harness.loadError,undefined);
 const result={headers:{},status:null,body:null};
 const response={setHeader:(name,value)=>{result.headers[name]=value;},
  status:code=>{result.status=code;return response;},json:body=>{result.body=body;return response;}};
 const request={method,get query(){throw Error('Query must not be inspected');},get body(){throw Error('Body must not be inspected');}};
 await harness.handler(request,response);return result;
}
async function main(){
 const failure=Error('synthetic research initialization failure');
 const priorFailure=load(PRIOR,'production',{initError:failure});
 assert.equal(priorFailure.loadError,failure,'Reproduce engine failure before the original production guard');
 assert.equal(priorFailure.counts.imports,1);
 for(const method of ['GET','POST','PUT','DELETE','HEAD','OPTIONS']){
  const prior=load(PRIOR,'production'),actual=load(current,'production',{initError:failure});
  assert.equal(actual.counts.imports,0,'No research import at production route initialization');
  assert.deepEqual(actual.config,prior.config,'Existing route duration/configuration is unchanged');
  assert.deepEqual(await invoke(actual,method),await invoke(prior,method),'Exact production response/header parity');
  assert.deepEqual(actual.counts,{imports:0,initializations:0,finalizations:0},'Production never reaches the forbidden engine');
 }
 for(const environment of ['preview','development',undefined,'Production']){
  for(const method of ['GET','POST','DELETE']){
   for(const options of [{},{callError:Error('synthetic failure')},{callError:{message:'x'.repeat(600)}},{callError:'plain failure'}]){
    const prior=load(PRIOR,environment,options),actual=load(current,environment,options);
    assert.equal(actual.counts.imports,0,'Nonproduction research load is deferred until a request');
    assert.deepEqual(await invoke(actual,method),await invoke(prior,method),'Exact nonproduction success/error/status/header parity');
    assert.equal(actual.counts.finalizations,1,'One existing finalizer call per permitted request');
    assert.deepEqual(await invoke(actual,method),await invoke(prior,method),'Repeated request response parity');
    assert.equal(actual.counts.finalizations,2,'Repeated requests preserve finalizer invocation count');
    assert.equal(actual.counts.initializations,1,'Module initialization retains ordinary require-cache identity');
   }
  }
 }
 const brokenPreview=load(current,'preview',{initError:failure});
 assert.equal(brokenPreview.loadError,undefined);
 await assert.rejects(invoke(brokenPreview),error=>error===failure,'Deferred module failures remain uncaught, before existing headers/catch');
 assert.equal(brokenPreview.counts.finalizations,0);
 console.log('PASS: production guard precedes research loading; exact existing production/nonproduction responses and failure/call-count contracts preserved with synthetic engine only.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
