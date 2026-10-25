// Execute all three real handlers with isolated dependency fixtures. No network,
// credentials, account, provider or durable storage requests are made.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const babel=require('next/dist/compiled/babel/core');
const originals=require('./fixtures/public-api-production-7876a16.json');
const pins={'pages/api/index.js':'aeb98c6c0319dfbc4af1eba2d897bc0758c1e2f0','pages/api/entry-timing.js':'f7c33a06f520fe18847648d0ca1ed4a46d381ea2','pages/api/catalysts.js':'b570d0f77ccd14505fe840f2d6a4c63968e7e086'};
const hash=s=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(s)+'\0').update(s).digest('hex');
const plain=x=>JSON.parse(JSON.stringify(x)),sentinel='PRIVATE_PROVIDER_URL_APIKEY_SENTINEL',at='2026-10-15T17:00:00Z';
const NativeDate=Date;class Clock extends NativeDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return NativeDate.parse(at);}}
function compile(source,filename,imports,logs){
 const record={exports:{}},code=babel.transformSync(source,{filename,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports','console','Date',code)(request=>{
  if(request in imports)return imports[request];
  if(request.startsWith('@babel/runtime/'))return require('next/dist/compiled/'+request);
  throw Error('Unexpected dependency: '+request);
 },record,record.exports,{warn:(...args)=>{if(logs.broken)throw Error(sentinel);logs.push(args.join(' '));},error:(...args)=>logs.push(args.map(String).join(' '))},Clock);
 return record.exports;
}
function harness(file,source,failAt=null,thrown=Error(sentinel)){
 const calls=[],logs=[],invoke=(name,result)=>(...args)=>{calls.push({name,args:plain(args)});if(name===failAt)throw thrown;return typeof result==='function'?result(...args):result;};
 const asyncCall=(name,result)=>async(...args)=>invoke(name,result)(...args);
 const scoring=Object.fromEntries(['calcFundamentalScore','calcTechnicalScore','calcMomentumScore','calcRelativeStrengthScore','calcAsymmetryScore','calcTriggerScore','compositeScore'].map(n=>[n,invoke(n,80)]));
 Object.assign(scoring,{getRecommendation:invoke('getRecommendation',{label:'Watch'}),getStage:invoke('getStage','synthetic'),buildTechnicalSnapshot:invoke('buildTechnicalSnapshot',{}),buildFundamentalSnapshot:invoke('buildFundamentalSnapshot',{})});
 const helper=compile(fs.readFileSync('lib/publicApiFailure.js','utf8'),'lib/publicApiFailure.js',{'node:crypto':crypto},logs);
 const imports={
  '../../lib/publicApiFailure':helper,'../../lib/scoring':scoring,
  '../../lib/expertDecision':{applyExpertDecision:invoke('applyExpertDecision',(stock,rec)=>({...rec,expertDecision:{metrics:{}}}))},
  '../../lib/eventRisk':{fetchEventRiskMap:asyncCall('fetchEventRiskMap',symbols=>new Map(symbols.map(s=>[s,{status:'Clear'}]))),applyEventRiskGate:invoke('applyEventRiskGate',stock=>stock),fetchMaterialCatalystMap:asyncCall('fetchMaterialCatalystMap',positions=>new Map(positions.map(p=>[p.symbol,[]])))},
  '../../lib/entryTiming':{fetchEntryTimingMap:asyncCall('fetchEntryTimingMap',symbols=>new Map(symbols.map(s=>[s,{symbol:s,available:true,pass:true}]))),applyEntryTimingGate:invoke('applyEntryTimingGate',stock=>stock)},
  '../../lib/marketSession':{projectedFullDayVolume:invoke('projectedFullDayVolume',stock=>stock.volume)},
  '../../lib/opportunityDecision':{finalizeStandaloneOpportunityDecision:invoke('finalizeStandaloneOpportunityDecision',stock=>stock)},
  '../../lib/personalCapitalPolicy':{applyPersonalCapitalPolicy:invoke('applyPersonalCapitalPolicy',stock=>stock)},
  '../../lib/fmpFundamentals':{fetchFmpFundamentals:asyncCall('fetchFmpFundamentals',new Map()),mergeFundamentals:invoke('mergeFundamentals',stock=>stock)},
  '../../lib/fmpQuotes':{fetchFmpQuote:asyncCall('fetchFmpQuote',symbol=>({symbol,price:100,previousClose:99,volume:1000000}))},
  '../../lib/c1QuoteVerification':{verifyC1Quote:invoke('verifyC1Quote',{verified:true})},
  '../../lib/portfolioGovernor':{factorWeightsFor:invoke('factorWeightsFor',{synthetic:1})},
 };
 const handler=compile(source,file,imports,logs).default;
 return {calls,logs,async request(req){const before=JSON.stringify(req),res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};await handler(req,res);assert.equal(JSON.stringify(req),before);return plain(res);}};
}
(async()=>{
 let comparisons=0;
 for(const [file,original]of Object.entries(originals)){
  assert.equal(hash(original),pins[file]);
  const current=fs.readFileSync(file,'utf8'),stripped=current.replace("import {sendPublicApiFailure} from '../../lib/publicApiFailure';\n",'');
  assert.equal(stripped.slice(0,stripped.lastIndexOf('  }catch')),original.slice(0,original.lastIndexOf('  }catch')),'Entire successful handler, cache, calls, guards and response bytes stay unchanged');
  const requests=file.endsWith('/index.js')?[{method:'GET',query:{symbol:' aapl ',refresh:'1'}},{method:'GET',query:{}}]:file.endsWith('/entry-timing.js')?[{method:'GET',query:{symbols:'aapl,AAPL,brk-b'}},{method:'GET',query:{symbols:['AAPL','MSFT']}},{method:'GET',query:{}}]:[{method:'POST',body:{positions:[{symbol:'AAA',shares:3}]}},{method:'POST',body:{}},{method:'GET'}];
  for(const req of requests){const old=harness(file,original),now=harness(file,current);assert.deepEqual(await now.request(req),await old.request(req));assert.deepEqual(now.calls,old.calls);assert.deepEqual(now.logs,old.logs);comparisons++;}
  const failures=file.endsWith('/index.js')?['fetchFmpQuote','fetchFmpFundamentals','fetchEventRiskMap','fetchEntryTimingMap','verifyC1Quote']:file.endsWith('/entry-timing.js')?['fetchEntryTimingMap']:['fetchMaterialCatalystMap','factorWeightsFor'];
  for(const failAt of failures){
   const old=harness(file,original,failAt),now=harness(file,current,failAt),a=await old.request(requests[0]),b=await now.request(requests[0]);
   assert(JSON.stringify(a).includes(sentinel),'Frozen handler reproduces public provider error disclosure');
   assert.equal(b.statusCode,a.statusCode);assert.equal(b.body.error,a.body.error);assert.equal(b.headers['Cache-Control'],a.headers['Cache-Control']);
   assert.doesNotMatch(JSON.stringify(b)+now.logs.join('\n'),new RegExp(sentinel+'|AAPL|AAA|https?:|apikey'));
   assert.match(b.headers['X-C1-Request-Id'],/^[a-f0-9-]{36}$/);assert.equal(now.logs.length,1);
   const diagnostic=JSON.parse(now.logs[0].slice('PUBLIC_API_FAILURE '.length));assert.deepEqual(Object.keys(diagnostic).sort(),['code','requestId','stage','status']);assert.equal(diagnostic.requestId,b.headers['X-C1-Request-Id']);assert.equal(diagnostic.status,b.statusCode);
   assert.deepEqual(now.calls,old.calls,'No provider call, retry, input or ordering change on failures');comparisons++;
  }
  const noMessage=harness(file,current,failures[0],null);const b=await noMessage.request(requests[0]);assert.equal(b.statusCode,file.endsWith('/entry-timing.js')?503:500);assert.equal(typeof b.body.detail,'string');
  const brokenLog=harness(file,current,failures[0]);brokenLog.logs.broken=true;assert.equal((await brokenLog.request(requests[0])).statusCode,b.statusCode);
 }
 console.log(`PASS: ${comparisons} real-handler success/failure comparisons preserve responses/calls/cache/status and redact raw provider errors; null throws and logging failures remain safe; zero live requests.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
