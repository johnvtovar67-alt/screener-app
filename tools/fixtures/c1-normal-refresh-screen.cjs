// Actual screen handler, providers, decisions and performance store. Every
// external boundary is supplied in memory; this fixture cannot access a network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const babel=require('next/dist/compiled/babel/core');
const {createHash}=require('node:crypto');
const compiled=new Map(),clone=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function createNormalRefreshScreen(fixture){
 const root=fixture.root,modules=new Map(),sourceHashes=new Map(),calls=[],logs=[],objects=new Map(),writes=[];
 const state={mode:null},symbols=fixture.book.model.sessions.at(-1).signals.map(row=>row.symbol);
 class FixtureDate extends Date{constructor(...args){super(...(args.length?args:[fixture.now]));}static now(){return fixture.now.getTime();}}
 class BlobPreconditionFailedError extends Error{}
 const blobUrl=name=>'https://fixture.invalid/'+encodeURIComponent(name);
 const blob={BlobPreconditionFailedError,
  async list({prefix}){return{blobs:[...objects].filter(([name])=>name.startsWith(prefix)).map(([pathname,value])=>({pathname,url:blobUrl(pathname),etag:value.etag}))};},
  async get(name){name=String(name).startsWith('https://fixture.invalid/')?decodeURIComponent(String(name).split('/').at(-1)):name;const value=objects.get(name);if(!value)return null;return{statusCode:200,blob:{etag:value.etag},stream:new Response(value.body).body};},
  async put(name,body,options){const old=objects.get(name);if(old?options.ifMatch?old.etag!==options.ifMatch:!options.allowOverwrite:options.ifMatch)throw new BlobPreconditionFailedError('Synthetic ETag conflict');
   const etag='"memory-'+(writes.length+1)+'"',entry={name,previousEtag:old?.etag||null,ifMatch:options.ifMatch||null,allowOverwrite:options.allowOverwrite,etag,hash:hash(body)};
   objects.set(name,{body:String(body),etag});writes.push(entry);
   if(state.mode==='ledger-commit-lost'&&name==='screener-performance-ledger.json'){entry.acknowledgementLost=true;throw Error('Synthetic storage acknowledgement lost');}
   return{pathname:name,url:blobUrl(name),etag};},
  async del(){throw Error('Delete forbidden in the refresh fixture');},
 };
 const quote=symbol=>({symbol,name:'Synthetic issuer '+symbol,companyName:'Synthetic issuer '+symbol,price:symbol==='DELL'?460:100,previousClose:symbol==='DELL'?500:100,open:symbol==='DELL'?500:100,
  change:0,changesPercentage:0,marketCap:2e9,volume:1e7,avgVolume:1e7,priceAvg50:98,priceAvg200:95,yearHigh:105,yearLow:70,eps:5,pe:20,beta:1.1,exchange:'NASDAQ',timestamp:fixture.now.getTime()/1000,
  ...(state.mode==='quote-malformed'&&['SPY','QQQ'].includes(symbol)?{price:null}:{}),
 });
 async function fetcher(raw,options={}){
  const url=new URL(raw);assert.equal(url.hostname,'financialmodelingprep.com','No live provider can be reached');assert.equal(url.searchParams.get('apikey'),'isolated-refresh-fixture');
  const endpoint=url.pathname.replace('/stable/',''),symbol=(url.searchParams.get('symbol')||'').replace('-','.');
  calls.push({endpoint,symbol:symbol||null,at:fixture.now.toISOString()});
  if(state.mode==='provider-outage')return new Response('{"error":"Synthetic provider unavailable"}',{status:503});
  if(state.mode==='provider-invalid-json'&&['batch-quote','quote'].includes(endpoint))return new Response('{"broken":');
  let body;
  if(endpoint==='batch-quote'||endpoint==='quote'){
   body=(url.searchParams.get('symbols')||symbol).split(',').map(value=>quote(value.replace('-','.')));
   // Model a normally accumulated durable fundamental cache. Leave MRNA cold
   // so the real adapter still acquires and persists its provider responses.
   // This avoids inventing an unbounded enrichment pass in the actual route.
   const cacheName='fmp-fundamentals-cache-v1.json';
   if(body.length>5&&(!objects.has(cacheName)||objects.get(cacheName).etag==='"synthetic-initial-fundamentals"')){
    const rows=new Map((objects.has(cacheName)?JSON.parse(objects.get(cacheName).body).rows:[]).map(row=>[row.symbol,row]));
    for(const row of body.filter(row=>row.symbol!=='MRNA'))rows.set(row.symbol,{symbol:row.symbol,ts:fixture.now.getTime(),data:{symbol:row.symbol,pe:18,pb:3,grossMargin:60,operatingMargin:30,netMargin:24,debtToEquity:.2,currentRatio:2,quickRatio:1.5,freeCashFlowYield:8,revenueGrowth:25,earningsGrowth:30,operatingIncomeGrowth:28,fundamentalDataStatus:'complete',fundamentalDataVerified:true,fundamentalSources:{ratiosTtm:true,incomeGrowth:true,ratioFields:8,growthFields:3}}});
    objects.set(cacheName,{etag:'"synthetic-initial-fundamentals"',body:JSON.stringify({version:2,rows:[...rows.values()]})});
   }
  }
  else if(['earnings-calendar','mergers-acquisitions-latest','news/stock','economic-calendar'].includes(endpoint))body=[];
  else if(endpoint==='ratios-ttm')body=[{symbol,grossProfitMarginTTM:.6,operatingProfitMarginTTM:.3,netProfitMarginTTM:.24,debtToEquityRatioTTM:.2,currentRatioTTM:2,quickRatioTTM:1.5,freeCashFlowYieldTTM:.08,priceToEarningsRatioTTM:18,priceToBookRatioTTM:3}];
  else if(endpoint==='income-statement-growth')body=[{symbol,date:fixture.book.model.sessions.at(-1).date,growthRevenue:.25,growthEPS:.3,growthOperatingIncome:.28}];
  else if(endpoint==='historical-price-eod/full')body=fixture.book.model.sessions.map(session=>session.prices.find(row=>row.symbol===symbol)||{...session.prices[0],symbol});
  else throw Error('Unconfigured synthetic provider endpoint: '+endpoint);
  if(options.signal?.aborted)throw options.signal.reason;
  return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
 }
 const box={console:{log:(...args)=>logs.push(args),info:(...args)=>logs.push(args),warn:(...args)=>logs.push(args),error:(...args)=>logs.push(args)},
  process:{env:{FMP_API_KEY:'isolated-refresh-fixture',VERCEL_ENV:'production',NODE_ENV:'test'}},Date:FixtureDate,Intl,Math,Number,String,Object,Array,Set,Map,WeakMap,Boolean,RegExp,Error,TypeError,JSON,URL,URLSearchParams,AbortController,AbortSignal,Response,Buffer,performance,fetch:fetcher,setTimeout,clearTimeout};
 const context=vm.createContext(box);
 function load(file){
  file=path.resolve(file);if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);
  const source=fs.readFileSync(file,'utf8');sourceHashes.set(path.relative(root,file),hash(source));let code=compiled.get(file+source);if(!code){code=babel.transformSync(source,{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;compiled.set(file+source,code);}
  const execute=new vm.Script('(function(require,module,exports){'+code+'\n})',{filename:file}).runInContext(context);
  execute(request=>{
   if(request==='@vercel/blob')return blob;
   if(request.startsWith('node:'))return require(request);
   if(request.startsWith('@babel/runtime/'))return require('next/dist/compiled/'+request);
   if(!request.startsWith('.'))throw Error('External import forbidden in refresh fixture: '+request);
   let dep=path.resolve(path.dirname(file),request);if(!fs.existsSync(dep))dep+='.js';
   if(dep===path.join(root,'lib/fullMarketDiscovery.js'))return{getFullMarketDiscovery:async()=>({status:'ready',stale:false,builtAt:fixture.now.toISOString(),candidates:symbols.map(symbol=>({symbol,price:100,marketCap:2e9,avgVolume:1e7})),sourceUniverseSize:symbols.length,eligibleUniverseSize:symbols.length,liquidityCoveragePct:100,config:{minAvgDollarVolume:1e7}})};
   if(dep===path.join(root,'lib/v11ProductionSnapshot.js'))return{getV11ProductionSnapshot:async()=>({...load(path.join(root,'lib/v11ProductionPolicy.js')).buildV11ProductionSnapshot(fixture.book.model.sessions.at(-1),fixture.now),status:'ready',requiredSessionDate:fixture.book.model.sessions.at(-1).date,snapshotAgeSessions:0,independentlyValidated:true,activationAuthorized:true,evidenceStatus:'independently-validated'})};
   return load(dep);
  },module,module.exports);return module.exports;
 }
 const handler=load(path.join(root,'pages/api/top5.js')).default;
 return{calls,logs,writes,state,quote,
  async request(query={}){let status=200,body;const headers={};await handler({method:'GET',headers:{},query:{theme:'opportunities',...query}},{setHeader(name,value){headers[name]=value;},status(code){status=code;return this;},json(value){body=clone(value);return this;}});return{status,body,headers};},
  ledger(){const body=objects.get('screener-performance-ledger.json')?.body;return body?JSON.parse(body):null;},
  storageHash(){return hash([...objects]);},
  sources(){return Object.fromEntries(sourceHashes);},
  expire(){fixture.now=new Date(fixture.now.getTime()+61000);},
  resetRuntime(){vm.runInContext("for(const key of Object.keys(globalThis))if(key.startsWith('__'))delete globalThis[key];",context);},
 };
}
module.exports={createNormalRefreshScreen};
