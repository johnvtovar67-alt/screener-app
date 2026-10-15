const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const core=loader.load('lib/c1IntradayAdvisory.js');
const provider=loader.load('lib/c1IntradayAdvisoryProvider.js');
const {c1MomentumRiskBasis}=loader.load('lib/c1MomentumEvidence.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const equal=(left,right,message)=>assert.deepEqual(plain(left),plain(right),message);
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const source='2026-10-13',instant='2026-10-14T16:00:00.000Z',now=new Date(instant);
function quote(symbol='DELL',extra={}){
 return {symbol,price:98,open:101,previousClose:100,dayHigh:103,dayLow:97,timestamp:now.getTime()/1000,...extra};
}
function snapshot(extra={}){
 return {contract:'c1-intraday-quotes-v1',receivedAt:instant,cacheStatus:'live',quotes:[quote(),
  quote('SPY',{price:101,open:100}),quote('QQQ',{price:100.5,open:100}),quote('XLK',{price:99,open:100})],...extra};
}
function decision(){
 const position={symbol:'DELL',shares:10,avgCost:100,openedAt:'2026-09-25',stops:[{sleeve:'base',price:95,shares:6},{sleeve:'confirmed',price:94,shares:4}],
  exits:[],reviewRules:[{sleeve:'base',close:100,rankVerified:true},{sleeve:'confirmed',close:100,rankVerified:true}],
  holdingRank:{base:{rank:2,eligible:true,eligibleCount:100}}};
 position.momentumEvidence={contract:'c1-momentum-evidence-v1',status:'partial',classification:'Momentum Intact',sourceSessionDate:source,riskBasis:c1MomentumRiskBasis(position)};
 return {contract:'c1-account-decision-v1',sourceSessionDate:source,current:true,positions:[position],opportunities:[{symbol:'AAA'}],
  stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:source,candidates:[
   {symbol:'DELL',sourcePrice:100,sector:'Technology',researchRank:2},
   {symbol:'AAA',sourcePrice:40,sector:'Energy',researchRank:1},
   {symbol:'BBB',sourcePrice:50,sector:'Unverified theme',researchRank:3},
  ]}};
}
const build=(changes={})=>core.buildC1IntradayAdvisory({targets:core.c1IntradayTargets({decision:decision()}),quoteSnapshot:snapshot(),sourceSessionDate:source,baselineCurrent:true,now,...changes});
function route(){
 // The local loader supports named modules. This route-only harness removes
 // its default wrapper without changing the real handler or application code.
 let code=fs.readFileSync('pages/api/c1-intraday-advisory.js','utf8').replace(/^import .*;\n/gm,'')
  .replace(/export default function handler/g,'function handler').replace(/export async function/g,'async function');
 code+='\nmodule.exports={handleC1IntradayAdvisory};';
 const sandbox={module:{exports:{}},validateC1IntradaySymbols:core.validateC1IntradaySymbols,fetchC1IntradayQuotes:provider.fetchC1IntradayQuotes};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);return sandbox.module.exports.handleC1IntradayAdvisory;
}
function response(){
 return {headers:{},statusCode:null,body:null,setHeader(name,value){this.headers[name]=value;},status(value){this.statusCode=value;return this;},json(value){this.body=plain(value);return this;}};
}

