// Synthetic mechanics only. No provider, account, Blob or production access.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const tournament=loader.load('lib/c1ReportedThesisTournament.js');
const market=loader.load('lib/marketSession.js');

const dates=[];for(let date=new Date('2025-01-02T00:00:00Z');dates.length<155;date.setUTCDate(date.getUTCDate()+1)){
 const key=date.toISOString().slice(0,10);if(market.isUsMarketSessionDay(key))dates.push(key);
}
const returns={SPY:[],QQQ:[],AAA:[],BBB:[],CCC:[]};
for(let index=0;index<dates.length;index++){
 const spy=(index%4===0?-0.009:0.004)+(index%9-4)*.00015;
 const qqq=(index%5===0?-0.007:0.005)-(index%7-3)*.00012;
 returns.SPY.push(spy);returns.QQQ.push(qqq);
 returns.AAA.push(.55*spy+.25*qqq+.0015);
 returns.BBB.push(1.2*spy+.35*qqq+.0001);
 returns.CCC.push(spy<0?.25*spy+.001:.8*spy+.2*qqq+.0005);
}
const closes={};for(const symbol of Object.keys(returns)){let price=100;closes[symbol]=returns[symbol].map(value=>(price*=Math.exp(value)));}
const rows=symbol=>dates.map((date,index)=>({symbol,date,open:closes[symbol][index],high:closes[symbol][index]*1.01,
 low:closes[symbol][index]*.99,close:closes[symbol][index],volume:5000000,adjusted:true}));
const bySymbol=Object.fromEntries(Object.keys(returns).map(symbol=>[symbol,rows(symbol)]));
const residualA=tournament.c1OlsResidualObservation(bySymbol.AAA.slice(0,101),bySymbol.SPY.slice(0,101),bySymbol.QQQ.slice(0,101));
const residualB=tournament.c1OlsResidualObservation(bySymbol.BBB.slice(0,101),bySymbol.SPY.slice(0,101),bySymbol.QQQ.slice(0,101));
assert(residualA.score>residualB.score,'Stock-specific drift must outrank benchmark co-movement');
const downA=tournament.c1DownsideResilienceObservation(bySymbol.AAA.slice(0,101),bySymbol.SPY.slice(0,101));
const downC=tournament.c1DownsideResilienceObservation(bySymbol.CCC.slice(0,101),bySymbol.SPY.slice(0,101));
assert(downC.downsideExcessMeanPct>downA.downsideExcessMeanPct,'Negative-market resilience must be measured only on negative SPY sessions');
assert(downA.negativeSpySessions>=10);

const sessions=dates.map((date,index)=>{
 const prices=Object.keys(returns).map(symbol=>bySymbol[symbol][index]);
 const signal=symbol=>({symbol,sector:symbol==='AAA'?'Technology':'Industrials',price:closes[symbol][index],avgVolume:5000000,
  action:'Strong Buy',entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},
  researchFactors:{return120Ex20:index>=120?10:null,momentumPercentile:index>=120?symbol==='AAA'?90:symbol==='BBB'?60:30:null,
   volatility60Pct:20,factorCoverage:1}});
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals:index>=120?['AAA','BBB','CCC'].map(signal):[],
  positionSignals:[],accountHoldingSignals:index===120?[{...signal('AAA'),symbol:'ACCOUNT_ONLY'}]:[],
  universeSymbols:Object.keys(returns),corporateActions:[]};
});
const dataset={metadata:{benchmarkSymbol:'SPY'},sessions},snapshot=JSON.stringify(dataset);
const residualDataset=tournament.buildC1ReportedThesisCandidate(dataset,'ols-residual-120-ex-20');
assert.equal(JSON.stringify(dataset),snapshot,'Immutable helper must preserve the accepted input');
const residualRanks=residualDataset.sessions[120].signals.map(row=>row.researchFactors.momentumPercentile);
assert(residualRanks.every(Number.isFinite)&&new Set(residualRanks).size===3,'Residual candidate must assign deterministic cross-sectional percentiles');
assert(Math.abs(residualDataset.sessions[120].signals[0].researchFactors.return120Ex20-residualA.score)<1e-12,
 'Allocation-light residual transform must preserve the pre-registered formula exactly');
const downsideDataset=tournament.buildC1ReportedThesisCandidate(dataset,'downside-resilience-120-ex-20');
const downRows=downsideDataset.sessions[120].signals;
assert(downRows.find(row=>row.symbol==='CCC').researchFactors.momentumPercentile>
 downRows.find(row=>row.symbol==='BBB').researchFactors.momentumPercentile,'Fixed downside blend must reward negative-market resilience');
assert(Math.abs(downRows.find(row=>row.symbol==='AAA').researchFactors.return120Ex20-downA.totalReturnPct)<1e-12,
 'Allocation-light downside transform must preserve the pre-registered formation return exactly');
