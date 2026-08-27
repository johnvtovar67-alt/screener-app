const fs=require('fs');
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

const top5=fs.readFileSync('pages/api/top5.js','utf8');
const page=fs.readFileSync('pages/index.js','utf8');
const helper=fs.readFileSync('lib/strongBuyPersistence.js','utf8');
const decision=fs.readFileSync('lib/opportunityDecision.js','utf8');

assert(top5.includes('seedDurableStrongBuyMemory'),'Broad screen is not seeding durable Strong Buy state');
assert(top5.includes('await seedDurableStrongBuyMemory();rows=finalizeBroadOpportunityDecisions(rows);'),'Strong Buy state must be restored before final decisions');
assert(helper.includes("BLOB_READ_WRITE_TOKEN")&&helper.includes("screener-performance-ledger.json"),'Durable state must use the persistent performance ledger');
assert(helper.includes("6.5*60*60*1000")||helper.includes("6.5*60*60*1000"),'Strong Buy persistence window changed unexpectedly');
assert(decision.includes("m.forwardAsymmetryPass===false")&&decision.includes("m.lateTrend===true")&&decision.includes("m.severeLateTrend===true"),'Hard forward-entry invalidations must override Strong Buy retention');
assert(decision.includes("if(!t?.available||!t.pass)return false"),'Continuity must not create a Buy without a verified historical-timing pass');
assert(decision.includes("if(t&&!t.strongPass)return false"),'Strong Buy hysteresis must not override the full-size historical-timing gate');
assert(!page.includes("Promise.all([fetch(`/api/top5?theme=opportunities`"),'Portfolio refresh still races signal recording against persistence history');
assert(page.includes("const sr=await fetch(`/api/top5?theme=opportunities`")&&page.includes("const pr=await fetch('/api/performance'"),'Portfolio refresh must read history after the screen records current signals');

console.log('SIGNAL STABILITY PASS: durable Strong Buy memory, hard invalidations, and refresh ordering verified.');
