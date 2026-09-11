const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {buildC1DecisionSnapshot,c1SymbolModelView}=loader.load('lib/c1DecisionSnapshot.js');
const {compareC1Holdings}=loader.load('lib/c1HoldingsComparison.js');
const {advanceC1ForwardModel}=loader.load('lib/c1ForwardModel.js');
const symbols=['AAA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III','JJJ'];
const session={date:'2026-09-10',decisionAt:'2026-09-10T20:00:00Z',universeSymbols:null,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,close:100,high:101,low:99,volume:1e7})),
 signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%5,price:100,researchFactors:{momentumPercentile:100-i,volatility60Pct:20},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:5e8}}))};
const now=new Date('2026-09-10T22:00:00Z'),record=advanceC1ForwardModel(null,[session],now,{completedCloseQueue:true});
assert.equal(record.firstDecisionSession,'2026-09-11');assert.equal(record.ledger.fills.length,0);
assert.equal(record.summary.observedForwardSessions,0);assert.ok(record.summary.modelQueue.length>=9,'Completed baseline prepares next opening without inventing historical fills');
const inputArchive={status:'captured',sessionDate:session.date,firstHash:'a'.repeat(64),observedHash:'a'.repeat(64),sourcePointInTime:false};
const request={model:record.summary,inputArchive,sourceSessionDate:session.date,now};
const decision=buildC1DecisionSnapshot(request);
const next={...session,date:'2026-09-11',decisionAt:'2026-09-11T20:00:00Z'};
const opening=loader.load('lib/c1OpeningPlan.js').planC1Opening({record,date:next.date,observedAt:'2026-09-11T14:00:00Z',opens:next.prices.map(p=>({...p,adjusted:true}))});
assert.equal(opening.status,'opening-projection-only',opening.reason);assert.ok(opening.orders.length>0);
const advanced=advanceC1ForwardModel(record,[next],new Date('2026-09-11T22:00:00Z'));
assert.equal(JSON.stringify(opening.modelFills),JSON.stringify(advanced.ledger.fills));
assert.equal(advanced.summary.observedForwardSessions,1);
assert.equal(record.ledger.fills.length,0,'The initialization is not retroactively changed by tomorrow’s execution');
assert.equal(decision.status,'diagnostic-only');assert.equal(decision.executable,false);assert.equal(decision.orders.length,0);
assert.ok(decision.symbols.length>3,'Do not collapse separate sleeve queues to three names');
const portfolio=compareC1Holdings([{symbol:'AAA',shares:3,role:'Swing'}],record.summary,decision);
assert.equal(JSON.stringify(portfolio.positions[0].modelDecision),JSON.stringify(c1SymbolModelView(decision,'AAA')),'Both page interpretations must use the identical model result');
assert.equal(portfolio.decisionId,decision.decisionId);
assert.equal(buildC1DecisionSnapshot(request).decisionId,decision.decisionId,'Refresh alone cannot change decision identity');
for(const patch of [{model:{...record.summary,status:'stale'}},{inputArchive:{...inputArchive,status:'revision-quarantined'}},{now:new Date('2026-09-11T22:00:00Z')}]){
 const blocked=buildC1DecisionSnapshot({...request,...patch});assert.equal(blocked.status,'unavailable');assert.equal(blocked.symbols.length,0);assert.equal(blocked.orders.length,0);
}
assert.equal(buildC1DecisionSnapshot({...request,model:{...record.summary,activationAuthorized:true,eligibleForLiveCapital:true}}).activationAuthorized,false);
assert.ok(decision.issues.some(i=>i.code==='PRODUCTION_UNIVERSE'),'PIT historical results cannot certify the current broad cohort');
const midnight=advanceC1ForwardModel(null,[session],new Date('2026-09-11T14:00:00Z'),{completedCloseQueue:true});
assert.equal(midnight.simulationStartSession,undefined,'A missed opening cannot be backfilled by diagnostic initialization');
const page=fs.readFileSync('pages/index.js','utf8'),api=fs.readFileSync('pages/api/top5.js','utf8');
assert.ok(page.includes('["opportunities","portfolio"].includes(tab)&&<C1ModelStatus'));
assert.ok(api.includes('decisionSnapshot: broadSnapshot.productionPolicySnapshot?.decisionSnapshot'));
console.log('PASS: one C1 model snapshot, baseline queue without fills, same portfolio interpretation, all names retained, stale/revised inputs blocked and no metadata-based promotion');
