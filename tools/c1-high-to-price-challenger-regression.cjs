// Offline mechanics only. No provider, account, Blob or production route access.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const htp=loader.load('lib/c1HighToPriceChallenger.js');

const rows=Array.from({length:101},(_,index)=>({close:index===100?120:100+index/10,high:index===50?150:101+index/10}));
const observation=htp.c1HighToPriceObservation(rows);
assert.equal(observation.startPrice,100);assert.equal(observation.formationHigh,150);assert.equal(observation.endPrice,120);
assert(Math.abs(observation.prePeakReturnPct-50)<1e-9);assert(Math.abs(observation.postPeakReturnPct+20)<1e-9);
assert(Math.abs(observation.totalReturnPct-20)<1e-9);assert(Math.abs(observation.logIdentityError)<1e-12);

const dates=[];for(let date=new Date('2025-01-02T00:00:00Z');dates.length<260;date.setUTCDate(date.getUTCDate()+1)){
 const key=date.toISOString().slice(0,10);if(loader.load('lib/marketSession.js').isUsMarketSessionDay(key))dates.push(key);
}
const symbols=['AAA','BBB','CCC'];
const sessions=dates.map((date,index)=>{
 const prices=symbols.map(symbol=>{const formation=index===50?(symbol==='AAA'?150:symbol==='BBB'?125:110):100+Math.min(index,100)*.2,currentHigh=index===120?999:formation;return {symbol,date,open:formation,high:currentHigh,low:formation,close:index===100?120:formation,volume:1000000,adjusted:true};});
 const row=symbol=>({symbol,sector:symbol,price:prices.find(price=>price.symbol===symbol).close,action:'Strong Buy',entryTiming:{},researchFactors:{return120Ex20:20,momentumPercentile:symbol==='CCC'?7:50}});
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals:['AAA','BBB'].map(row),positionSignals:[row('CCC')],universeSymbols:symbols,corporateActions:[]};
});
const dataset={metadata:{benchmarkSymbol:'SPY'},sessions},transformed=htp.buildC1HighToPriceDataset(dataset),target=transformed.sessions[120];
const aaa=target.signals.find(row=>row.symbol==='AAA').researchFactors,bbb=target.signals.find(row=>row.symbol==='BBB').researchFactors;
const ccc=target.positionSignals.find(row=>row.symbol==='CCC').researchFactors;
assert(aaa.highToPricePrePeakReturnPct>bbb.highToPricePrePeakReturnPct);assert.equal(aaa.momentumPercentile,100);assert.equal(bbb.momentumPercentile,50);
assert.equal(ccc.momentumPercentile,0);assert.equal(ccc.highToPriceContract,htp.C1_HIGH_TO_PRICE_CONTRACT,'Holding-only signals must not retain the Champion rank');
assert.equal(aaa.highToPriceFormationHigh,150,'The current-session high cannot leak into the lagged formation window');
assert.equal(dataset.sessions[120].signals[0].researchFactors.highToPriceContract,undefined,'The accepted input dataset remains immutable');
const evaluationStartIndex=252,retainedStartIndex=evaluationStartIndex-htp.C1_HIGH_TO_PRICE_REQUIRED_PRE_EVALUATION_SESSIONS;
assert.equal(htp.C1_HIGH_TO_PRICE_SIMULATOR_WARMUP_SESSIONS,2);
assert.equal(htp.C1_HIGH_TO_PRICE_REQUIRED_PRE_EVALUATION_SESSIONS,122);
assert.equal(retainedStartIndex,130);
assert.equal(htp.c1HighToPriceRetainedStartIndex(dates,dates[evaluationStartIndex]),retainedStartIndex);
// MBC-shaped late entrant: the accepted compiler includes a security after 50
// observations but correctly leaves its 120-ex-20 factor absent until 121.
// The Challenger must preserve that eligibility state, exclude it from the
// dated peer denominator, and never manufacture a shorter history.
const lateEntrantDataset=JSON.parse(JSON.stringify(dataset));
for(let index=200;index<lateEntrantDataset.sessions.length;index++){
 const session=lateEntrantDataset.sessions[index],close=80+(index-200)*.1;
 session.prices.push({symbol:'LATE',date:session.date,open:close,high:close*1.01,low:close*.99,close,volume:5000000,adjusted:true});
}
const lateRow={symbol:'LATE',sector:'Industrials',price:85.2,avgVolume:5000000,action:'Strong Buy',entryTiming:{},researchFactors:{return120Ex20:null,momentumPercentile:null}};
lateEntrantDataset.sessions[evaluationStartIndex].signals.push(JSON.parse(JSON.stringify(lateRow)));
lateEntrantDataset.sessions[evaluationStartIndex].positionSignals.push(JSON.parse(JSON.stringify(lateRow)));
const lateTransformed=htp.buildC1HighToPriceDataset(lateEntrantDataset),lateSession=lateTransformed.sessions[evaluationStartIndex];
for(const field of ['signals','positionSignals']){
 const factors=lateSession[field].find(row=>row.symbol==='LATE').researchFactors;
 assert.equal(factors.return120Ex20,null);assert.equal(factors.momentumPercentile,null);
 assert.equal(factors.highToPricePrePeakReturnPct,null);assert.equal(factors.highToPriceFormationHigh,null);
 assert.equal(factors.highToPriceContract,htp.C1_HIGH_TO_PRICE_CONTRACT);
}
const baselineAtLateDate=htp.buildC1HighToPriceDataset(dataset).sessions[evaluationStartIndex];
for(const field of ['signals','positionSignals'])for(const signal of baselineAtLateDate[field])
 assert.equal(lateSession[field].find(row=>row.symbol===signal.symbol).researchFactors.momentumPercentile,signal.researchFactors.momentumPercentile,'An ineligible late entrant must not change observed peer ranks');
