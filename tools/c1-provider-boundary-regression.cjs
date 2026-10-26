// Full pre-extraction/current provider modules, isolated clocks/HTTP/Blob only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {restoreProviderTransport}=require('./c1-provider-transport-seams.cjs');
const owned=new Set(['lib/fmpQuotes.js','lib/fmpFundamentals.js','lib/eventRisk.js','lib/fmpSymbols.js','lib/entryTiming.js','lib/c1AccountOpeningProvider.js','lib/c1LiveInputProvider.js','lib/c1HeldRankProvider.js','lib/c1HoldingCoverage.js','lib/fullMarketDiscovery.js','pages/api/lookup.js']);
const plain=value=>JSON.parse(JSON.stringify(value));
const epoch=Date.parse('2026-10-22T15:00:00.000Z');
function harness(baseline,{failure=null,hops=1,throwLogger=false}={}){
 let milliseconds=epoch,nextTimer=0,nextSignal=0,quotePrice=100;
 const contexts=new Map(),modules=new Map(),trace=[],timers=[],writes=[],calls=[],logs=[];
 class Clock extends Date{
  constructor(...args){if(args.length)super(...args);else{trace.push(['date',milliseconds]);super(milliseconds++);}}
  static now(){trace.push(['now',milliseconds]);return milliseconds++;}
 }
 class Controller{constructor(){this.signal={id:++nextSignal,aborted:false};}abort(){this.signal.aborted=true;trace.push(['abort',this.signal.id]);}}
 const signal={timeout:ms=>{const out={id:++nextSignal,timeout:ms};trace.push(['signal',ms,out.id]);return out;}};
 const delay=(label,work)=>new Promise((resolve,reject)=>{let left=hops;const step=()=>{trace.push(['microtask',label,left]);if(left-->0)queueMicrotask(step);else try{resolve(work());}catch(e){reject(e);}};queueMicrotask(step);});
 const fetcher=function(raw,options){
  const url=new URL(raw),endpoint=url.pathname.slice('/stable/'.length),symbol=url.searchParams.get('symbol');
  assert.equal(url.hostname,'financialmodelingprep.com');assert.equal(url.searchParams.get('apikey'),'offline-provider-fixture');
  calls.push({url:raw,argumentCount:arguments.length,options:options===undefined?null:plain(options)});trace.push(['fetch',endpoint,symbol,milliseconds]);
  return delay(endpoint+':headers',()=>{
   if(failure==='transport')throw new TypeError('offline transport');
   const status=typeof failure==='number'?failure:200;
   return{ok:status>=200&&status<300,status,headers:{get:()=>failure===429?'2':null},
    text:()=>delay(endpoint+':text',()=>{if(failure==='text')throw new Error('offline text');return 'PRIVATE_PROVIDER_SENTINEL';}),
    json:()=>delay(endpoint+':json',()=>{
     if(failure==='json')throw new SyntaxError('offline JSON');
     if(failure==='malformed')return{malformed:true};
     if(endpoint==='quote')return[{symbol,price:quotePrice,open:100,timestamp:epoch/1000,exchange:'NYSE'}];
     if(endpoint==='sp500-constituent'||endpoint==='nasdaq-constituent')return members(endpoint==='sp500-constituent'?490:90);
     if(endpoint==='batch-quote')return url.searchParams.get('symbols').split(',').map(symbol=>({symbol,open:100,price:100,timestamp:epoch/1000}));
     if(endpoint==='profile')return[{symbol,sector:'Technology',cik:'123'}];
     if(endpoint.startsWith('historical-price-eod/')){const rows=[];for(let ms=Date.parse(url.searchParams.get('from')+'T00:00:00Z');ms<=Date.parse(url.searchParams.get('to')+'T00:00:00Z');ms+=86400000){const date=new Date(ms).toISOString().slice(0,10);if(load('lib/marketSession.js').isUsMarketSessionDay(date))rows.push({symbol,date,open:100,high:101,low:99,close:100,volume:10000000});}return rows;}
     if(endpoint==='ratios-ttm'||endpoint==='ratios-ttm-bulk')return[{symbol:symbol||'AAA',grossProfitMarginTTM:.4,operatingProfitMarginTTM:.2,debtToEquityRatioTTM:.3}];
     if(endpoint==='income-statement-growth'||endpoint==='income-statement-growth-bulk')return[{symbol:symbol||'AAA',date:'2026-10-21',growthRevenue:.1,growthEPS:.2}];
     if(['income-statement','balance-sheet-statement','cash-flow-statement'].includes(endpoint))return[];
     if(['earnings-calendar','mergers-acquisitions-latest','news/stock','economic-calendar'].includes(endpoint))return[];
     throw new Error('Unexpected offline endpoint '+endpoint);
    })};
  });
 };
 const members=count=>Array.from({length:count},(_,i)=>({symbol:i===0?'AAA':i===1?'BRK.B':'T'+i,name:'Fixture '+i,sector:'Technology'}));
 const blob={list:async()=>({blobs:[]}),get:async()=>{throw new Error('Unexpected storage read');},put:async(...args)=>{writes.push(plain(args));return{};}};
 function load(file){
  if(modules.has(file))return modules.get(file);
  const record={exports:{}},imported={};modules.set(file,record.exports);
  let source=fs.readFileSync(file,'utf8');if(baseline&&owned.has(file))source=restoreProviderTransport(file,source);
  source=source.replace(/import\s*{([\s\S]*?)}\s*from\s*["']([^"']+)["'];?/g,(_,names,request)=>{
   const dependency=request==='@vercel/blob'?blob:request.startsWith('node:')?require(request):load(path.posix.normalize(path.posix.join(path.posix.dirname(file),request+'.js')));
   for(const raw of names.split(',')){const [remote,local=remote]=raw.trim().split(/\s+as\s+/);if(remote)imported[local]=dependency[remote];}return'';
  });
  const exports=[];source=source.replace(/export default async function handler/,()=>{exports.push('handler');return 'async function handler';});source=source.replace(/export\s+(?:async\s+)?function\s+([\w$]+)/g,(text,name)=>{exports.push(name);return text.replace('export ','');});
  source=source.replace(/export\s+(?:const|let|var|class)\s+([\w$]+)/g,(text,name)=>{exports.push(name);return text.replace('export ','');});
  source=source.replace(/export\s*{([\s\S]*?)}\s*;?/g,(_,names)=>{for(const name of names.split(',')){if(name.trim())exports.push(name.trim());}return'';});
  if(file==='lib/fmpFundamentals.js')exports.push('fetchJson','fetchBulkJson');
  if(['lib/entryTiming.js','lib/fullMarketDiscovery.js'].includes(file))exports.push('fetchJson');
  const sandbox={module:record,process:{env:{FMP_API_KEY:'offline-provider-fixture'}},console:Object.fromEntries(['log','info','warn','error'].map(level=>[level,(...args)=>{logs.push([level,...args.map(arg=>arg instanceof Error?{name:arg.name,message:arg.message}:arg)]);if(throwLogger)throw Error('offline logger');}])),Date:Clock,
   performance,Intl,Math,Number,String,Object,Array,Boolean,RegExp,Error,TypeError,SyntaxError,JSON,Map,Set,WeakMap,URL,URLSearchParams,Response,
   fetch:fetcher,AbortController:Controller,AbortSignal:signal,setTimeout(fn,ms){const id=++nextTimer;timers.push(['set',id,ms]);if(ms<=5000)queueMicrotask(()=>{milliseconds+=ms;fn();});return id;},clearTimeout(id){timers.push(['clear',id]);},...imported};
  vm.runInNewContext(source+'\nmodule.exports={'+exports.join(',')+'};',sandbox,{filename:file});contexts.set(file,sandbox);modules.set(file,record.exports);return record.exports;
 }
 const quotes=load('lib/fmpQuotes.js'),fundamentals=load('lib/fmpFundamentals.js'),events=load('lib/eventRisk.js'),transport=load('lib/fmpTransport.js');
 const state=()=>[...contexts].flatMap(([file,context])=>Object.keys(context).filter(key=>key.startsWith('__')).sort().map(key=>[file,key,
  context[key] instanceof Map?plain([...context[key]]):plain(context[key])]));
 return{quotes,fundamentals,events,transport,keyEnv:contexts.get('lib/fmpTransport.js').process.env,trace,timers,writes,calls,logs,state,load,members,advance(ms){milliseconds+=ms;},price(value){quotePrice=value;}};
}
const outcome=async promise=>{try{return{value:plain(await promise)};}catch(error){return{error:{name:error.name,message:error.message,status:error.status,code:error.code}};}};
async function compare(options,exercise){
 const before=harness(true,options),after=harness(false,options);
 assert.deepEqual(await exercise(after),await exercise(before),'Complete provider output parity');
 for(const key of ['trace','timers','calls','writes','logs'])assert.deepEqual(after[key],before[key],key+' preserves advancing clocks, promise interleaving, deadlines and call/write order');
 assert.deepEqual(after.state(),before.state(),'All provider cache/cooldown/inflight state is identical');
}
(async()=>{
 let cases=0;
 const bodyOf=async(h,symbol='AAA')=>{let code,body;const headers={};await h.load('pages/api/lookup.js').handler({query:{symbol}},{setHeader(k,v){headers[k]=v;},status(value){code=value;return this;},json(value){body=plain(value);return this;}});return{code,body,headers};};
 // This is retained as a before-repair reproduction against the immutable route.
 const leaking=harness(true,{failure:503}),leak=await bodyOf(leaking);assert.equal(leak.code,500);assert.match(JSON.stringify(leak.body),/PRIVATE_PROVIDER_SENTINEL/);assert.match(JSON.stringify(leaking.logs),/PRIVATE_PROVIDER_SENTINEL/);console.log('REPRODUCED: original lookup leaks synthetic raw-provider sentinel in HTTP500 and log.');
 // The synchronous shared boundary must return each exact original promise,
 // including a non-native thenable. No extra microtask/await may be inserted.
 const keys=harness(false);for(const primary of [undefined,'','primary'])for(const legacy of [undefined,'','legacy']){keys.keyEnv.FMP_API_KEY=primary;keys.keyEnv.FMP_KEY=legacy;assert.equal(keys.transport.fmpApiKey(),primary);assert.equal(keys.transport.fmpApiKey({allowLegacy:true}),primary||legacy);}
 const direct=harness(false),fetchPromise=Promise.resolve({}),bodyPromise=Promise.resolve([]),thenable={then(){}};
 const fetchOptions={cache:'no-store'};let seenOptions;
 assert.equal(direct.transport.fetchFmpResponse('offline',fetchOptions,{fetcher:(_url,options)=>{seenOptions=options;return fetchPromise;}}),fetchPromise);assert.equal(seenOptions,fetchOptions);
 assert.equal(direct.transport.fetchFmpResponse('offline',{}, {fetcher:()=>fetchPromise}),fetchPromise);
 assert.equal(direct.transport.fetchFmpResponse('offline',{}, {fetcher:()=>thenable}),thenable);
 assert.equal(direct.transport.readFmpJsonResponse({json:()=>bodyPromise}),bodyPromise);
 const response={json(){assert.equal(this,response);return bodyPromise;}};assert.equal(direct.transport.readFmpJsonResponse(response),bodyPromise);
 const sentinel=new Error('offline identity');assert.throws(()=>direct.transport.fetchFmpResponse('',{},{fetcher(){throw sentinel;}}),error=>error===sentinel);
 assert.throws(()=>direct.transport.readFmpJsonResponse({json(){throw sentinel;}}),error=>error===sentinel);
 for(const failure of [400,401,403,404,429,500,503,'transport','json']){
  const h=harness(false,{failure}),result=await bodyOf(h);assert.equal(result.code,500);assert.deepEqual(result.body,{error:'Lookup failed.'});
  assert.match(result.headers['X-C1-Request-Id'],/^[a-f0-9-]{36}$/);assert.doesNotMatch(JSON.stringify({result,logs:h.logs}),/PRIVATE_PROVIDER_SENTINEL|offline-provider-fixture|financialmodelingprep/);
  const log=h.logs.find(row=>row[1]==='PUBLIC_API_FAILURE');assert(log);const data=JSON.parse(log[2]);assert.equal(data.code,'LOOKUP_UNAVAILABLE');assert.equal(data.stage,'lookup');assert.equal(data.status,500);
  assert.deepEqual(Object.keys(data).sort(),['code','requestId','stage','status']);assert.equal(h.calls.length,1,'Lookup preserves one attempt and never retries provider failures');
 }
 const throwingLog=harness(false,{failure:503,throwLogger:true});assert.equal((await bodyOf(throwingLog)).code,500,'A logging failure cannot replace the sanitized HTTP response');
 for(const hops of [0,1,3]){
  await compare({hops},async h=>{const result=await bodyOf(h);assert.equal(result.code,200);return result;});cases++;
  await compare({hops},async h=>{const result=await bodyOf(h,'');assert.equal(result.code,400);assert.equal(h.calls.length,0);return result;});cases++;
 }
 for(const hops of [0,1,3]){
  await compare({hops},async h=>{
   const result=await Promise.all([outcome(h.quotes.fetchFmpQuote('AAA')),outcome(h.quotes.fetchFmpQuote('BRK.B')),
    outcome(h.fundamentals.fetchFmpFundamentals(['AAA','BRK.B']).then(map=>[...map])),
    outcome(h.events.fetchEventRiskMap(['AAA','BRK.B']).then(map=>[...map]))]);
   return{result,warm:await Promise.all([outcome(h.quotes.fetchFmpQuote('AAA')),outcome(h.events.fetchEventRiskMap(['BRK.B','AAA']).then(map=>[...map]))])};
  });cases++;
 }
 for(const failure of [400,401,402,403,404,405,408,409,410,422,425,429,500,503,'transport','json']){
  await compare({failure},async h=>({result:await Promise.all([outcome(h.quotes.fetchFmpQuote('AAA')),
   outcome(h.fundamentals.fetchJson('https://financialmodelingprep.com/stable/ratios-ttm?symbol=AAA&apikey=offline-provider-fixture')),
   outcome(h.events.fetchEventRiskMap(['AAA','BRK.B']).then(map=>[...map]))]),again:await outcome(h.quotes.fetchFmpQuote('AAA'))}));cases++;
 }
 for(const failure of [null,400,429,503,'transport','json']){
  await compare({failure},async h=>outcome(h.fundamentals.fetchBulkJson('https://financialmodelingprep.com/stable/ratios-ttm-bulk?apikey=offline-provider-fixture')));cases++;
 }
 await compare({},async h=>{
  const first=await h.quotes.fetchFmpQuote('AAA');h.advance(21000);
  const force=await h.quotes.fetchFmpQuote('AAA',{forceRefresh:true});h.advance(61000);
  h.price(101);const next=await Promise.all([h.quotes.fetchFmpQuote('AAA',{forceRefresh:true}),h.quotes.fetchFmpQuote('AAA',{forceRefresh:true})]);
  return plain({first,force,next});
 });cases++;
 // Remaining active endpoint adapters retain their own exact policy. These
 // execute the real adapter functions, not the shared transport in isolation.
 for(const file of ['lib/entryTiming.js','lib/fullMarketDiscovery.js'])for(const failure of [null,400,402,403,404,408,429,500,503,'transport','json']){
  await compare({failure,hops:2},async h=>outcome(h.load(file).fetchJson('https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=AAA&from=2026-10-20&to=2026-10-21&apikey=offline-provider-fixture')));cases++;
 }
 const previousDate='2026-10-21',sourceHash='a'.repeat(64),required=['AAA','BRK.B','SPY','QQQ'];
 const openingArgs=h=>({baseline:{date:previousDate,universeSymbols:h.members(490).map(row=>row.symbol),prices:required.map(symbol=>({symbol,close:100}))},symbols:required});
 const coverageArgs={portfolio:['AAA','OUT'].map(symbol=>({symbol,role:'Swing',shares:1})),baseline:{date:previousDate,universeSymbols:['AAA'],prices:[]}};
 const heldArgs={baseline:{date:previousDate,decisionAt:'2026-10-21T21:00:00.000Z',universeSymbols:['PEER'],
  prices:[{symbol:'OUT',open:100,high:101,low:99,close:100,volume:10000000}],legacyHoldingSignals:[{symbol:'OUT',sector:'Technology',industry:'Software'}],
  positionSignals:[{symbol:'PEER',sector:'Technology',researchFactors:{return120Ex20:.1,return60Ex5:.2}}]},sourceHash,symbols:['OUT']};
 for(const hops of [0,2]){
  await compare({hops},async h=>{const value=await h.load('lib/c1AccountOpeningProvider.js').collectC1AccountOpening(openingArgs(h));assert.equal(value.prices.length,4);return plain(value);});cases++;
  await compare({hops},async h=>{const value=await h.load('lib/c1HoldingCoverage.js').collectC1HoldingCoverage(coverageArgs);assert.equal(value.rows.filter(row=>row.status==='verified').length,2);return plain(value);});cases++;
  await compare({hops},async h=>{const value=await h.load('lib/c1HeldRankProvider.js').collectC1HeldRankReviews(heldArgs);assert.equal(value.rows.length,1);return plain(value);});cases++;
 }
 for(const failure of [400,429,503,'transport','json','malformed']){
  await compare({failure,hops:2},async h=>Promise.all([
   outcome(h.load('lib/c1AccountOpeningProvider.js').collectC1AccountOpening(openingArgs(h))),
   outcome(h.load('lib/c1HoldingCoverage.js').collectC1HoldingCoverage(coverageArgs)),
   outcome(h.load('lib/c1HeldRankProvider.js').collectC1HeldRankReviews(heldArgs)),
   outcome(h.load('lib/c1LiveInputProvider.js').collectC1LiveInput())]));cases++;
 }
 await compare({hops:2},async h=>{const value=await h.load('lib/c1LiveInputProvider.js').collectC1LiveInput();assert.equal(value.memberCount,90);assert.equal(value.sourceReceipt.membershipCheckedTwice,true);assert.equal(value.sourceReceipt.productionChanged,false);return plain(value);});cases++;
 console.log('PASS: '+cases+' complete original/current provider scenarios; strict promise identity, concurrent microtask/advancing-clock traces, HTTP/JSON/transport failures, retry/deadline/cache/receipt/write parity. No live I/O.');
})().catch(error=>{console.error(error);process.exitCode=1;});
