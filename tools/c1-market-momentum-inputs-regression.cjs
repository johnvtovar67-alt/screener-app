// Synthetic market-only inputs; both consumer text and scheduled observations use the actual gate.
const assert=require('node:assert/strict');
const loader=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const {buildC1StockScreenSnapshot:screen,classifyC1StockScreen:classify}=loader.load('lib/c1StockClassification.js');
const {observeC1MarketScreen}=loader.load('lib/c1MarketScreenObservation.js');
const days=['2026-10-29','2026-10-30','2026-11-02','2026-11-03','2026-11-04','2026-11-05'];
const symbols=['AAA','BBB','CCC'];
const data=()=>days.map((date,i)=>({date,decisionAt:date+'T22:00:00Z',prices:symbols.map(symbol=>({symbol,close:100+i,adjusted:true})),
 signals:symbols.map((symbol,k)=>({symbol,price:100+i,sector:'sector'+k,researchFactors:{momentumPercentile:99-k},entryTiming:{available:true,macdImproving:true,liquidityPass:true,averageDollarVolume20:500000000}}))}));
const source=days.at(-1);
function check(change,expected,date){
 const sessions=data();change(sessions);
 const snapshot=screen(sessions.at(-1),new Date(),sessions);
 const rows=symbols.map(symbol=>({symbol,price:105,eventRisk:{status:'Clear'},expertDecision:{metrics:{quoteFreshnessPass:true}}}));
 const result=classify({snapshot,rows,current:true}),row=result.find(r=>r.symbol==='AAA');
 const args=[];observeC1MarketScreen({universe:'sp500',model:{sessions}},{sourceSessionDate:source,decisionSnapshot:{requiredSessionDate:source}},new Date(),(...a)=>args.push(a));
 assert.equal(args.length,1);const observation=JSON.parse(args[0][1]);
 if(!expected){assert.equal(row.rating,'Buy');assert.equal(observation.unavailable.length,0);return;}
 assert.equal(row.rating,'Watch');assert.match(row.screenReview.next,new RegExp(date));
 assert.deepEqual(observation.unavailable.map(r=>r.symbol),['AAA']);
 assert(observation.unavailable[0].inputs.some(i=>i.date===date&&i.code===expected));
 assert.equal(observation.sourceSessionDate,source);
}
check(()=>{},null);
check(s=>s[0].prices.shift(),'CLOSE_MISSING',days[0]);
check(s=>s[1].prices.push({...s[1].prices[0]}),'CLOSE_DUPLICATE',days[1]);
check(s=>{delete s.at(-1).signals[0].entryTiming.macdImproving;},'MACD_MISSING',source);
check(s=>{s.at(-1).signals[0].entryTiming.asOf=days[4];},'TIMING_DATE',source);
check(s=>{s.at(-1).signals[0].entryTiming.available=false;},'TIMING_MISSING',source);
console.log('PASS: precise dated momentum blockers are isolated by issuer and clear on complete accepted inputs.');
