// Wholly fictional statements/accounts. This checks accounting classification
// and read-only review only; no provider, private owner data or storage is used.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {parseC1BrokerStatement:parse,reviewC1BrokerStatement:review,C1_BROKER_STATEMENT_REVIEW:contract}=loader.load('lib/c1BrokerStatementReview.js');
const clone=value=>JSON.parse(JSON.stringify(value)),hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const source='2026-04-13',date='2026-04-17',now=new Date(date+'T17:00:00Z'),ids=['base','cooldown15','sector40'];
const header='date\taction\tsymbol\tquantity\tprice\tfee\tamount\teffective_date';
const statementRows=[
 ['2026-04-14','Buy','ZZZ','10','10','.10','-100.12','2026-04-14'],
 ['2026-04-15','Sell','ZZZ','4','12','.10','47.86','2026-04-15'],
 [date,'Sell','ZZZ','2','11','.02','21.97',date],
 ['2026-04-14','Buy','CORC','3','10','0','-30.00','2026-04-14'],
 ['2026-04-15','Sell','CORC','1','15','0','15.00','2026-04-15'],
 ['2026-04-14','Buy','NNN','2','10','0','-20.00','2026-04-14'],
 [date,'Journal','','0','0','0','25.00','2026-04-16'],
 ['2026-04-16','Bank Interest','','0','0','0','.05','2026-04-16'],
 ['2026-04-16','ADR Mgmt Fee','ZZZ','0','0','0','-.10','2026-04-16']
];
const text=rows=>header+'\n'+rows.map(row=>row.join('\t')).join('\n')+'\n';
function fixture(){
 const receiptProposal={contract:'fictional-in-kind-adoption-v1',effectiveSessionDate:'2026-04-16',cashChange:0,
  original:{symbol:'NNN',role:'Core',shares:2,avgCost:10,openedAt:'2026-04-14T15:00:00Z'},allocations:{base:2,cooldown15:0,sector40:0}};
 const receipt={...receiptProposal,id:'f'.repeat(64),reviewId:'f'.repeat(64),reviewPayload:JSON.stringify(receiptProposal),recordedAt:'2026-04-16T23:00:00Z'};
 const order=(id,sleeve,side,shares)=>({id,sleeve,symbol:'ZZZ',side,shares});
 const fill=(id,orderId,side,shares,price,fee,executedAt)=>({id,orderId,symbol:'ZZZ',side,shares,price,fee,executedAt});
 const records=[{date:'2026-04-14',complete:true,executionEvidence:{orders:[order('buy-base','base','buy',5),order('buy-cool','cooldown15','buy',5)]},fills:[
  fill('fictional-buy:base','buy-base','buy',5,10,.05,'2026-04-14T15:00:00Z'),fill('fictional-buy:cool','buy-cool','buy',5,10,.05,'2026-04-14T15:00:00Z')]},
  {date:'2026-04-15',complete:true,executionEvidence:{orders:[order('sale-base','base','sell',2),order('sale-cool','cooldown15','sell',2)]},fills:[
   fill('fictional-sale:base','sale-base','sell',2,12,.05,'2026-04-15T15:00:00Z'),fill('fictional-sale:cool','sale-cool','sell',2,12,.05,'2026-04-15T15:00:00Z')]},
  {date:'2026-04-16',complete:true,fills:[]}];
 const openingBooks={base:{cash:224.70,positions:{ZZZ:{shares:3,avgCost:10,openedAt:'2026-04-14'},NNN:{shares:2,avgCost:10,openedAt:'2026-04-14'}}},
  cooldown15:{cash:473.90,positions:{ZZZ:{shares:3,avgCost:10,openedAt:'2026-04-14'}}},sector40:{cash:250,positions:{}}};
 const plan={contract:'c1-actual-account-opening-plan-v1',sourceSessionDate:'2026-04-16',date,openingBooks,orders:[order('today-base','base','sell',1),order('today-cool','cooldown15','sell',1)]};
 const account={contract:'c1-private-account-v1',revision:4,adoption:{sourceSessionDate:source,actualCash:1000,nonCashHoldings:[receipt]},records,
  cashReconciliations:[{amount:.80,effectiveSessionDate:'2026-04-16'}],
  brokerageCash:{balance:960.35,observedAt:date+'T16:00:00Z',source:'manual-broker-balance'},
  intradayActivity:{date,plan,tickets:[],fills:[fill('fictional-today:base','today-base','sell',1,11,.01,date+'T15:00:00Z'),fill('fictional-today:cool','today-cool','sell',1,11,.01,date+'T15:00:00Z')]}};
 return {account,portfolio:[{symbol:'CORC',role:'Core',shares:9,avgCost:8},{symbol:'NNN',role:'Swing',shares:2,avgCost:10},{symbol:'ZZZ',role:'Swing',shares:4,avgCost:10}],statementText:text(statementRows),now};
}
let count=0;
function check(name,run){run();count++;console.log('PASS '+name);}
const reject=(input,pattern=/Broker statement review:/)=>assert.throws(()=>review(input),pattern);

