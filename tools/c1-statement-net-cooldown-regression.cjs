// Fictional completed holdings and owner statements only. Exercise the real
// statement review -> trusted context -> account policy/action paths without
// market/provider input, storage, broker execution or source-fixture edits.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {reviewC1BrokerStatement:review}=loader.load('lib/c1BrokerStatementReview.js');
const {createC1CashAccounting:create}=loader.load('lib/c1CashAccounting.js');
const {buildC1AccountPolicy:policy}=loader.load('lib/c1AccountPolicy.js');
const {resolveC1AccountActions:actions}=loader.load('lib/c1AccountActions.js');
const {reconcileC1ActualAccountFills:reconcile}=loader.load('lib/c1AccountLedger.js');
const {c1StatementTradeCash:tradeCash}=loader.load('lib/c1StatementTradeCash.js');
const clone=value=>JSON.parse(JSON.stringify(value)),same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const ids=['base','cooldown15','sector40'],source='2026-12-31',buyDate='2027-01-04',saleDate='2027-01-08',date='2027-01-11',now=new Date(date+'T17:00:00Z');
const header='date\taction\tsymbol\tquantity\tprice\tfee\tamount';
function fixture({salePrice=100.02,buyFee=.04,saleFee=.02,statementBuy=-400.06,statementSell=400.03}={}){
 const opening=Object.fromEntries(ids.map(id=>[id,{cash:{base:2500,cooldown15:5000,sector40:2500}[id],positions:{}}]));
 const orders=(day,side)=>['base','cooldown15'].map(sleeve=>({id:`fictional:${day}:${sleeve}:${side}`,date:day,sleeve,symbol:'ZZZ',side,shares:2,
  estimatedPrice:side==='buy'?100:salePrice,reason:side==='buy'?'Buy':'recent-momentum-deterioration'}));
 const stops=day=>['base','cooldown15'].map(sleeve=>({id:`fictional:${day}:${sleeve}:stop`,date:day,sleeve,symbol:'ZZZ',side:'sell',shares:2,
  estimatedPrice:90,reason:'initial-stop',condition:'stop-triggered'}));
 const fills=(day,side,fee)=>orders(day,side).map(order=>({id:`fictional-fill:${day}:${order.sleeve}:${side}`,orderId:order.id,symbol:'ZZZ',side,shares:2,
  price:side==='buy'?100:salePrice,fee:fee/2,executedAt:day+'T15:00:00Z'}));
 const buyPlan={contract:'c1-actual-account-opening-plan-v1',sourceSessionDate:source,date:buyDate,openingBooks:clone(opening),
  orders:[...orders(buyDate,'buy'),...stops(buyDate)],riskBySleeve:{base:{highWater:2500,paused:false},cooldown15:{highWater:5000,paused:false}}};
 const buyFills=fills(buyDate,'buy',buyFee),owned=reconcile({plan:buyPlan,fills:buyFills,observedAt:now.toISOString()}).books;
 const sellPlan={contract:'c1-actual-account-opening-plan-v1',sourceSessionDate:'2027-01-07',date:saleDate,openingBooks:clone(owned),
  orders:[...orders(saleDate,'sell'),...stops(saleDate)],riskBySleeve:clone(buyPlan.riskBySleeve)};
 const saleFills=fills(saleDate,'sell',saleFee);
 const account={contract:'c1-private-account-v1',revision:3,adoption:{sourceSessionDate:source,actualCash:10000,
  seeds:Object.fromEntries(ids.map(id=>[id,{sleeve:id,actualDollarsPerModelDollar:1,positions:[]}]))},
  records:[{date:buyDate,complete:true,executionEvidence:buyPlan,fills:buyFills},
   ...['2027-01-05','2027-01-06','2027-01-07'].map(day=>({date:day,complete:true,fills:[]})),
   {date:saleDate,complete:true,executionEvidence:sellPlan,fills:saleFills}],
  brokerageCash:{balance:Math.round((10000+statementBuy+statementSell)*100)/100,observedAt:date+'T16:00:00Z',source:'manual-broker-balance'}};
 const statementText=header+`\n${buyDate}\tBuy\tZZZ\t4\t100\t${buyFee}\t${statementBuy}\n${saleDate}\tSell\tZZZ\t4\t${salePrice}\t${saleFee}\t${statementSell}\n`;
 return {account,statementText,portfolio:[{symbol:'CORC',role:'Core',shares:100,avgCost:1}],now};
}
const bound=input=>{const inspected=review(input);return {review:inspected,context:create({review:inspected})};};
const current=(account,cashAccounting,at=date,clock=now)=>policy(account,{date:at,now:clock,cashAccounting});
let count=0;
function check(name,run){run();count++;console.log('PASS '+name);}

