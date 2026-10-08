const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),plain=value=>JSON.parse(JSON.stringify(value));
const {adoptC1Account,evaluateC1Account,deriveC1AccountAnalysis,updateC1BrokerageCash,reconcileC1BrokerCash}=loader.load('lib/c1AccountService.js');
const {continueC1ActualAccount}=loader.load('lib/c1AccountLedger.js');
const {buildC1AccountDecision,c1AccountMatchesPortfolio}=loader.load('lib/c1AccountDecision.js');
const {c1CashAvailability,c1AccountCashAvailability,assertC1NewBuyCash}=loader.load('lib/c1BrokerageCash.js');
const {portfolioCompositionSignature}=loader.load('lib/portfolioGovernor.js');
const date='2026-10-07',now=new Date('2026-10-08T15:00:00Z'),observedAt='2026-10-08T13:00:00.000Z';
const symbols=Array.from({length:12},(_,i)=>'T'+i),baseline={date,decisionAt:date+'T21:00:00Z',universeSymbols:symbols,
 prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,high:101,low:99,close:100,volume:10000000,adjusted:true})),
 signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%4,price:100,researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))};
const portfolio=[{symbol:'T4',role:'Swing',shares:3,avgCost:100,openedAt:date},{symbol:'CASH',role:'Swing',shares:3037.90,avgCost:1},
 {symbol:'MSTR',role:'Core',shares:20,avgCost:400,openedAt:date},{symbol:'MRNA',role:'Core',shares:10,avgCost:45,openedAt:date}];
