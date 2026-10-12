const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {replayPolicy,compareRuns,verifyRecordedReplay,calculateMetrics,stringifyAudit,parseAudit}=require('./c1-production-policy-replay.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {digest}=require('./c1-production-replay-loader.cjs');
const root=process.cwd(),calendar=createResearchModuleLoader(root).load('lib/marketSession.js');
const dates=[];for(let t=Date.parse('2026-03-02T12:00Z');dates.length<48;t+=86400000){const day=new Date(t).toISOString().slice(0,10);if(calendar.isUsMarketSessionDay(day))dates.push(day);}
const symbols=['AAA','BBB','CCC',...Array.from({length:10},(_,i)=>'P'+i),'MSTR','SCHW'];
function fixture(length=48){return {metadata:{schema:'screener-pit-v1'},sessions:dates.slice(0,length).map((date,day)=>{
 const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{const base=symbol==='AAA'?300.3:symbol==='BBB'?10:symbol==='CCC'?110:80+i;const mult=day<35?1:0.8;const trend=symbol==='AAA'&&day>=4?1.15:1;const mark=base*mult*trend;return {symbol,open:mark,high:mark*1.001,low:mark*(symbol==='P2'&&day===25?.8:.999),close:mark,adjusted:true};});
 const signals=symbols.map((symbol,i)=>({symbol,price:prices[i].close,sector:i<2?'A':i===2?'B':'Sector'+i,cik:i>=3&&i<=4?'77':String(i+100),action:'Strong Buy',entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:1e9,strongPass:true},researchFactors:{momentumPercentile:symbol==='SCHW'?101:symbol==='MSTR'?102:symbol==='AAA'?(day>=7?93:100):symbol==='BBB'?(day>=12?1:99):symbol==='CCC'?(day>=4?96.15:98):97-i/10,volatility60Pct:20},riskPlan:{invalidationPrice:prices[i].close*.5}}));
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals,positionSignals:signals,universeSymbols:symbols,corporateActions:[]};})};}
function originalLoaderFactory(root,{slippageBps}){const loader=createResearchModuleLoader(root);for(const config of Object.values(loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS))config.slippageBps=slippageBps;return {...loader,stats:{},traceBySleeve:{},identity:()=>({unmodifiedProductionSource:true})};}
const benchmarkFixture=[{equity:100,cash:0,benchmarks:{SPY:110,QQQ:110},benchmarkEntryOpens:{SPY:100,QQQ:100}},{equity:110,cash:0,benchmarks:{SPY:121,QQQ:121},benchmarkEntryOpens:{SPY:121,QQQ:121}}];
const benchmarkMetrics=calculateMetrics(benchmarkFixture,[],100);
assert(Math.abs(benchmarkMetrics.benchmarkComparisons.SPY.simpleReturnPct-10)<1e-12,'Benchmark entry shares cancel: first close 110, final close121 is 10%, not first-open21%');
assert(Math.abs(benchmarkMetrics.benchmarkComparisons.SPY.excessReturnPct)<1e-12,'Portfolio10% and close-to-close benchmark10% have zero excess');
assert(Math.abs(benchmarkMetrics.benchmarkComparisons.SPY.simpleOpenToCloseReturnPct-21)<1e-12,'Optional open-to-close measure is explicitly separate');
const unusualState={positive:Infinity,negative:-Infinity,negativeZero:-0,nan:NaN,empty:undefined,array:[undefined,Infinity,null],nested:{retained:undefined}};
assert.deepEqual(parseAudit(stringifyAudit(unusualState)),unusualState,'Durable audit encoding preserves nonfinite numbers and explicit undefined');
const checks=[];
for(const cost of [12,25,50]){
 const dataset=fixture(),request={root,dataset,startDate:dates[0],endDate:dates[47],slippageBps:cost};
 const cached=replayPolicy({...request,cached:true}),uncached=replayPolicy({...request,cached:false});
 const parity=compareRuns(cached,uncached);if(!parity.passed)console.log(JSON.stringify(parity));assert.equal(parity.passed,true,'All raw states/plans/fills/traces must equal cache disabled at '+cost+' bps');
 const original=replayPolicy({...request,loaderFactory:originalLoaderFactory});
 for(const field of ['metrics','curve','trades','fills','plans','accountTrace','final'])assert.deepEqual(cached[field],original[field],'Literal unmodified production parity '+cost+' '+field);
 assert(cached.cacheStats.resumes>0);assert(cached.cacheStats.sessionsExecuted<uncached.cacheStats.sessionsExecuted/5);
 assert(!cached.trades.some(t=>['SCHW','MSTR'].includes(t.symbol)),'Excluded stock must never consume allocation');
 assert(cached.trades.some(t=>t.reason==='profit-rank-deterioration'),'Armed 5–29 profit exit fixture');
 assert(cached.trades.some(t=>t.reason==='early-rank-deterioration'),'5–29 early exit fixture');
 assert(cached.trades.some(t=>t.reason==='rank-deterioration'),'30+ ordinary rank exit fixture');
 assert(cached.trades.some(t=>t.reason==='initial-stop'),'14% source price stop fixture');
 assert(cached.trades.every(t=>Number.isSafeInteger(t.shares)),'Actual fill shares are whole');
 assert(cached.curve.every(p=>p.cash>=0),'Cash remains funded at all costs');
 const durableRun=parseAudit(stringifyAudit(cached));assert.deepEqual(durableRun,cached,'Saved audit result must preserve complete raw state');const fullRecorded=verifyRecordedReplay({root,run:durableRun,dataset});assert(fullRecorded.passed,'One uncached full chronological replay must reproduce every cached source close');
 checks.push({cost,passed:true,fullRecorded,equivalence:parity,metrics:cached.metrics,sourcePin:cached.sourcePin});
}
// Force exact double-floor sector allocation, not a direct normalized-cash rewrite.
const boundary=fixture(2);boundary.sessions.forEach(s=>{s.signals=s.signals.slice(0,3);s.positionSignals=s.signals;s.universeSymbols=s.signals.map(x=>x.symbol);s.signals.forEach(x=>{x.action='Buy';x.entryTiming.strongPass=false;});});
const actual=replayPolicy({dataset:boundary,startDate:dates[0],endDate:dates[1]});
const quantities=Object.fromEntries(actual.fills.filter(f=>f.side==='buy').map(f=>[f.sleeve+':'+f.symbol,f.shares]));
assert.deepEqual(quantities,{'base:AAA':27,'base:BBB':430,'base:CCC':74,'cooldown15:AAA':54,'cooldown15:BBB':861,'cooldown15:CCC':149,'sector40:AAA':27,'sector40:BBB':181,'sector40:CCC':74});
// A small fixed account exposes mapped-zero and below-model-minimum quantities.
for(const capital of [1000,2400,5200]){const request={dataset:boundary,startDate:dates[0],endDate:dates[1],initialCapital:capital};const c=replayPolicy(request),o=replayPolicy({...request,loaderFactory:originalLoaderFactory});assert.deepEqual(c.final,o.final,'Small-capital minTrade/mapped0 source parity');assert.deepEqual(c.plans,o.plans);assert.deepEqual(c.fills,o.fills);}
const receipt={contract:'c1-production-policy-replay-regression-v1',passed:true,checks,boundaryQuantities:quantities,adapterSha256:digest(fs.readFileSync(path.join(root,'tools/c1-production-replay-loader.cjs'))),engineSha256:digest(fs.readFileSync(path.join(root,'tools/c1-production-policy-replay.cjs'))),coverage:['literal unmodified production source','12/25/50 bps','cached vs uncached all states','production double-floor sizing','same-sector sequential projection budget','issuer constraints','14% stops','5–29 early momentum','5–29 peak-profit armed exit','30+ rank exit','cash constraints','mapped zero','minimumTrade boundary','immutable input content','benchmark close-to-close convention','lossless saved audit state','saved-run full uncached source verification']};
const output=process.env.C1_REPLAY_REGRESSION_OUTPUT;if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(receipt,null,2));}
console.log(JSON.stringify({passed:true,checks:checks.length,boundaryQuantities:quantities,coverage:receipt.coverage}));