check('reviewed signed trade nets turn a raw small profit into the correct completed loss after fees',()=>{
 const input=fixture(),snapshot=clone(input),raw=current(input.account),{review:inspected,context}=bound(input),trusted=current(input.account,context);
 assert.equal(raw.complete,true);near(raw.periods[0].netRealizedPnl,.02);assert.equal(raw.blockedSymbols.length,0);
 assert.equal(trusted.complete,true);assert.equal(trusted.periods[0].completeHoldingPeriodVerified,true);
 near(trusted.periods[0].buyCost,400.06);near(trusted.periods[0].netProceeds,400.03);near(trusted.periods[0].netRealizedPnl,-.03);
 assert.equal(trusted.periods[0].loss,true);same(trusted.blockedSymbols,['ZZZ']);
 near(inspected.matchedTrades.find(group=>group.side==='buy').cashAdjustment,-.02);near(inspected.matchedTrades.find(group=>group.side==='sell').cashAdjustment,-.03);
 same({...input,now:input.now.toISOString()},snapshot,'Policy and context creation cannot rewrite raw fills, original bases, stops, dates or plan risk fields');
});

check('the same completed investment blocks all allocations with its original longest exchange-session clock',()=>{
 const input=fixture(),{context}=bound(input),p=current(input.account,context),cooldown=p.stockCooldowns[0];
 same(cooldown.participatingAllocations,['base','cooldown15']);assert.equal(cooldown.durationSessions,15);assert.equal(cooldown.triggerDate,saleDate);
 assert.equal(cooldown.expiresAfterSession,'2027-02-01');assert.equal(cooldown.resumesOn,'2027-02-02','The Martin Luther King holiday is not a waiting session');
 const orders=[...ids.map(sleeve=>({id:'new:'+sleeve,sleeve,symbol:'ZZZ',side:'buy',shares:1,estimatedPrice:100})),
  {id:'unrelated',sleeve:'sector40',symbol:'YYY',side:'buy',shares:1,estimatedPrice:100}];
 const resolved=actions({orders,accountPolicy:p,decisionId:p.decisionId});
 same(resolved.orders.filter(order=>order.side==='buy').map(order=>order.symbol),['YYY']);assert.equal(resolved.blockedOrders.length,3);
 assert(resolved.blockedOrders.every(order=>order.blockReason==='account-stock-cooldown'));
 assert(current(input.account,context,'2027-02-01',new Date('2027-02-01T17:00:00Z')).blockedSymbols.includes('ZZZ'));
 assert(!current(input.account,context,'2027-02-02',new Date('2027-02-02T17:00:00Z')).blockedSymbols.includes('ZZZ'));
});

check('reviewed positive settlement corrections remove a raw loss without changing broker facts',()=>{
 const input=fixture({salePrice:100,statementBuy:-400.03,statementSell:400.04}),snapshot=clone(input.account),raw=current(input.account),{context}=bound(input);
 near(raw.periods[0].netRealizedPnl,-.06);assert(raw.blockedSymbols.includes('ZZZ'));
 const trusted=current(input.account,context);near(trusted.periods[0].netRealizedPnl,.01);assert.equal(trusted.periods[0].loss,false);assert.equal(trusted.stockCooldowns.length,0);
 same(input.account,snapshot,'A corrected net return is a derived policy fact, not an edited execution price, fee or basis');
});