(async()=>{
 equal(core.validateC1IntradaySymbols('BF.B,BRK-B,SPY,SPY'),['BF.B','BRK.B','SPY']);
 for(const input of ['',[],Array(33).fill('SPY'),'DELL,,SPY','AAPL?apikey=secret','A B',null,{},['SPY',false]])
  assert.throws(()=>core.validateC1IntradaySymbols(input));
 assert.equal(core.c1IntradayTimestamp(now.getTime()/1000),now.getTime());
 assert.equal(core.c1IntradayTimestamp(now.getTime()),now.getTime());
 for(const time of ['2026-10-14 12:00:00',null,0,1,Infinity,-1])assert.equal(core.c1IntradayTimestamp(time),null);

 const immutableDecision=freeze(decision()),portfolio=freeze([{symbol:'DELL',role:'Swing',shares:10,avgCost:100,openedAt:'2026-09-25'}]);
 const before=JSON.stringify(immutableDecision),targets=core.c1IntradayTargets({decision:immutableDecision,portfolio,accountMatches:true,
  screenRows:freeze([{symbol:'SPY',sector:'Technology'},{symbol:'BBB',sector:'Technology'}])});
 equal(targets.map(row=>[row.symbol,row.role]),[['DELL','Swing holding'],['AAA','Daily opportunity'],['BBB','Daily watch']]);
 equal(core.c1IntradayRequestSymbols(targets),['AAA','BBB','DELL','QQQ','SPY','XLE','XLK']);
 assert.equal(targets[2].sectorETF,null,'Undated live rows never infer sector mapping');
 assert.equal(targets[0].dailyEvidenceLabel,'Momentum Intact');
 assert.equal(JSON.stringify(immutableDecision),before);
 const mismatch=core.c1IntradayTargets({decision:immutableDecision,portfolio:[{...portfolio[0],shares:11}],accountMatches:true});
 assert.equal(mismatch.find(row=>row.symbol==='DELL').role,'Daily watch','Unmatched holdings cannot supply actual stops');
 assert.equal(mismatch.find(row=>row.symbol==='DELL').stops.length,0);
 equal(core.c1IntradayTargets({decision:{...decision(),contract:'other'}}),[]);
 const undated=decision();undated.stockScreen.sourceSessionDate='2026-10-12';
 const holdingOnly=core.c1IntradayTargets({decision:undated});assert.equal(holdingOnly.length,1);assert.equal(holdingOnly[0].sectorETF,null);
 const riskChanged=decision();riskChanged.positions[0].stops[0].price=90;
 assert.equal(core.c1IntradayTargets({decision:riskChanged})[0].dailyEvidenceLabel,null,'Changed risk basis invalidates saved daily evidence');

 const immutableSnapshot=freeze(snapshot()),immutableTargets=freeze(targets),raw=JSON.stringify({immutableDecision,immutableSnapshot,immutableTargets});
 const initial=build({targets:immutableTargets,quoteSnapshot:immutableSnapshot});
 assert.equal(initial.contract,'c1-intraday-advisory-v1');assert.equal(initial.advisoryOnly,true);assert.equal(initial.baselineStatus,'current');
 const row=initial.rows[0];assert.equal(row.freshness,'fresh');assert.equal(row.providerAt,instant);assert.equal(row.basisStatus,'matched');
 assert.equal(row.label,'Historical momentum / current weakness');assert.equal(row.dailyEvidenceLabel,'Momentum Intact');
 assert.ok(Math.abs(row.gapPct-1)<1e-9);assert.ok(Math.abs(row.openToNowPct-(98/101-1)*100)<1e-9);
 assert.ok(Math.abs(row.dayChangePct+2)<1e-9);assert.ok(Math.abs(row.relative[0].openToNowPp-(row.openToNowPct-1))<1e-9);
 equal(row.stops.map(stop=>[stop.sleeve,stop.price]),[['base',95],['confirmed',94]]);
 assert.ok(Math.abs(row.stops[0].distancePct-(98-95)/98*100)<1e-9);
 assert.equal(JSON.stringify({immutableDecision,immutableSnapshot,immutableTargets}),raw,'Deep-frozen model/account/quote inputs stay immutable');
 for(const forbidden of ['action','side','orders','sharesToTrade','volume','vwap','rsi','macd','stopPrice','rankChange'])
  assert.ok(!Object.hasOwn(row,forbidden),`${forbidden} is not manufactured by advisory`);

 const timed=age=>build({quoteSnapshot:snapshot({quotes:snapshot().quotes.map(item=>({...item,timestamp:(now.getTime()-age)/1000}))})}).rows[0];
 assert.equal(timed(120000).freshness,'fresh');assert.equal(timed(120001).freshness,'delayed');
 assert.equal(timed(900000).freshness,'delayed');assert.equal(timed(900001).freshness,'stale');
 assert.equal(timed(120001).label,'Delayed observation');assert.equal(timed(120001).relative[0].openToNowPp,null);assert.equal(timed(120001).stops[0].distancePct,null);
 const missing=build({quoteSnapshot:snapshot({quotes:snapshot().quotes.slice(1)})}).rows[0];assert.equal(missing.freshness,'unavailable');assert.equal(missing.price,null);
 const duplicate=build({quoteSnapshot:snapshot({quotes:[...snapshot().quotes,quote('DELL')]})}).rows[0];assert.equal(duplicate.freshness,'unavailable');
 for(const bad of [snapshot({contract:'other'}),snapshot({receivedAt:'2026-10-14T16:00:01.000Z'}),snapshot({receivedAt:'2026-10-14 12:00:00'}),
  snapshot({quotes:[quote('DELL',{timestamp:now.getTime()/1000+1})]}),snapshot({quotes:[quote('DELL',{price:0})]}),snapshot({quotes:[quote('DELL',{timestamp:null})]})])
  assert.equal(build({quoteSnapshot:bad}).rows[0].freshness,'unavailable');
 assert.equal(build({quoteSnapshot:snapshot({cacheStatus:'stale-fallback'})}).rows[0].freshness,'stale');
 assert.equal(build({quoteSnapshot:snapshot({quotes:[quote('DELL',{timestamp:Date.parse('2026-10-13T16:00:00Z')/1000})]})}).rows[0].freshness,'stale');
 const skew=build({quoteSnapshot:snapshot({quotes:snapshot().quotes.map(item=>item.symbol==='SPY'?{...item,timestamp:item.timestamp-61}:item)})}).rows[0];
 assert.equal(skew.relative[0].status,'unavailable');assert.equal(skew.relative[0].openToNowPp,null);
 const minute=build({quoteSnapshot:snapshot({quotes:snapshot().quotes.map(item=>item.symbol==='SPY'?{...item,timestamp:item.timestamp-60}:item)})}).rows[0];assert.equal(minute.relative[0].status,'synchronized');
 const mismatchedBasis=build({quoteSnapshot:snapshot({quotes:snapshot().quotes.map(item=>item.symbol==='DELL'?{...item,previousClose:100.01}:item)})}).rows[0];
 assert.equal(mismatchedBasis.basisStatus,'mismatch');assert.equal(mismatchedBasis.stops[0].distancePct,null);assert.notEqual(mismatchedBasis.label,'Historical momentum / current weakness');
 const staleBaseline=build({baselineCurrent:false});assert.equal(staleBaseline.baselineStatus,'stale');assert.equal(staleBaseline.rows[0].stops[0].distancePct,null);assert.equal(staleBaseline.rows[0].label,'Daily baseline stale');
 const noStops=build({targets:[{...targets[0],stops:[]}]}).rows[0];equal(noStops.stops,[]);
 const reached=build({quoteSnapshot:snapshot({quotes:snapshot().quotes.map(item=>item.symbol==='DELL'?{...item,price:94}:item)})}).rows[0];
 assert.equal(reached.stops[0].status,'at-or-below');assert.equal(reached.label,'Recorded stop proximity');
 const boundaries=[
  ['2026-10-14T13:29:59Z',false,'premarket'],['2026-10-14T13:30:00Z',true,'open'],
  ['2026-10-14T19:59:59Z',true,'open'],['2026-10-14T20:00:00Z',false,'after-hours'],
  ['2026-11-27T17:59:59Z',true,'open'],['2026-11-27T18:00:00Z',false,'after-hours'],
  ['2026-10-17T16:00:00Z',false,'closed'],['2026-12-25T16:00:00Z',false,'closed'],
 ];
 for(const [at,isOpen,phase] of boundaries){
  const fixture=snapshot({receivedAt:new Date(at).toISOString(),quotes:snapshot().quotes.map(item=>({...item,timestamp:Date.parse(at)/1000}))});
  const result=build({now:new Date(at),quoteSnapshot:fixture});assert.equal(result.market.isOpen,isOpen);assert.equal(result.market.phase,phase);
  if(!isOpen)assert.notEqual(result.rows[0].freshness,'fresh');
 }

 let calls=0,clock=now.getTime(),fail=false,seenUrl=null;
 const fetchImpl=async(url,options)=>{
  calls++;seenUrl=new URL(url);assert.equal(options.cache,'no-store');assert.equal(options.headers,undefined,'No account authorization reaches quote source');
  if(fail)throw new Error('secret-key-in-url and raw provider body');
  return {ok:true,json:async()=>[quote('DELL'),quote('BF-B',{price:20}),quote('BRK-B',{price:400}),quote('SPY')]};
 };
 const get=provider.createC1IntradayQuoteProvider({fetchImpl,nowMs:()=>clock,apiKey:()=> 'test-private-secret'});
 for(const bad of ['',Array(33).fill('SPY'),'DELL/../../account'])await assert.rejects(get(bad));assert.equal(calls,0);
 const fetched=await get('DELL,SPY,BF.B,BRK.B');assert.equal(calls,1);assert.equal(fetched.cacheStatus,'live');
 assert.equal(seenUrl.pathname,'/stable/batch-quote');assert.equal(seenUrl.searchParams.get('symbols'),'BF-B,BRK-B,DELL,SPY');
 assert.ok(!JSON.stringify(fetched).includes('test-private-secret'));equal(fetched.quotes.map(item=>item.symbol),['DELL','BF.B','BRK.B','SPY']);
 fetched.quotes[0].price=777;const cached=await get('SPY,BF.B,BRK.B,DELL');assert.equal(calls,1);assert.equal(cached.cacheStatus,'fresh-memory');assert.equal(cached.quotes[0].price,98);
 clock+=61000;fail=true;const fallback=await get('DELL,SPY,BF.B,BRK.B');assert.equal(calls,2);assert.equal(fallback.cacheStatus,'stale-fallback');
 assert.ok(!JSON.stringify(fallback).includes('secret-key-in-url'));const cooldown=await get('DELL,SPY,BF.B,BRK.B');assert.equal(cooldown.cacheStatus,'stale-cooldown');assert.equal(calls,2);
 await assert.rejects(get('QQQ'),/cooldown/);assert.equal(calls,2,'Outage cooldown also protects different batches');
 clock+=20001;fail=false;assert.equal((await get('DELL,SPY,BF.B,BRK.B')).cacheStatus,'live');assert.equal(calls,3);
 const cleaned=provider.sanitizeC1IntradayQuotes([quote('DELL'),quote('DELL'),quote('SPY',{price:0}),quote('QQQ',{volume:999,apikey:'secret'}),quote('BF-B',{timestamp:null})],['DELL','SPY','QQQ','BF.B']);
 equal(cleaned.map(item=>item.symbol),['QQQ','BF.B']);assert.equal(cleaned[1].timestamp,null);
 assert.ok(!JSON.stringify(cleaned).includes('volume'));assert.ok(!JSON.stringify(cleaned).includes('apikey'));

 let release,inflightCalls=0;const gate=new Promise(resolve=>{release=resolve;});
 const joined=provider.createC1IntradayQuoteProvider({nowMs:()=>now.getTime(),apiKey:()=> 'hidden',fetchImpl:async()=>{inflightCalls++;await gate;return {ok:true,json:async()=>[quote('DELL')]};}});
 const first=joined('DELL'),second=joined('DELL');await Promise.resolve();assert.equal(inflightCalls,1);release();
 const [firstResult,secondResult]=await Promise.all([first,second]);assert.equal(firstResult.cacheStatus,'live');assert.equal(secondResult.cacheStatus,'inflight');assert.equal(inflightCalls,1);
 const thrown=provider.createC1IntradayQuoteProvider({nowMs:()=>clock,apiKey:()=> 'hidden',fetchImpl:()=>{throw new Error('private-url');}});
 await assert.rejects(thrown('DELL'),error=>error.message==='Intraday quote source is unavailable; refresh later.');
 clock+=20001;await assert.rejects(thrown('DELL'),/unavailable/,'Synchronous fetch failure does not leave stuck inflight state');

 const handler=route();let endpointCalls=0;
 const quoteGetter=async symbols=>{endpointCalls++;equal(symbols,['DELL','SPY']);return snapshot();};
 for(const req of [{method:'POST',query:{symbols:'DELL'}},{method:'GET',query:{symbols:['DELL','SPY']}},
  {method:'GET',query:{symbols:Array(33).fill('SPY').join(',')}},{method:'GET',query:{symbols:'DELL',account:'secret'}}]){
  const res=response();await handler(req,res,quoteGetter);assert.ok([400,405].includes(res.statusCode));assert.equal(res.headers['Cache-Control'],'no-store');
 }assert.equal(endpointCalls,0,'Malformed requests are rejected before any provider call');
 const res=response();await handler({method:'GET',query:{symbols:'SPY,DELL'},headers:{authorization:'private-sync-key'}},res,quoteGetter);
 assert.equal(res.statusCode,200);assert.equal(endpointCalls,1);assert.equal(res.headers['Cache-Control'],'no-store');
 const failed=response();await handler({method:'GET',query:{symbols:'DELL'}},failed,async()=>{throw new Error('private request key');});
 assert.equal(failed.statusCode,503);assert.ok(!JSON.stringify(failed.body).includes('private'));
 const apiSource=fs.readFileSync('pages/api/c1-intraday-advisory.js','utf8');
 for(const forbidden of ['c1AccountService','c1DatedBookStore','portfolio-sync','research/','setInterval','writeFile','put('])assert.ok(!apiSource.includes(forbidden));
 console.log('C1 intraday advisory regression: targets, immutability, sessions, freshness, basis, benchmarks, stops, bounded provider and read-only API passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