const book={universe:'sp500',model:{sessions:[baseline]},captures:[{sessionDate:date,hash:'brokerage-cash-fixture',observedAt:date+'T21:00:00Z'}]};
const capitalRecord={version:2,highWater:3337.90,triggerDay:null,portfolioSignature:portfolioCompositionSignature(portfolio),reconciliationRequired:false};
const original=adoptC1Account({portfolio,capitalRecord,book,now:new Date(date+'T21:00:00Z')}),originalJSON=JSON.stringify(original);
const continued=account=>continueC1ActualAccount({adoption:account.adoption,sessions:[baseline],records:account.records,cashReconciliations:account.cashReconciliations,observedAt:now});
const ledgerBefore=JSON.stringify(continued(original)),before=evaluateC1Account({account:original,book,now});
assert.equal(before.brokerageCash,null);assert.equal(before.executableCash,0);assert.equal(before.brokerageCashStatus,'missing');
assert.equal(Math.round(before.strategyCash*100)/100,3037.90);assert.equal(before.actualCash,before.strategyCash);
const updated=updateC1BrokerageCash({account:original,brokerageCash:363.36,expectedRevision:0,now:new Date(observedAt)});
assert.equal(updated.revision,1);assert.equal(updated.brokerageCash.balance,363.36);
assert.equal(updated.brokerageCash.observedAt,observedAt);assert.equal(updated.brokerageCash.source,'manual-broker-balance');
assert.equal(JSON.stringify(original),originalJSON,'A metadata update cannot mutate its input account');
for(const key of Object.keys(original))if(key!=='revision'){
 assert.equal(updated[key],original[key],`${key} remains the exact original account field`);
 assert.equal(JSON.stringify(updated[key]),JSON.stringify(original[key]));
}
assert.equal(JSON.stringify(continued(updated)),ledgerBefore,'Broker cash updates leave every sleeve and performance result byte-for-byte unchanged');
const after=evaluateC1Account({account:updated,book,now});
assert.equal(after.strategyCash,before.strategyCash);assert.equal(after.actualCash,after.strategyCash);
assert.equal(after.brokerageCash,363.36);assert.equal(after.executableCash,363.36);assert.equal(after.brokerageCashCurrent,true);
assert.deepEqual(plain(after.positions),plain(before.positions));assert.deepEqual(plain(after.opportunities),plain(before.opportunities));
assert.equal(c1AccountMatchesPortfolio(after,portfolio.map(p=>p.symbol==='CASH'?{...p,shares:363.36}:p)),true);
assert.equal(c1AccountMatchesPortfolio(after,portfolio.filter(p=>p.symbol!=='CASH')),true,'Missing legacy CASH does not imply a holdings difference');
assert.equal(c1AccountMatchesPortfolio(after,portfolio.map(p=>p.symbol==='T4'?{...p,shares:2}:p)),false);
assert.equal(c1AccountMatchesPortfolio(after,portfolio.map(p=>p.symbol==='T4'?{...p,avgCost:101}:p)),false);
assert.equal(c1AccountMatchesPortfolio(after,portfolio.map(p=>p.symbol==='T4'?{...p,openedAt:'2026-10-06'}:p)),false);
assert.ok(Object.values(updated.adoption.seeds).every(seed=>seed.positions.every(p=>!['MSTR','MRNA'].includes(p.symbol))),'Core holdings never enter C1 sleeve ownership');
const corePurchase=updateC1BrokerageCash({account:updated,brokerageCash:0,expectedRevision:1,now});
assert.equal(JSON.stringify(continued(corePurchase)),ledgerBefore,'A Core purchase represented by lower broker cash cannot create a C1 withdrawal or loss');
assert.equal(corePurchase.records.length,0);assert.equal(corePurchase.cashReconciliations,undefined);
const zeroAnalysis=deriveC1AccountAnalysis({account:corePurchase,book,now}).decision;
assert.equal(zeroAnalysis.current,true);assert.equal(zeroAnalysis.executableCash,0);
assert.deepEqual(plain(zeroAnalysis.positions),plain(before.positions));assert.deepEqual(plain(zeroAnalysis.opportunities),plain(before.opportunities));
for(const invalid of [null,'363.36',true,NaN,Infinity,-1,.001,.0000000001,1e20])assert.throws(()=>updateC1BrokerageCash({account:original,brokerageCash:invalid,expectedRevision:0,now}),/finite nonnegative.*cents/);
assert.throws(()=>updateC1BrokerageCash({account:original,brokerageCash:0,expectedRevision:1,now}),/Account changed/);
assert.throws(()=>updateC1BrokerageCash({account:original,brokerageCash:0,expectedRevision:0,now:new Date('invalid')}),/observation time/);
const validZero=updateC1BrokerageCash({account:original,brokerageCash:0,expectedRevision:0,now});
assert.equal(validZero.brokerageCash.balance,0);
const stale=c1AccountCashAvailability({account:updated,strategyCash:3037.90,now:new Date('2026-10-09T15:00:00Z')});
assert.equal(stale.brokerageCash,363.36);assert.equal(stale.executableCash,0);assert.equal(stale.brokerageCashStatus,'stale');
const future=c1AccountCashAvailability({account:updated,strategyCash:3037.90,now:new Date('2026-10-08T12:00:00Z')});
assert.equal(future.executableCash,0);assert.equal(future.brokerageCashStatus,'invalid');
const strategyCap=c1AccountCashAvailability({account:updated,strategyCash:100,now});assert.equal(strategyCap.executableCash,100);
assert.equal(c1CashAvailability({strategyCash:3037.90,brokerageCash:updated.brokerageCash,now}).executableCash,363.36);

// A completed candidate and pending exit remain identical with zero broker
// cash; cash governs authority without changing C1 ranking or holding rules.
const decisionContinued={contract:'c1-actual-account-continuation-v1',sourceSessionDate:date,actualCash:3037.90,
 books:{base:{cash:3037.90,positions:{T4:{shares:3,avgCost:100,openedAt:date}}}},
 sleeves:{base:{openPositions:[{symbol:'T4',stopPrice:86,lastPrice:100}],pendingDecisions:[{side:'sell',symbol:'T4',reason:'initial-stop'},{side:'buy',symbol:'T0',sector:'Sector0',signal:{price:100,researchFactors:{momentumPercentile:100}}}]}}};
const exitDecision=buildC1AccountDecision({continued:decisionContinued,sourceHash:'fixture',revision:1,brokerageCash:validZero.brokerageCash,now});
assert.equal(exitDecision.positions[0].action,'Exit candidate');assert.equal(exitDecision.opportunities[0].symbol,'T0');assert.equal(exitDecision.executableCash,0);