check('strict TSV parsing retains signed net cash rather than deriving an exact fill price',()=>{
 const parsed=parse(text(statementRows));assert.equal(parsed.delimiter,'TSV');assert.equal(parsed.rows.length,statementRows.length);
 assert.equal(parsed.rows[0].displayedPrice,10);assert.equal(parsed.rows[0].fee,.1);assert.equal(parsed.rows[0].amount,-100.12);
 assert.equal(parsed.rows[6].effectiveDate,'2026-04-16');assert.equal(parsed.rows[6].postedDate,date);
 assert.equal(parsed.rows[8].action,'Fee');assert.match(parsed.statementHash,/^[a-f0-9]{64}$/);
});

check('a complete statement separates Core capital, cash P&L and matched actual trade adjustments',()=>{
 const input=fixture(),r=review(input);
 assert.equal(r.contract,contract);assert.equal(r.status,'review-only');assert.equal(r.matchedTrades.length,3);assert.equal(r.matchedTradeNetCashAdjustments.length,3);
 same(r.externalCapitalFlows.map(row=>row.kind),['core-purchase','core-sale','core-purchase','journal']);
 assert.equal(r.externalCapitalFlows.find(row=>row.symbol==='NNN').coreAuthority.kind,'original-in-kind-Core-receipt');
 assert.equal(r.externalCapitalFlows.find(row=>row.kind==='journal').date,date,'Cash-only transfers use the posting date while retaining effective-date evidence');
 same(r.pnlCashEvents.map(row=>row.kind),['interest','fee']);
 near(r.originalLedgerCash,970.58);near(r.externalCapitalNet,-10);near(r.pnlCashNet,-.05);near(r.tradeCashAdjustment,-.07);near(r.afterKnownEventsCash,960.46);
 near(r.currentBrokerAvailability.brokerageCash,960.35);assert.equal(r.currentBrokerAvailability.brokerageCashCurrent,true);
 near(r.remainingRoundedBalanceAdjustment.amount,-.11);assert.equal(r.remainingRoundedBalanceAdjustment.allowed,true);
 assert.equal(r.impliedOpeningCash.status,'UNVERIFIED');near(r.impliedOpeningCash.amount,1000.69);near(r.impliedOpeningCash.differenceFromAdoption,.69);
 same(r.matchedTrades[0].rawFillIds,['fictional-buy:base','fictional-buy:cool']);same(r.matchedTrades[0].rawFills,input.account.records[0].fills);
 assert.equal(r.matchedTrades[0].statementEvidence[0].amount,-100.12);assert.match(r.matchedTrades[0].priceTreatment,/not reconstructed exact executions/);
});

check('the proposal binds the complete account, exact statement and server portfolio without mutation',()=>{
 const input=fixture(),snapshot=clone(input),r=review(input);
 assert.equal(r.bindings.accountHash,hash(input.account));assert.equal(r.bindings.statementHash,hash(input.statementText));assert.equal(r.bindings.portfolioHash,hash(input.portfolio));assert.match(r.reviewId,/^[a-f0-9]{64}$/);
 same(review({...input,account:clone(input.account)}).reviewId,r.reviewId);
 for(const change of [
  value=>value.account.revision++,value=>value.account.unrelatedRetainedEvidence={original:true},
  value=>value.portfolio[0].avgCost=9,value=>value.statementText+='\n'
 ]){const changed=fixture();change(changed);assert.notEqual(review(changed).reviewId,r.reviewId);}
 r.matchedTrades[0].rawFills[0].price=999;r.externalCapitalFlows[0].statementEvidence[0].amount=999;
 same({...input,now:input.now.toISOString()},snapshot,'No proposal or returned evidence mutation changes source financial data');
});

