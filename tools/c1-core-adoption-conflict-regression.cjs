// Demonstrates the current accounting conflict. This does not implement or
// authorize a conversion, and cannot access a live provider or account.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 const api=createWorkflowApi('capacity'),f=api.fixture;
 f.setCash(5000);
 const core={symbol:'MRNA',role:'Core',shares:20,avgCost:72.34,openedAt:'2026-09-01'};
 const portfolio=[...clone(f.portfolio),clone(core)],before=clone(f.account),beforePortfolio=clone(portfolio);
 const converted=portfolio.map(p=>p.symbol==='MRNA'?{...p,role:'Swing'}:p);
 const signature=f.loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature(converted);
 assert.throws(()=>f.service.adoptC1Account({portfolio:converted,capitalRecord:{version:2,highWater:22000,portfolioSignature:signature,reconciliationRequired:false},book:f.book,now:new Date('2026-10-14T22:00:00Z')}),/Account adoption exceeds the frozen sleeve position count/);
 const response=await api.request('POST',{operation:'adopt',portfolio:converted,prospectiveLegacyAdoptionConfirmed:true,expectedRevision:f.account.revision});
 assert.equal(response.status,409);assert.equal(response.body.error,'The existing C1 account cannot be reset.');
 assert.throws(()=>f.loader.load('lib/c1PositionContext.js').recordC1PositionContext({account:f.account,expectedRevision:f.account.revision,context:{contract:'c1-position-stage-v1',positions:[{symbol:'MRNA',stage:'full',shares:20,avgCost:72.34}]},now:f.now}),/does not match adopted holdings/);
 assert.deepEqual(clone(f.account),before);assert.deepEqual(portfolio,beforePortfolio);assert.equal(f.writes,0);
 assert.equal(f.account.brokerageCash.balance,5000);
 assert(!Object.values(f.account.adoption.seeds).some(s=>s.positions.some(p=>p.symbol==='MRNA')));
 const evidence={status:'BLOCKED — conversion not implemented',scope:'Synthetic existing-account guard and immutable facts only',coreBefore:core,coreAfter:portfolio.at(-1),brokerageCashBefore:5000,brokerageCashAfter:f.account.brokerageCash.balance,writes:f.writes,adoptionAndFillsUnchanged:true,apiStatus:response.status,apiError:response.body.error,lifecycleClaim:'None for Core MRNA: it remains outside C1 management.'};
 fs.mkdirSync('work/mrna-hold-evidence',{recursive:true});fs.writeFileSync('work/mrna-hold-evidence/adoption-conflict.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('PASS: existing-account adoption is blocked without changing shares, basis, purchase date, cash, adoption or fills. No lifecycle claim made.');
})().catch(e=>{console.error(e);process.exitCode=1;});