const mutable=JSON.parse(snapshot),factors=mutable.sessions[120].signals[0].researchFactors;
tournament.applyC1ReportedThesisCandidateInPlace(mutable,'ols-residual-120-ex-20');
assert.strictEqual(mutable.sessions[120].signals[0].researchFactors,factors,'Memory-bounded transform must assign into existing factor objects');
assert.deepEqual(mutable.sessions[120].accountHoldingSignals,dataset.sessions[120].accountHoldingSignals,
 'Account-only rows must not enter or be rewritten by the offline historical peer set');
const sequential=JSON.parse(snapshot),direct=JSON.parse(snapshot);
tournament.applyC1ReportedThesisCandidateInPlace(sequential,'ols-residual-120-ex-20');
tournament.applyC1ReportedThesisCandidateInPlace(sequential,'downside-resilience-120-ex-20');
tournament.applyC1ReportedThesisCandidateInPlace(direct,'downside-resilience-120-ex-20');
for(let index=120;index<dates.length;index++)for(let row=0;row<direct.sessions[index].signals.length;row++)
 assert.deepEqual([sequential.sessions[index].signals[row].researchFactors.return120Ex20,
  sequential.sessions[index].signals[row].researchFactors.momentumPercentile],
 [direct.sessions[index].signals[row].researchFactors.return120Ex20,direct.sessions[index].signals[row].researchFactors.momentumPercentile],
 'Candidate B must fully overwrite Candidate A decision fields');
assert.throws(()=>tournament.applyC1ReportedThesisCandidateInPlace(JSON.parse(snapshot),'unknown'),/Unknown reported-thesis candidate/);
assert.equal(tournament.c1ReportedThesisRetainedStartIndex(dates,dates[122]),0);

const route='pages/api/research/c1-reported-thesis-tournament.js';
const appSources=['pages','components'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(file=>/\.(js|jsx|ts|tsx)$/.test(file)).map(file=>dir+'/'+file));
for(const file of appSources)if(file!==route)assert(!fs.readFileSync(file,'utf8').includes('c1ReportedThesisTournament'),file+' must not import the offline tournament');
const runner=fs.readFileSync(route,'utf8');
assert(runner.includes("process.env.VERCEL_ENV==='production'"),'Preview runner must refuse production');
assert(runner.includes("phase:'arm-summary'")&&runner.includes("phase:'response-ready'"),'Runner must preserve one bounded arm result');
assert(runner.includes("typeof req.query?.arm==='string'")&&runner.includes('C1_REPORTED_THESIS_ARMS.includes(arm)'),'Runner must reject missing, repeated and unknown arm values');
assert(runner.includes('runC1ReportedThesisArmMemoryBound')&&!runner.includes('runC1ReportedThesisTournamentMemoryBound'),'Each request must run exactly one isolated arm');
assert(runner.includes('ACCEPTED_RETAINED_START_INDEX=130')&&runner.includes("ACCEPTED_RETAINED_FIRST_SESSION='2022-07-12'"));
assert(!runner.includes('Promise.all(batch.map')&&!runner.includes('put(')&&!runner.includes('FMP_API_KEY'));
const source=fs.readFileSync('lib/c1ReportedThesisTournament.js','utf8');
assert(!/fetch\s*\(|@vercel\/blob|process\.env|pages\/api/.test(source));
assert(!source.includes('absolute-trend'),'Unreviewed absolute-trend policy gate must not enter the tournament');
assert(source.includes('prices.set(symbol,row.close)'),'Rolling window must retain scalar closes rather than accepted price-row objects');
assert(!source.includes('const sleeves={}'),'An arm must not retain all three full simulator results concurrently');
assert(source.includes('simulation=null'),'Each full sleeve result must be released before the next sleeve');
assert(source.includes('Float64Array')&&!source.includes('rowsFromWindow'),'Transform must avoid per-symbol formation-row arrays');
assert.equal(JSON.stringify(tournament.C1_REPORTED_THESIS_CANDIDATES.map(row=>row.id)),
 JSON.stringify(['ols-residual-120-ex-20','downside-resilience-120-ex-20']));
assert.equal(JSON.stringify(tournament.C1_REPORTED_THESIS_ARMS),JSON.stringify(['champion','ols-residual-120-ex-20','downside-resilience-120-ex-20']));
const completedReview=fs.readFileSync('docs/research/c1-reported-thesis-tournament-20261024.md','utf8');
for(const evidence of ['381.23411000000004','104.9617075','74.1361025','dpl_3fd8P4uLPdyg3n6a1HG6TxNJbd9z','dpl_6rAeZmgMjcggCfSb8BY34xWvhyfu'])
 assert(completedReview.includes(evidence),'Completed review must retain exact evidence '+evidence);
assert(completedReview.includes('reject both challengers')&&completedReview.includes('fresh, single-purpose preview deployment'),
 'Completed review must preserve the rejection and heavy-arm preflight rule');
console.log('PASS: two pre-registered, fixed 120-to-20 reported-thesis adaptations use rolling accepted prices, deterministic peer ranks, immutable public inputs, one memory-bounded preview runner and no production authority.');
