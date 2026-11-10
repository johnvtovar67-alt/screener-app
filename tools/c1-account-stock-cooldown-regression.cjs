const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader();
const {buildC1AccountPolicy,c1AccountPolicyApplies,c1AccountPolicySourceApplies,retargetC1AccountPolicy}=loader.load('lib/c1AccountPolicy.js');
const {reconcileC1AccountInvestmentPeriods,c1StockCooldownExpiry}=loader.load('lib/c1AccountStockCooldown.js');
const sleeves=['base','cooldown15','sector40'];
const clone=x=>JSON.parse(JSON.stringify(x));
const plain=x=>JSON.parse(JSON.stringify(x));
function account(){return {contract:'c1-private-account-v1',revision:9,adoption:{sourceSessionDate:'2026-11-02',seeds:Object.fromEntries(sleeves.map(s=>[s,{sleeve:s,cash:10000,actualDollarsPerModelDollar:1,positions:[]}]))},records:[]};}
let index=0;
function record(a,date,rows,risk=null){
 const orders=[],fills=[];
 for(const [sleeve,symbol,side,shares,price,fee=0] of rows){
  const id='order-'+(++index);orders.push({id,sleeve,symbol,side,shares,reason:'owner-discretionary-exit'});
  fills.push({id:'fill-'+index,orderId:id,symbol,side,shares,price,fee,executedAt:date+'T15:'+String(10+fills.length).padStart(2,'0')+':00.000Z'});
 }
 const r={date,complete:true,fills,executionEvidence:{date,orders,...(risk?{riskBySleeve:risk}:{})}};
 a.records.push(r);return r;
}
const options={date:'2026-11-11',now:new Date('2026-11-11T16:00:00.000Z')};
const a=account();
record(a,'2026-11-02',[['base','A','buy',2,10,1],['cooldown15','A','buy',3,10,1],['sector40','B','buy',1,20]]);
record(a,'2026-11-05',[['base','A','sell',1,20]],Object.fromEntries(sleeves.map(s=>[s,{highWater:10000,paused:false}])));
record(a,'2026-11-06',[['base','A','sell',1,5],['cooldown15','A','sell',3,8]],Object.fromEntries(sleeves.map(s=>[s,{highWater:10000,paused:true}])));
const original=JSON.stringify(a),policy=buildC1AccountPolicy(a,options);
assert.equal(policy.complete,true);assert.equal(policy.active,true);assert.deepEqual(plain(policy.blockedSymbols),['A']);
const loss=policy.stockCooldowns[0];
assert.equal(loss.netRealizedPnl,-3);assert.equal(loss.durationSessions,15);assert.equal(loss.triggerDate,'2026-11-06');
assert.equal(loss.expiresAfterSession,'2026-11-30');assert.equal(loss.resumesOn,'2026-12-01');assert.equal(loss.elapsedSessions,3);
assert.deepEqual(plain(loss.participatingAllocations),['base','cooldown15']);
assert.equal(policy.openInvestments[0].symbol,'B');assert.equal(policy.openInvestments[0].shares,1);
assert.equal(policy.transition[0].originalTriggerDate,'2026-11-06');assert.equal(policy.transition[0].clockRestarted,false);
assert.equal(JSON.stringify(a),original,'policy derivation preserves every actual account field');
assert.match(policy.identity,/^c1-account-policy-v2:[0-9a-f]{32}$/);
assert.equal(policy.identity.includes(loss.completedAt),false,'publication identity must not embed private transaction facts');
assert.equal(retargetC1AccountPolicy(policy,'2026-11-30').blockedSymbols.includes('A'),true);
assert.equal(retargetC1AccountPolicy(policy,'2026-12-01').blockedSymbols.includes('A'),false);
assert.equal(c1AccountPolicyApplies('2026-11-10'),false);assert.equal(c1AccountPolicySourceApplies('2026-11-10'),true);
assert.equal(c1AccountPolicyApplies('2026-11-31'),false);assert.equal(c1AccountPolicyApplies('2026-11-26'),false);
assert.deepEqual(plain(c1StockCooldownExpiry('2026-11-06',10)),{expiresAfterSession:'2026-11-20',resumesOn:'2026-11-23'});

// An allocation's exit does not complete account ownership while another
// allocation remains invested, and earlier participants keep their duration.
const ongoing=account();record(ongoing,'2026-11-02',[['cooldown15','A','buy',1,100],['base','A','buy',1,100]]);
record(ongoing,'2026-11-05',[['cooldown15','A','sell',1,90]]);
assert.equal(reconcileC1AccountInvestmentPeriods(ongoing,options).periods.length,0);
record(ongoing,'2026-11-06',[['base','A','sell',1,90]]);
assert.equal(buildC1AccountPolicy(ongoing,options).stockCooldowns[0].durationSessions,15);