check('fees alone create the correct net-loss cooldown when printed execution prices break even',()=>{
 const input=fixture({salePrice:100,buyFee:0,saleFee:0,statementBuy:-400.04,statementSell:399.98});
 input.statementText=input.statementText.replace('\tBuy\tZZZ\t4\t100\t0\t','\tBuy\tZZZ\t4\t100\t.04\t')
  .replace('\tSell\tZZZ\t4\t100\t0\t','\tSell\tZZZ\t4\t100\t.02\t');
 const raw=current(input.account);near(raw.periods[0].netRealizedPnl,0);assert.equal(raw.blockedSymbols.length,0);
 const {context}=bound(input),trusted=current(input.account,context);near(trusted.periods[0].netRealizedPnl,-.06);assert(trusted.blockedSymbols.includes('ZZZ'));
 assert(input.account.records.flatMap(record=>record.fills).every(fill=>fill.fee===0),'The original entered fees remain preserved');
});

check('external Core capital and account cash fees do not fabricate a stock loss or ownership period',()=>{
 const input=fixture({salePrice:100.02,statementBuy:-400.04,statementSell:400.06}),snapshot=clone(input.account);
 input.statementText+=`${saleDate}\tBuy\tCORC\t50\t1\t0\t-50.00\n${saleDate}\tADR Mgmt Fee\tZZZ\t0\t0\t0\t-.50\n`;
 input.account.brokerageCash.balance=9949.52;
 const {review:inspected,context}=bound(input),trusted=current(input.account,context);
 assert.equal(inspected.externalCapitalFlows.length,1);assert.equal(inspected.pnlCashEvents.length,1);
 near(trusted.periods[0].netRealizedPnl,.02);assert.equal(trusted.blockedSymbols.length,0);assert.equal(trusted.periods.length,1);
 assert(!trusted.periods.some(period=>period.symbol==='CORC'));assert.equal(trusted.openInvestments.length,0);
 same(input.account.records,snapshot.records);same(input.account.adoption,snapshot.adoption);
});

check('serialized or forged context fields cannot activate statement-adjusted policy economics',()=>{
 const lossInput=fixture(),loss=bound(lossInput),serialized=clone(loss.context);
 assert.equal(current(lossInput.account,loss.context).periods[0].loss,true);
 near(current(lossInput.account,serialized).periods[0].netRealizedPnl,.02);
 assert.equal(current(lossInput.account,{...serialized,ownerConfirmed:true,statementCash:{ZZZ:-1000}}).blockedSymbols.length,0);
 const gainInput=fixture({salePrice:100,statementBuy:-400.03,statementSell:400.04}),gain=bound(gainInput);
 assert.equal(current(gainInput.account,gain.context).blockedSymbols.length,0);
 assert(current(gainInput.account,clone(gain.context)).blockedSymbols.includes('ZZZ'),'Serialized review flags cannot clear the raw loss cooldown');
 same([...tradeCash(serialized)],[],'WeakMap authority is not part of the serialized context');
 const detached=tradeCash(loss.context);detached.set(lossInput.account.records[0].fills[0].id,9999);
 near(current(lossInput.account,loss.context).periods[0].netRealizedPnl,-.03,'A detached getter cannot mutate the trusted mapping');
});

check('repeated account-policy derivation preserves original records and exact adjusted completion dates',()=>{
 const input=fixture(),snapshot=clone(input.account),{review:inspected,context}=bound(input),reviewSnapshot=clone(inspected),first=current(input.account,context);
 same(current(input.account,context),first);same(current(clone(input.account),context),first,'Trusted amount mapping stays attached to the context, not a mutable account object');
 assert.equal(first.periods[0].completedAt,saleDate+'T15:00:00Z');assert.equal(first.periods[0].openedAt,buyDate);
 same(input.account,snapshot);same(inspected,reviewSnapshot);
 for(const record of input.account.records)if(record.executionEvidence){
  const expected=snapshot.records.find(original=>original.date===record.date);same(record.executionEvidence.orders,expected.executionEvidence.orders);
  same(record.executionEvidence.openingBooks,expected.executionEvidence.openingBooks);
 }
});

console.log(`PASS: ${count} fictional statement-net cooldown cases through actual statement review, financial context, account policy and account action paths; fees, global allocation bans, exact expiry, external-flow separation, WeakMap trust and immutable raw history.`);
