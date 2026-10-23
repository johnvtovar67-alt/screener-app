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

const dates=[];for(let date=new Date('2025-01-02T00:00:00Z');dates.length<123;date.setUTCDate(date.getUTCDate()+1)){
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
const comparisonArgs={startDate:dates[120],endDate:dates.at(-1)};
const ordinary=htp.runC1HighToPriceComparison({dataset,...comparisonArgs});
const progress=[];
const memoryBound=htp.runC1HighToPriceComparisonMemoryBound({dataset:JSON.parse(JSON.stringify(dataset)),...comparisonArgs,onProgress:event=>progress.push(event)});
assert.deepEqual(memoryBound,ordinary,'The memory-bounded preview must exactly match the immutable comparison');
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
assert(runnerSource.includes("phase:'restore-batch-end'")&&runnerSource.includes("phase:'response-ready'"),'The one-time runner must emit bounded phase timings');
assert(!runnerSource.includes('put(')&&!runnerSource.includes('FMP_API_KEY'),'The one-time historical runner must not write or acquire provider data');
const source=fs.readFileSync('lib/c1HighToPriceChallenger.js','utf8');
assert(!/fetch\s*\(|@vercel\/blob|process\.env|pages\/api/.test(source),'The challenger must not acquire data or depend on runtime infrastructure');
console.log('PASS: fixed 120-to-20 high-to-price decomposition, exact log identity, causal cross-sectional rank, immutable inputs, equivalent memory-bounded execution and one read-only preview runner that refuses production.');