// Recorded C1 sale proceeds are applied once. The observation after a sale
// already includes its proceeds; a duplicate fill cannot count them again.
const sale={id:'recorded-sale:base',orderId:'sell',symbol:'T4',side:'sell',shares:2,price:100,fee:.50,executedAt:'2026-10-08T14:00:00Z'};
const purchase={id:'recorded-buy:base',orderId:'buy',symbol:'T0',side:'buy',shares:1,price:100,fee:.25,executedAt:'2026-10-08T14:01:00Z'};
const active={...updated,intradayActivity:{fills:[sale,purchase]}};
const activeCash=c1AccountCashAvailability({account:active,strategyCash:3137.15,now});assert.equal(activeCash.brokerageCash,462.61);assert.equal(activeCash.executableCash,462.61);
assert.equal(c1CashAvailability({strategyCash:3237.40,brokerageCash:updated.brokerageCash,records:[{fills:[sale]}],intradayActivity:{fills:[sale]},now}).brokerageCash,562.86);
const afterSale=updateC1BrokerageCash({account:{...updated,intradayActivity:{fills:[sale]}},brokerageCash:562.86,expectedRevision:1,now:new Date('2026-10-08T14:00:30Z')});
assert.equal(c1AccountCashAvailability({account:afterSale,strategyCash:3237.40,now}).brokerageCash,562.86);
assertC1NewBuyCash({account:updated,strategyCash:3037.90,fills:[purchase],now});
assert.throws(()=>assertC1NewBuyCash({account:updated,strategyCash:3037.90,fills:[{...purchase,shares:4}],now}),/exceeds available brokerage or strategy cash/);
assert.throws(()=>assertC1NewBuyCash({account:updated,strategyCash:100,fills:[purchase],now}),/exceeds available brokerage or strategy cash/);
assert.throws(()=>assertC1NewBuyCash({account:original,strategyCash:3037.90,fills:[purchase],now}),/Update Brokerage Cash/);
assert.throws(()=>assertC1NewBuyCash({account:afterSale,strategyCash:3037.90,fills:[{...purchase,executedAt:'2026-10-08T13:59:00Z'}],now}),/observation is invalid/,'A later balance cannot retroactively authorize a purchase');
assertC1NewBuyCash({account:validZero,strategyCash:3037.90,fills:[sale],now});
const small=updateC1BrokerageCash({account:original,brokerageCash:0,expectedRevision:0,now:new Date(observedAt)});
assertC1NewBuyCash({account:small,strategyCash:3037.90,fills:[sale,purchase],now});
assert.throws(()=>assertC1NewBuyCash({account:small,strategyCash:3037.90,fills:[{...purchase,executedAt:'2026-10-08T13:59:00Z'},sale],now}),/exceeds available/,'Unrecorded later sale proceeds cannot fund a purchase');
const priorFutureSale={...small,intradayActivity:{fills:[sale]}};
assert.throws(()=>assertC1NewBuyCash({account:priorFutureSale,strategyCash:199.50,fills:[{...purchase,executedAt:'2026-10-08T13:59:00Z'}],now}),/exceeds available/,'An already recorded future sale cannot fund a backdated purchase');

// Existing factual C1-generated cash reconciliation retains its small-delta
// semantics and changes the strategy ledger only through its existing event.
const target=Math.round((before.strategyCash+.52)*100)/100;
const reconciled=reconcileC1BrokerCash({account:updated,brokerCash:target,expectedRevision:1,book,now});
assert.equal(reconciled.cashReconciliations[0].amount,.52);assert.equal(reconciled.brokerageCash,updated.brokerageCash);
assert.equal(Math.round(evaluateC1Account({account:reconciled,book,now}).strategyCash*100)/100,target);
assert.throws(()=>reconcileC1BrokerCash({account:updated,brokerCash:Math.round((before.strategyCash+5.01)*100)/100,expectedRevision:1,book,now}),/transaction-level evidence/);
console.log('PASS: brokerage metadata updates preserve exact C1 ledger/ownership/performance; separate current cash caps, Core isolation, holdings matching, stale legacy fail-closed behavior, visible analysis/exits, timestamped buy funding and single-count sale proceeds.');
