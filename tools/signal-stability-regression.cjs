const fs=require('fs');
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

const top5=fs.readFileSync('pages/api/top5.js','utf8');
const page=fs.readFileSync('pages/index.js','utf8');
const helper=fs.readFileSync('lib/strongBuyPersistence.js','utf8');
const decision=fs.readFileSync('lib/opportunityDecision.js','utf8');
const ledger=fs.readFileSync('pages/api/performance.js','utf8');
const ledgerEngine=fs.readFileSync('lib/performanceLedger.js','utf8');

assert(top5.includes('seedDurableStrongBuyMemory'),'Broad screen is not seeding durable Strong Buy state');
const durable=fs.readFileSync('lib/strongBuyPersistence.js','utf8');
assert(!durable.includes('if(!hasToken())'),'Durable signal memory must support Vercel OIDC instead of requiring only a legacy Blob token');
assert(top5.indexOf('await seedDurableStrongBuyMemory();')<top5.indexOf('recentStrongBuySymbols()')&&top5.indexOf('recentStrongBuySymbols()')<top5.indexOf('rows = finalizeBroadOpportunityDecisions(rows);'),'Strong Buy state must be restored before timing continuity and final decisions');
assert(helper.includes("screener-performance-ledger.json")&&helper.includes("await list(")&&helper.includes("await get("),'Durable state must read the persistent performance ledger');
assert(helper.includes("get(blob.url,{access:'private',useCache:false})"),'Private Blob reads must include the access mode required by the production SDK');
assert(helper.includes("6.5*60*60*1000")||helper.includes("6.5*60*60*1000"),'Strong Buy persistence window changed unexpectedly');
assert(helper.includes("BUY_VISIBILITY_WINDOW_MS=36*60*60*1000")&&helper.includes("['Strong Buy','Buy'].includes(r?.action)"),'Recent Buy history must persist long enough to explain a downgrade');
assert(decision.includes("m.forwardAsymmetryPass===false")&&decision.includes("m.lateTrend===true")&&decision.includes("m.severeLateTrend===true"),'Hard forward-entry invalidations must override Strong Buy retention');
assert(decision.includes("if(!t?.available||!t.pass)return false"),'Continuity must not create a Buy without a verified historical-timing pass');
assert(decision.includes("if(!t?.available||!t.pass||!t.strongPass)return false"),'Strong Buy hysteresis must not override the full-size historical-timing gate');
assert(!page.includes("Promise.all([fetch(`/api/top5?theme=opportunities`"),'Portfolio refresh still races signal recording against persistence history');
assert(page.includes('const d=await fetchScreen(t,verificationPass)')&&page.includes("const r=await fetch('/api/performance'"),'Every screen refresh must read history after the screen records current signals');
assert(/performanceObservationRecorded\s*=\s*await recordPerformance\s*\(/.test(top5)&&!top5.includes('void recordPerformance('),'Broad screen must finish its bounded ledger update before portfolio sizing reads persistence');
assert(ledger.includes('applyPerformanceObservation')&&ledgerEngine.includes("recordType:'state'")&&ledgerEngine.includes('signalState:true')&&ledgerEngine.includes("stateAction=systemPaused?'Paused':action"),'Ledger must record actionable, downgrade, and data-pause transitions distinctly');
assert(helper.includes('interruptedAt')&&decision.includes("!prior?.interruptedAt"),'A recorded downgrade must also break Strong Buy hysteresis continuity');
assert(page.includes('Recent Signal Changes')&&page.includes('recentDowngrades'),'Recent Buy-to-Avoid changes must remain visible without forcing a Watch or Buy');
assert(page.includes('priorActionableSignal')&&page.includes('downgraded on the latest refresh.'),'Recent Buy or Strong-Buy changes must be explained and prioritized on On Deck');

let src=decision.replace(/export function /g,'function ');src+='\nmodule.exports={finalizeBroadOpportunityDecisions};';const sandbox={module:{exports:{}},exports:{},console,Date,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp};sandbox.__screenerStrongBuyMemoryV1=new Map([['ALL',{action:'Buy',earnedAt:Date.now()}]]);require('vm').createContext(sandbox);require('vm').runInContext(src,sandbox,{filename:'lib/opportunityDecision.js'});const changed=sandbox.module.exports.finalizeBroadOpportunityDecisions([{symbol:'ALL',action:'Avoid',price:100,recommendation:{label:'Avoid',decisionWhy:'The setup deteriorated rapidly.'}}])[0];
assert(changed.finalDecision.action==='Avoid','Recent Buy continuity must not manufacture a Watch or Buy');
assert(changed.signalChange?.from==='Buy'&&changed.signalChange?.to==='Avoid','Recent Buy downgrade must retain an explicit audit trail');
// Reset the simulated durable memory to a prior Strong Buy before checking its hard-gated downgrade.
sandbox.__screenerStrongBuyMemoryV1=new Map([['ALL',{action:'Strong Buy',earnedAt:Date.now()}]]);const strongChanged=sandbox.module.exports.finalizeBroadOpportunityDecisions([{symbol:'ALL',action:'Avoid',price:100,recommendation:{label:'Avoid',decisionWhy:'A hard entry gate failed.'}}])[0];
assert(strongChanged.finalDecision.action==='Avoid','Recent Strong Buy continuity must not override a hard downgrade');
assert(strongChanged.signalChange?.from==='Strong Buy'&&strongChanged.signalChange?.to==='Avoid','Recent Strong Buy downgrade must retain an explicit audit trail');

console.log('SIGNAL STABILITY PASS: durable Strong Buy memory, hard invalidations, and refresh ordering verified.');
