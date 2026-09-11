// Return-blind, synthetic dependency check. No candidate selection or new
// historical backtest. Establish which metadata the frozen C1 actually uses.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),options=loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS;
const {simulatePointInTimePortfolio:simulate}=loader.load('lib/c1FrozenSimulator.js');
const symbols=['AAA','BBB','CCC','DDD','EEE','FFF'];
const make=(sectorMode,fundamentalValue)=>({metadata:{},sessions:['2026-09-01','2026-09-02','2026-09-03'].map(date=>({date,decisionAt:date+'T20:00:00Z',universeSymbols:symbols,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,high:101,low:99,close:100,volume:1e7})),
 signals:symbols.map((symbol,i)=>({symbol,price:100,sector:sectorMode==='same'?'Shared':'Sector'+i,
 fundamentalDataVerified:fundamentalValue,eventRiskVerified:fundamentalValue,
 researchFactors:{momentumPercentile:100-i,volatility60Pct:20,qualityPercentile:fundamentalValue?100:0},
 entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:5e8}}))}))});
const results={};
for(const [id,opt] of Object.entries(options)){
 const run=(mode,f)=>simulate(make(mode,f),{...opt,startDate:'2026-09-01',endDate:'2026-09-03',liquidateAtEnd:false});
 const a=run('different',true),b=run('different',false),c=run('same',true);
 const fills=run=>run.trades.map(({signalSnapshot,...fill})=>fill);
 assert.equal(JSON.stringify(fills(a)),JSON.stringify(fills(b)),'Fundamental/event flags and quality scores must not affect frozen price-only C1 here');
 assert.notEqual(JSON.stringify(fills(a)),JSON.stringify(fills(c)),'Sector labels DO affect C1 allocation even with price-only ranking');
 results[id]={fundamentalFlagPerturbationChangesFills:false,sectorLabelPerturbationChangesFills:true};
}
const source=fs.readFileSync('lib/fmpResearchBacktest.js','utf8');
const compiler=source.slice(source.indexOf('async function compilePointInTimeNasdaqDataset('),source.indexOf('async function compilePointInTimeNasdaqDataset(')+4000);
assert.ok(compiler.includes('sector: source.sector || "Other"'));
const report={date:'2026-09-11',scope:'Synthetic dependency audit plus source inspection; not a performance test',
 newHistoricalEvidence:false,eligibleForLiveCapital:false,results,
 compilerSha256:createHash('sha256').update(source).digest('hex'),
 finding:'Nasdaq compiler copies a profile sector without a decision-date sector lookup. C1 uses sector caps. Historical membership and price-only ranking do not establish point-in-time sector provenance.',
 impact:'The direction or size of any historical return effect is not established. Published arithmetic is not changed by this audit.',
 required:'Verify historical sector assignments for the tested member-dates, or retain a documented data-integrity limitation. Do not silently disable sector caps or relabel a corrected replay as new holdout evidence.'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');else console.log(JSON.stringify(report,null,2));
