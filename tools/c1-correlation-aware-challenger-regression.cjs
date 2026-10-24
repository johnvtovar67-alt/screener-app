// Synthetic mechanics and isolation only. No provider, Blob, account or production access.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const challenger=loader.load('lib/c1CorrelationAwareChallenger.js');
const canonical=loader.load('lib/c1AccountSimulator.js');
const isolated=loader.load('lib/c1CorrelationAwareSimulator.js');
const frozen=loader.load('lib/c1FrozenOptions.js');
const market=loader.load('lib/marketSession.js');

const dates=[];for(let date=new Date('2025-01-02T00:00:00Z');dates.length<95;date.setUTCDate(date.getUTCDate()+1)){
 const key=date.toISOString().slice(0,10);if(market.isUsMarketSessionDay(key))dates.push(key);
}
const symbols=['SPY','QQQ','AAA','BBB','CCC','DDD'];
const close=Object.fromEntries(symbols.map(symbol=>[symbol,100]));
const sessions=dates.map((date,index)=>{
 const common=.003*Math.sin(index*.7)+.001;
 const returns={SPY:.0008+common*.15,QQQ:.001+common*.25,AAA:common,BBB:common*1.02+.00001,CCC:-common*.7+.0002,DDD:.0005};
 for(const symbol of symbols)close[symbol]*=Math.exp(returns[symbol]);
 const prices=symbols.filter(symbol=>symbol!=='DDD'||index>20).map(symbol=>({symbol,date,open:close[symbol],high:close[symbol]*1.01,
  low:close[symbol]*.99,close:close[symbol],volume:5000000,adjusted:true}));
 const signals=['AAA','BBB','CCC','DDD'].map((symbol,rank)=>({symbol,sector:rank<2?'Technology':'Industrials',price:close[symbol],
  avgVolume:5000000,action:'Strong Buy',entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},
  researchFactors:{return120Ex20:20-rank,momentumPercentile:95-rank*10,volatility60Pct:20,factorCoverage:1}}));
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals,positionSignals:[],universeSymbols:symbols,corporateActions:[]};
});
const dataset={metadata:{benchmarkSymbol:'SPY'},sessions};

const selector=challenger.createC1CorrelationAwareEntryOrder(dataset);
let ordered=selector.order({signals:['AAA','BBB','CCC'].map(symbol=>({symbol})),heldSymbols:[],
 sessionDate:dates.at(-1),rankedEntryQueueCount:3}).map(row=>row.symbol);
assert.equal(JSON.stringify(ordered),JSON.stringify(['AAA','CCC','BBB']),
 'An empty sleeve must keep C1 rank one, then prefer the less-correlated peer');

const heldSelector=challenger.createC1CorrelationAwareEntryOrder(dataset);
ordered=heldSelector.order({signals:['BBB','CCC'].map(symbol=>({symbol})),heldSymbols:['AAA'],
 sessionDate:dates.at(-1),rankedEntryQueueCount:2}).map(row=>row.symbol);
assert.equal(JSON.stringify(ordered),JSON.stringify(['CCC','BBB']),
 'An open slot must prefer the C1 queue member least correlated with the current holding');

const incompleteSelector=challenger.createC1CorrelationAwareEntryOrder(dataset);
ordered=incompleteSelector.order({signals:['AAA','DDD','BBB','CCC'].map(symbol=>({symbol})),heldSymbols:[],
 sessionDate:dates[65],rankedEntryQueueCount:4}).map(row=>row.symbol);
assert.equal(ordered[1],'DDD','Incomplete correlation evidence must retain the candidate original C1 queue slot');

const options={...JSON.parse(JSON.stringify(frozen.C1_FROZEN_OPTIONS.base)),startDate:dates[61],endDate:dates.at(-1),liquidateAtEnd:false};
const champion=canonical.simulatePointInTimePortfolio(dataset,options,null);
const noHook=isolated.simulatePointInTimePortfolio(dataset,options,null);
assert.equal(JSON.stringify(noHook),JSON.stringify(champion),
 'The generated research simulator must exactly reproduce C1 when the entry-order hook is absent');

assert.equal(challenger.c1CorrelationRetainedStartIndex(dates,dates[60]),0);
assert.equal(JSON.stringify(challenger.C1_CORRELATION_ARMS),JSON.stringify(['champion','correlation-aware-entry-60']));
assert.equal(challenger.C1_CORRELATION_LOOKBACK_RETURNS,60);

const generator=fs.readFileSync('tools/generate-c1-correlation-aware-simulator.cjs','utf8');
assert(generator.includes('63b1909359361e35ae7d0c2e833fecbb043013f7b337f9f2c96dc0a3adb2f31e'),
 'Generated simulator must remain pinned to the frozen canonical source');
const route='pages/api/research/c1-correlation-aware-challenger.js',runner=fs.readFileSync(route,'utf8');
assert(runner.includes("process.env.VERCEL_ENV==='production'"),'Preview route must refuse production');
assert(runner.includes("phase:'arm-summary'")&&runner.includes("phase:'response-ready'"),'Completed result must be logged before response');
assert(runner.includes("typeof req.query?.arm==='string'")&&runner.includes('C1_CORRELATION_ARMS.includes(arm)'),
 'Route must reject missing, repeated and unknown arms');
assert(runner.includes('ACCEPTED_RETAINED_START_INDEX=192')&&runner.includes("ACCEPTED_RETAINED_FIRST_SESSION='2022-10-07'"));
assert(!runner.includes('Promise.all(')&&!runner.includes('put(')&&!runner.includes('FMP_API_KEY'));

const appSources=['pages','components'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(file=>/\.(js|jsx|ts|tsx)$/.test(file)).map(file=>dir+'/'+file));
for(const file of appSources)if(file!==route)assert(!fs.readFileSync(file,'utf8').includes('c1CorrelationAwareChallenger'),
 file+' must not import the offline challenger');
assert(!/fetch\s*\(|@vercel\/blob|process\.env|pages\/api/.test(fs.readFileSync('lib/c1CorrelationAwareChallenger.js','utf8')));
console.log('PASS: correlation-aware entry ordering preserves C1 eligibility/exits, has deterministic 60-return mechanics and exact no-hook simulator parity, and remains preview-only.');