const profitable=account();record(profitable,'2026-11-02',[['base','A','buy',1,100],['cooldown15','A','buy',1,100]]);
record(profitable,'2026-11-06',[['base','A','sell',1,90],['cooldown15','A','sell',1,120]]);
const good=buildC1AccountPolicy(profitable,options);assert.equal(good.periods[0].netRealizedPnl,10);assert.equal(good.stockCooldowns.length,0);
const partial=account();record(partial,'2026-11-02',[['base','A','buy',2,100]]);record(partial,'2026-11-05',[['base','A','sell',1,150]]);record(partial,'2026-11-06',[['base','A','sell',1,75]]);
assert.equal(buildC1AccountPolicy(partial,options).stockCooldowns.length,0);
const fees=account();record(fees,'2026-11-02',[['base','A','buy',1,100]]);record(fees,'2026-11-06',[['base','A','sell',1,100,.01]]);
assert.ok(buildC1AccountPolicy(fees,options).stockCooldowns[0].netRealizedPnl<0);

// Two zero-to-zero ownership periods in one session must not be netted into
// one day-level symbol return: the first completed loss retains its clock.
const sameDay=account();record(sameDay,'2026-11-06',[['base','A','buy',1,10],['base','A','sell',1,8],['base','A','buy',1,8],['base','A','sell',1,12]]);
const cycles=buildC1AccountPolicy(sameDay,options);assert.equal(cycles.periods.length,2);assert.equal(cycles.periods[0].netRealizedPnl,-2);assert.equal(cycles.periods[1].netRealizedPnl,4);assert.equal(cycles.blockedSymbols.includes('A'),true);

// Already held investments are never sold by this permission derivation.
const held=clone(fees);record(held,'2026-11-10',[['sector40','A','buy',1,90]]);
const heldPolicy=buildC1AccountPolicy(held,options);assert.equal(heldPolicy.openInvestments[0].shares,1);assert.equal(heldPolicy.blockedSymbols.includes('A'),true);

// Pre-adoption partial realizations cannot be invented from remaining basis.
// Only that stock is uncertain, and no fabricated loss is reported.
const adopted=account();adopted.adoption.seeds.base.positions=[{symbol:'A',shares:1,entryPrice:100,openedAt:'2026-10-01'}];
record(adopted,'2026-11-06',[['base','A','sell',1,80]]);
const uncertain=buildC1AccountPolicy(adopted,options);assert.equal(uncertain.complete,true);assert.equal(uncertain.periods[0].loss,null);assert.equal(uncertain.periods[0].netRealizedPnl,null);
assert.equal(uncertain.stockCooldowns.length,0);assert.deepEqual(plain(uncertain.blockedSymbols),['A']);assert.equal(uncertain.accountingRestrictions[0].lossClassification,'unknown');
assert.equal(retargetC1AccountPolicy(uncertain,'2026-11-23').blockedSymbols.length,0,'uncertainty never restarts or extends the maximum original waiting clock');

// A validated noncash receipt contributes original acquisition basis rather
// than the higher adoption/performance mark. Price history is not trade history.
const noncash=account(),date='2026-11-02';
const history=loader.load('lib/c1AccountSeed.js').c1HistoricalPriceEvidence({symbol:'MRNA',entryPrice:10,openedAt:date},[{date,prices:[{symbol:'MRNA',date,open:20,high:21,low:19,close:20,adjusted:true}]}],date);
const proposal={contract:'c1-mrna-in-kind-adoption-v1',effectiveSessionDate:date,original:{symbol:'MRNA',role:'Core',shares:4,avgCost:10,openedAt:date},
 allocations:{base:1,cooldown15:2,sector40:1},mark:20,value:80,cashChange:0,history,historicalPriceFingerprint:JSON.stringify([[date,20,21,19,20,true]])};
noncash.adoption.nonCashHoldings=[{...proposal,id:'a'.repeat(64),reviewId:'a'.repeat(64),reviewPayload:JSON.stringify(proposal),recordedAt:date+'T22:00:00.000Z'}];
record(noncash,'2026-11-06',[['base','MRNA','sell',1,15],['cooldown15','MRNA','sell',2,15],['sector40','MRNA','sell',1,15]]);
const noncashPolicy=buildC1AccountPolicy(noncash,options);assert.equal(noncashPolicy.complete,true);assert.equal(noncashPolicy.periods[0].buyCost,40);
assert.equal(noncashPolicy.periods[0].recordedPeriodNetRealizedPnl,20);assert.equal(noncashPolicy.periods[0].loss,null);

const duplicate=clone(fees),last=duplicate.records.at(-1);duplicate.intradayActivity={date:last.date,plan:last.executionEvidence,fills:clone(last.fills)};
assert.equal(buildC1AccountPolicy(duplicate,options).periods.length,1);
duplicate.intradayActivity.fills[0].fee=.02;assert.equal(buildC1AccountPolicy(duplicate,options).complete,false);
const unmatched=clone(fees);unmatched.records.at(-1).fills[0].orderId='unmatched';assert.equal(buildC1AccountPolicy(unmatched,options).complete,false);
console.log('Account-wide completed-investment loss cooldown, partials, fees, exact exchange expiry, transition, uncertainty and immutable economics: PASS');
