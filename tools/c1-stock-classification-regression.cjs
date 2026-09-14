const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const original=loader.load('tools/fixtures/c1-original-screen-policy.js');
const {buildC1StockScreenSnapshot:build,classifyC1StockScreen:classify}=loader.load('lib/c1StockClassification.js');
const {c1OpportunityPresentation:present}=loader.load('lib/c1EntryReview.js');
const session={date:'2026-09-11',signals:Array.from({length:12},(_,i)=>({symbol:'S'+i,companyName:'Issuer '+i,cik:String(100+i),sector:'Sector'+i,price:100,researchFactors:{momentumPercentile:100-i},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000,asOf:'2026-09-11'}}))};
const oldSnapshot={...original.buildV11ProductionSnapshot(session),status:'ready',requiredSessionDate:session.date};
const snapshot=build(session);
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.candidates)),JSON.parse(JSON.stringify(oldSnapshot.candidates)),'Source ranks match original C1 snapshot');
const live=snapshot.candidates.map(c=>({symbol:c.symbol,price:100,sector:c.sector,entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},recommendation:{expertDecision:{metrics:{quoteFreshnessPass:true}}},eventRisk:{status:'Passed'},finalDecision:{action:'Watch'}}));
function compare(rows,snap=snapshot,old=oldSnapshot){
 const actual=classify({snapshot:snap,rows,current:true});
 const expected=original.applyV11ProductionPolicy(rows,old);
 const labels=xs=>xs.map(x=>[x.symbol,x.rating||x.finalDecision.action]).sort((a,b)=>a[0].localeCompare(b[0]));
 assert.equal(JSON.stringify(labels(actual)),JSON.stringify(labels(expected)),'Buy/Watch classification must match original deployment, not queue side');return actual;
}
const classified=compare(live);
assert.equal(classified.filter(x=>x.rating==='Buy').length,3);
assert.equal(classified.filter(x=>x.rating==='Watch').length,6);
for(const mutate of [r=>r.price=104,r=>r.recommendation.expertDecision.metrics.quoteFreshnessPass=false,r=>r.eventRisk.blockNewCapital=true,r=>r.entryTiming.averageDollarVolume20=100000000,r=>r.recommendation.expertDecision.strongBuyPass=true]){const rows=structuredClone(live);mutate(rows[0]);compare(rows);}
for(const field of ['sector','issuer']){const snap=structuredClone(snapshot),old=structuredClone(oldSnapshot);snap.candidates[1][field]=snap.candidates[0][field];old.candidates[1][field]=old.candidates[0][field];const result=compare(live,snap,old);assert.equal(result[1].rating,'Watch');assert.equal(result[3].rating,'Buy');}
assert.ok(classify({snapshot,rows:live,current:false}).every(x=>x.rating==='Watch'));
assert.ok(classify({snapshot,rows:[],current:true}).every(x=>x.rating==='Watch'),'No quote evidence means no invented Buy');
const decision={current:true,positions:[{symbol:'S0',entryContext:{stage:'full'}},{symbol:'S1',entryContext:{stage:'half'}}],opportunities:classified};
const orders=[{symbol:'S1',shares:50,estimatedPrice:100}],plan={entryReviews:[{symbol:'S2',reason:'position-limit'}]};
const view=present({decision,buys:orders,plan,ready:true});
assert.equal(view.tiles.length,3);assert.equal(view.watch.length,6);
assert.equal(view.tiles.find(x=>x.symbol==='S0').accountAction,'Hold');
assert.equal(view.tiles.find(x=>x.symbol==='S0').order,null);
assert.equal(view.tiles.find(x=>x.symbol==='S1').order.shares,50);
assert.equal(view.tiles.find(x=>x.symbol==='S1').accountAction,'Add');
assert.equal(view.tiles.find(x=>x.symbol==='S2').accountAction,'No purchase');
assert.ok(present({decision,buys:orders,plan,ready:false}).tiles.every(x=>!x.order));
assert.equal(present({decision:{...decision,current:false},buys:orders,plan,ready:true}).tiles.length,0);
assert.ok(view.watch.every(x=>x.screenReview.why.includes('below the three selected')));
const component=fs.readFileSync('components/C1AccountOpportunities.js','utf8');
assert.ok(component.includes('classifyC1StockScreen({snapshot:decision.stockScreen,rows:screenRows'));
assert.ok(component.includes(':portfolioOnly&&buys.length?'),'Account orders cannot become extra stock rating tiles');
console.log('PASS: original-deployment oracle matches 3 Buy/6 Watch, quote/event/liquidity/gap gates, sector/issuer substitutions, expert Strong Buy; holdings affect only account actions, stale checks hide quantities, and account orders cannot promote Watch ratings.');

const top5=fs.readFileSync('pages/api/top5.js','utf8');
const compactSource=top5.slice(top5.indexOf('function compactRowsForClient('),top5.indexOf('\n}',top5.indexOf('function compactRowsForClient('))+2);
const compact=new Function('normalizeSymbol',compactSource+';return compactRowsForClient;')(s=>String(s||'').toUpperCase());
const crowded=Array.from({length:100},(_,i)=>({symbol:'X'+i,finalDecision:{action:'Watch',relativeCapitalScore:100-i}}));
assert.ok(!compact(crowded).some(x=>x.symbol==='X99'));
assert.ok(compact(crowded,80,'','X99,X98').some(x=>x.symbol==='X99'),'Every requested screen candidate survives compact row selection');
assert.ok(compact(crowded,80,'','X99,X98').some(x=>x.symbol==='X98'));
assert.equal(compact(crowded,80,'','X99,X98').length,80);
console.log('PASS: compact responses retain required screen candidates without extra provider calls or downloading the full universe.');