check('CSV quoting, money signs and standard header aliases remain strict',()=>{
 const csv='\uFEFFDate,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount,Effective Date\r\n'+
  '4/14/2026,Buy,CORC,"Fictional, quoted ""company""",3,$10.00,$0.00,($30.00),4/14/2026\r\n';
 const parsed=parse(csv);assert.equal(parsed.delimiter,'CSV');assert.equal(parsed.rows[0].description,'Fictional, quoted "company"');assert.equal(parsed.rows[0].amount,-30);
 assert.equal(parse(csv.replace('$0.00','')).rows[0].fee,0,'Blank trade Fees & Comm means zero when the header is present');
 for(const bad of [csv.replace('($30.00)','$30.00'),csv.replace('($30.00)','(+$30.00)'),csv.replace('4/14/2026','2/30/2026'),
  csv.replace('($30.00)','($30.000000001)'),
  csv.replace('Quantity','Mystery'),csv.replace('Fees & Comm','Price'),csv.replace('quoted ""company""','unclosed "company'),
  text(statementRows).replace('\tBuy\t','\tUnsupported Action\t')])assert.throws(()=>parse(bad),/Broker statement review:/);
});

check('Schwab as-of dates preserve accrual evidence while cash events post on their statement date',()=>{
 const parsed=parse('Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount\n4/20/2026 as of 4/19/2026,Bank Interest,,0,0,,0.03\n');
 assert.equal(parsed.rows[0].postedDate,'2026-04-20');assert.equal(parsed.rows[0].effectiveDate,'2026-04-19');assert.equal(parsed.rows[0].asOfDate,'2026-04-19');
 const input=fixture();input.now=new Date('2026-04-20T17:00:00Z');input.account.brokerageCash.observedAt='2026-04-20T16:00:00Z';
 input.statementText=text(statementRows)+'4/20/2026 as of 4/19/2026\tBank Interest\t\t0\t0\t\t.03\t\n';
 const r=review(input),event=r.pnlCashEvents.find(row=>row.statementEvidence[0].asOfDate);
 assert.equal(event.date,'2026-04-20','Sunday accrual must not be scheduled as a Sunday cash journal event');
 assert.equal(event.statementEvidence[0].effectiveDate,'2026-04-19');near(event.netCash,.03);
 const conflict=input.statementText.replace('.03\t\n','.03\t2026-04-18\n');assert.throws(()=>parse(conflict),/effective dates conflict/);
});

check('missing, excess, wrong-side and unmatched trades cannot be guessed into C1 fills',()=>{
 for(const change of [
  rows=>rows.filter((_row,index)=>index!==0),rows=>rows.map((row,index)=>index===0?[...row.slice(0,3),'11',...row.slice(4)]:row),
  rows=>rows.map((row,index)=>index===0?[...row.slice(0,3),'10.000000001',...row.slice(4)]:row),
  rows=>rows.map((row,index)=>index===0?[row[0],'Sell',row[2],row[3],row[4],row[5],'100.12',row[7]]:row),
  rows=>[...rows,['2026-04-16','Buy','UNKNOWN','1','10','0','-10.00','2026-04-16']]
 ]){const input=fixture();input.statementText=text(change(clone(statementRows)));reject(input);}
 const alsoCore=fixture();alsoCore.portfolio.find(row=>row.symbol==='ZZZ').role='Core';alsoCore.statementText=text(statementRows.map((row,index)=>index===0?[...row.slice(0,3),'11',...row.slice(4)]:row));reject(alsoCore,/quantity is missing or differs/);
});

check('Core classification requires the saved Core position or a valid pre-adoption in-kind receipt',()=>{
 const noCore=fixture();noCore.portfolio[0].role='Swing';reject(noCore,/no verified Core classification/);
 const noReceipt=fixture();noReceipt.account.adoption.nonCashHoldings=[];reject(noReceipt,/no verified Core classification/);
 const afterAdoption=fixture();afterAdoption.statementText=text(statementRows.map((row,index)=>index===5?[date,...row.slice(1,7),date]:row));reject(afterAdoption,/no verified Core classification/);
 const corrupt=fixture();corrupt.account.adoption.nonCashHoldings[0].cashChange=1;reject(corrupt,/Core receipt is invalid/);
 const original=fixture(),r=review(original);same(original.account.adoption,fixture().account.adoption);assert(!r.matchedTrades.some(row=>row.symbol==='NNN'),'Core purchases are cash flows, not fabricated C1 entry fills');
});

