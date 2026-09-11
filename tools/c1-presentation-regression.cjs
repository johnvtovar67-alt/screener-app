const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {c1Presentation:present,c1DisplayDecision:decision}=createResearchModuleLoader(process.cwd()).load('lib/c1Presentation.js');
const buy={action:'Buy',size:'Full',capitalConfirmed:true};
const row={productionPolicy:{id:'c1-active-swing-ensemble-20260904',status:'suspended',selected:true,targetWeightPct:33},finalDecision:buy};
assert.equal(present(row).targetWeightPct,0);assert.equal(decision(row,buy).action,'Watch');assert.equal(decision(row,buy).capitalConfirmed,false);
const ready={...row,productionPolicy:{...row.productionPolicy,status:'ready',independentlyValidated:true,activationAuthorized:true}};
assert.equal(present(ready).authorized,true);
for(const patch of [{clientSnapshotFallback:true},{dataFeedSnapshotStale:true},{productionPolicy:{...ready.productionPolicy,activationAuthorized:false}},{productionPolicy:{...ready.productionPolicy,targetWeightPct:34}}]){
 const r={...ready,...patch};assert.equal(present(r).authorized,false);assert.equal(present(r).targetWeightPct,0);assert.equal(decision(r,buy).size,'None');
}
const pilot={productionPolicy:{id:row.productionPolicy.id,status:'limited-pilot',pilot:true,pilotRank:1,targetWeightPct:1},finalDecision:{...buy,source:'independent-limited-pilot'}};
assert.equal(present(pilot).pilot,true);assert.equal(present(pilot).targetWeightPct,1);
for(const patch of [{targetWeightPct:33},{pilotRank:4},{pilotRank:null}])assert.equal(present({...pilot,productionPolicy:{...pilot.productionPolicy,...patch}}).authorized,false);
assert.equal(present({...pilot,finalDecision:buy}).authorized,false);
assert.equal(decision({},buy),buy,'Non-C1 decisions unchanged');
assert.equal(decision(row,{action:'Avoid'}).action,'Avoid');
console.log('PASS: shared C1 presentation — stale selection cannot authorize entry or sizing; bounded pilot preserved');