const contradictory=JSON.parse(JSON.stringify(lateEntrantDataset));
for(const field of ['signals','positionSignals'])contradictory.sessions[evaluationStartIndex][field].find(row=>row.symbol==='LATE').researchFactors.return120Ex20=12;
assert.throws(()=>htp.buildC1HighToPriceDataset(contradictory),/Champion formation factor is observed but high-to-price history is incomplete for LATE/,'Observed Champion formation evidence must still fail closed if its accepted price history is contradictory');
const comparisonArgs={startDate:dates[evaluationStartIndex],endDate:dates.at(-1)};
const ordinary=htp.runC1HighToPriceComparison({dataset:lateEntrantDataset,...comparisonArgs});
const progress=[];
const memoryBound=htp.runC1HighToPriceComparisonMemoryBound({dataset:JSON.parse(JSON.stringify(lateEntrantDataset)),...comparisonArgs,onProgress:event=>progress.push(event)});
assert.deepEqual(memoryBound,ordinary,'The memory-bounded preview must exactly match the immutable comparison');
const trimmedDataset={metadata:JSON.parse(JSON.stringify(lateEntrantDataset.metadata)),sessions:JSON.parse(JSON.stringify(lateEntrantDataset.sessions.slice(retainedStartIndex)))};
const trimmed=htp.runC1HighToPriceComparisonMemoryBound({dataset:trimmedDataset,...comparisonArgs});
assert.deepEqual(trimmed,memoryBound,'The exact 120-session formation plus two-session simulator warmup must reproduce the full-history comparison');
assert.deepEqual(progress.map(event=>`${event.phase}:${event.sleeve||''}`),[
 'champion-sleeve-start:base','champion-sleeve-end:base','champion-sleeve-start:cooldown15','champion-sleeve-end:cooldown15',
 'champion-sleeve-start:sector40','champion-sleeve-end:sector40','challenger-transform-start:','challenger-transform-end:',
 'challenger-sleeve-start:base','challenger-sleeve-end:base','challenger-sleeve-start:cooldown15','challenger-sleeve-end:cooldown15',
 'challenger-sleeve-start:sector40','challenger-sleeve-end:sector40',
],'Preview progress must expose only the fixed restore/arm/sleeve sequence');

const previewRunner='pages/api/research/c1-high-to-price-historical.js';
const appSources=['pages','components'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(file=>/\.(js|jsx|ts|tsx)$/.test(file)).map(file=>dir+'/'+file));
for(const file of appSources)if(file!==previewRunner)assert(!fs.readFileSync(file,'utf8').includes('c1HighToPriceChallenger'),file+' must not import the offline challenger');
const runnerSource=fs.readFileSync(previewRunner,'utf8');
assert(runnerSource.includes("process.env.VERCEL_ENV==='production'"),'The one-time historical runner must refuse production');
assert(runnerSource.includes("phase:'restore-chunk-end'")&&runnerSource.includes("phase:'response-ready'"),'The one-time runner must emit bounded phase timings');
assert(runnerSource.includes('ACCEPTED_RETAINED_START_INDEX=130')&&runnerSource.includes("ACCEPTED_RETAINED_FIRST_SESSION='2022-07-12'"),'The accepted preview must retain the exact registered causal window');
assert(!runnerSource.includes('Promise.all(batch.map'),'The accepted preview must restore one chunk at a time');
assert(!runnerSource.includes('put(')&&!runnerSource.includes('FMP_API_KEY'),'The one-time historical runner must not write or acquire provider data');
const source=fs.readFileSync('lib/c1HighToPriceChallenger.js','utf8');
assert(!/fetch\s*\(|@vercel\/blob|process\.env|pages\/api/.test(source),'The challenger must not acquire data or depend on runtime infrastructure');
console.log('PASS: fixed 120-to-20 high-to-price decomposition, exact log identity, causal observed-only cross-sectional rank, Champion-parity late-entrant eligibility, immutable inputs, equivalent memory-bounded execution and one read-only preview runner that refuses production.');