check('duplicates and out-of-window rows/fills are rejected explicitly',()=>{
 const duplicate=fixture();duplicate.statementText=text([...statementRows,statementRows[0]]);reject(duplicate,/duplicate statement/);
 const duplicateFill=fixture();duplicateFill.account.records[0].fills.push(clone(duplicateFill.account.records[0].fills[0]));reject(duplicateFill,/fill identity/);
 for(const badDate of ['2026-04-10','2026-04-20']){const input=fixture();input.statementText=text(statementRows.map((row,index)=>index===3?[badDate,...row.slice(1,7),badDate]:row));reject(input,/outside the account review window/);}
 const unknownOrder=fixture();unknownOrder.account.records[0].fills[0].orderId='client-invented';reject(unknownOrder,/original order/);
});

check('only a current confirmed broker date and existing small-balance bound allow a residual proposal',()=>{
 const stale=fixture();stale.account.brokerageCash.observedAt='2026-04-16T16:00:00Z';const sr=review(stale);assert.equal(sr.remainingRoundedBalanceAdjustment.allowed,false);assert.match(sr.remainingRoundedBalanceAdjustment.reason,/current confirmed brokerage balance/);
 const missing=fixture();delete missing.account.brokerageCash;assert.equal(review(missing).remainingRoundedBalanceAdjustment.allowed,false);
 const large=fixture();large.account.brokerageCash.balance=900;const lr=review(large);assert.equal(lr.remainingRoundedBalanceAdjustment.allowed,false);assert.match(lr.remainingRoundedBalanceAdjustment.reason,/exceeds/);
 const invalid=fixture();invalid.account.brokerageCash.balance=-1;assert.equal(review(invalid).remainingRoundedBalanceAdjustment.allowed,false);
});

check('completed books are an optional consistency check rather than a new cash authority',()=>{
 const account={contract:'c1-private-account-v1',revision:2,adoption:{sourceSessionDate:source,actualCash:500},records:[{date:'2026-04-14',complete:true,fills:[]}],
  brokerageCash:{balance:515,observedAt:date+'T16:00:00Z',source:'manual-broker-balance'}};
 const input={account,portfolio:[],statementText:text([[date,'Journal','','0','0','0','15.00',date]]),now};
 near(review(input).originalLedgerCash,500);
 const completedBooks=Object.fromEntries(ids.map((id,index)=>[id,{cash:[200,200,100][index],positions:{}}]));
 const r=review({...input,completedBooks});near(r.originalLedgerCash,500);near(r.afterKnownEventsCash,515);near(r.remainingRoundedBalanceAdjustment.amount,0);assert.equal(r.bindings.completedBooksHash,hash(completedBooks));
 const changed=clone(completedBooks);changed.base.cash++;reject({...input,completedBooks:changed},/differs from immutable accounting history/);
});

check('whole-history re-import starts from raw cash and retains each earlier approved residual once on its original date',()=>{
 const {appendC1BrokerCashJournal:append}=loader.load('lib/c1BrokerCashJournal.js');
 const first=fixture(),reviewOne=review(first),approved=append({account:first.account,review:reviewOne,reviewId:reviewOne.reviewId,confirmed:true,expectedRevision:first.account.revision,now});
 const originalSnapshot=clone(approved),future=clone(approved),futureDate='2026-04-20',futureNow=new Date(futureDate+'T17:00:00Z'),oldActivity=future.intradayActivity;
 future.revision++;
 future.records.push({date,complete:true,executionEvidence:clone(oldActivity.plan),fills:clone(oldActivity.fills)});
 const openingBooks=clone(oldActivity.plan.openingBooks);
 openingBooks.base.positions.ZZZ.shares=2;openingBooks.cooldown15.positions.ZZZ.shares=2;
 openingBooks.base.cash=225.46;openingBooks.cooldown15.cash=484.89;openingBooks.sector40.cash=250;
 const plan={contract:'c1-actual-account-opening-plan-v1',sourceSessionDate:date,date:futureDate,openingBooks,
  cashAccounting:{contract:'c1-effective-cash-accounting-v1',reviewId:reviewOne.reviewId,sourceDigest:hash([reviewOne.reviewId,reviewOne.bindings])},
  orders:[{id:'future-financial-sale',symbol:'ZZZ',side:'sell',sleeve:'base',shares:1}]};
 future.intradayActivity={date:futureDate,plan,tickets:[],fills:[{id:'future-financial-fill:base',orderId:'future-financial-sale',symbol:'ZZZ',side:'sell',shares:1,price:11,fee:.01,executedAt:futureDate+'T15:00:00Z'}]};
 future.brokerageCash={balance:956.34,observedAt:futureDate+'T16:00:00Z',source:'manual-broker-balance'};
 const rows=[...clone(statementRows),[futureDate,'Sell','ZZZ','1','11','.01','10.99',futureDate],[futureDate,'Buy','CORC','1','15','0','-15.00',futureDate]];
 const input={account:future,portfolio:clone(first.portfolio),statementText:text(rows),now:futureNow},r=review(input);
 near(r.originalLedgerCash,981.57);near(r.afterKnownEventsCash,956.34);near(r.remainingRoundedBalanceAdjustment.amount,0);
 const carried=r.pnlCashEvents.filter(event=>event.kind==='prior-confirmed-balance-adjustment');
 assert.equal(carried.length,1);assert.equal(carried[0].sourceReceiptId,reviewOne.reviewId);assert.equal(carried[0].date,date);near(carried[0].netCash,-.11);
 const bad=clone(future);delete bad.intradayActivity.plan.cashAccounting;reject({...input,account:bad},/original intraday cash differs/);
 const second=append({account:future,review:r,reviewId:r.reviewId,confirmed:true,expectedRevision:future.revision,now:futureNow});
 const repeated=review({...input,account:second});near(repeated.afterKnownEventsCash,956.34);near(repeated.remainingRoundedBalanceAdjustment.amount,0);
 assert.equal(repeated.pnlCashEvents.filter(event=>event.kind==='prior-confirmed-balance-adjustment').length,1,'Embedded earlier adjustments in a superseding capsule are not imported twice');
 const duplicate=clone(second);duplicate.cashAccountingCorrections.push(clone(duplicate.cashAccountingCorrections[0]));
 near(review({...input,account:duplicate}).afterKnownEventsCash,956.34,'Repeated receipt identity contributes only once');
 const conflict=clone(duplicate);conflict.cashAccountingCorrections.at(-1).review.remainingRoundedBalanceAdjustment.amount=-.12;
 reject({...input,account:conflict},/identity conflicts/);
 same(approved,originalSnapshot,'Future reviews cannot mutate earlier accepted account or receipt objects');
});

check('distinct partial statement rows aggregate only by the exact C1 day/symbol/side key',()=>{
 const input=fixture(),rows=clone(statementRows);rows.splice(0,1,
  ['2026-04-14','Buy','ZZZ','4','9.99','.04','-39.99','2026-04-14'],
  ['2026-04-14','Buy','ZZZ','6','10.01','.06','-60.13','2026-04-14']);
 input.statementText=text(rows);const r=review(input),trade=r.matchedTrades[0];assert.equal(trade.quantity,10);assert.equal(trade.statementEvidence.length,2);near(trade.statementNetCash,-100.12);near(r.afterKnownEventsCash,960.46);
 const fractional=fixture(),parts=clone(statementRows);parts.splice(0,1,
  ['2026-04-14','Buy','ZZZ','.1','10','0','-1.00','2026-04-14'],
  ['2026-04-14','Buy','ZZZ','.2','10','0','-2.00','2026-04-14'],
  ['2026-04-14','Buy','ZZZ','9.7','10','.10','-97.12','2026-04-14']);
 fractional.statementText=text(parts);assert.equal(review(fractional).matchedTrades[0].statementEvidence.length,3,'Decimal quantities are compared exactly, without floating tolerance or per-row whole-share assumptions');
});

console.log(`PASS: ${count} fictional broker-statement review cases; strict TSV/CSV, complete exact C1 matching, scoped Core flows, signed net cash, P&L separation, immutable hash binding and bounded current-date residual review. No live data or writes.`);
