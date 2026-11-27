// Real application services and HTTP handler, entirely fictional account facts.
// No provider, production-account write, brokerage order or strategy backtest.
const assert=require('node:assert/strict');
const {fixture,load}=require('./c1-financial-application-regression.cjs');
const {harness}=require('./c1-broker-cash-api-regression.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const same=(a,b,label)=>assert.equal(JSON.stringify(a),JSON.stringify(b),label);
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} differs from ${b}`);
const sum=books=>Object.values(books).reduce((n,b)=>n+b.cash,0);
const cash=load('c1CashAccounting'),service=load('c1AccountService'),execution=load('c1AccountExecutionView');
const statementService=load('c1BrokerCashReviewService');
const parser=load('c1BrokerStatementReview');
const header='Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount\n';
function close(book,date){
 const row=clone(book.model.sessions.at(-1));row.date=date;row.decisionAt=date+'T21:00:00Z';for(const p of row.prices)p.date=date;
 return {...book,model:{sessions:[...book.model.sessions,row]},captures:[...book.captures,{sessionDate:date,hash:'synthetic-workflow:'+date,observedAt:row.decisionAt}]};
}
let checks=0;
async function check(name,run){await run();checks++;console.log('PASS '+name);}

async function applicationFlow(action,amount,extra='',recordCompletedAdd=false){
 const f=fixture(),exitDate='2026-11-24',date='2026-11-25';
 const order={id:'fictional-income-exit',date:exitDate,sleeve:'sector40',symbol:'LLL',side:'sell',shares:25,estimatedPrice:100,reason:'portfolio-drawdown-stop'};
 const risk={highWater:4000,paused:true,operationalRisk:{requiresLiquidationEpoch:true,triggerDate:exitDate,purchaseRiskReady:false}};
 const plan={contract:'c1-actual-account-opening-plan-v1',date:exitDate,sourceSessionDate:'2026-11-23',observedAt:exitDate+'T14:45:00Z',
  openingBooks:clone(f.original.books),orders:[order],purchaseFundingPolicy:'brokerage-cash-only-v1',riskBySleeve:{sector40:risk}};
 const ticket={id:'fictional-income-sale',symbol:'LLL',side:'sell',shares:25,price:100,fee:.25,executedAt:exitDate+'T17:01:00Z'};
 const fill={...ticket,id:ticket.id+':sector40',orderId:order.id};
 const original={...f.account,intradayActivity:{date:exitDate,plan,tickets:[ticket],fills:[fill]}};
 f.workflow.now=new Date(exitDate+'T17:02:00Z');
 const prepared=await execution.prepareC1AccountExecution({account:original,book:f.book,now:new Date(exitDate+'T17:02:00Z'),collectOpening:f.workflow.collectOpening});
 assert.equal(prepared.openingError,null);
 const exitBook=close(f.book,exitDate),closed=service.deriveC1AccountAnalysis({account:prepared.account,book:exitBook,now:new Date(exitDate+'T22:00:00Z')});
 const originalFinancial=cash.c1CashAccountingDecisionContinued(closed.decision),receipt=originalFinancial.operationalRiskReceipts.sector40[0];
 const now=new Date(date+'T17:00:00Z'),net=amount+(extra?-amount:0);let balance=4702.75+net;
 f.workflow.now=now;
 const account=service.updateC1BrokerageCash({account:closed.account,brokerageCash:balance,expectedRevision:closed.account.revision,now});
 const portfolioRecord={etag:'"fictional-income-portfolio"',portfolio:[...f.workflow.portfolio.filter(p=>p.symbol!=='LLL'),
  {symbol:'LLL',role:'Swing',shares:75,avgCost:100,openedAt:'2026-11-19'},{symbol:'CORC',role:'Core',shares:1,avgCost:800}]};
 const statementText=header+'11/20/2026,Buy,CORC,1,800,0,-800\n11/20/2026,Bank Interest,,0,0,0,3\n11/24/2026,Sell,LLL,25,100,.25,2499.75\n'+
  `11/25/2026,${action},LLL,0,0,0,${amount}\n`+extra;
 const args={account,book:exitBook,portfolioRecord,statementText,expectedRevision:account.revision,now},before=clone(account);
 const review=statementService.reviewC1BrokerCashCorrection(args);assert.equal(review.financialValid,true);same(account,before,'Review is read-only');
 const approved=statementService.confirmC1BrokerCashCorrection({...args,reviewId:review.reviewId,confirmed:true});
 for(const field of ['adoption','records','sourceHashes'])same(approved[field],before[field],'Original '+field+' preserved');
 const opening=await execution.prepareC1AccountExecution({account:approved,book:exitBook,now,collectOpening:f.workflow.collectOpening});
 assert.equal(opening.openingError,null);near(sum(opening.openingPlan.openingBooks),balance);
 const state=opening.openingPlan.riskBySleeve.sector40.operationalRisk;
 assert.equal(state.purchaseRiskReady,true);assert.equal(state.appliedEpochs.length,1);
 near(state.epoch.reference,receipt.postExitEquity);
 near(state.historicalHighWater,originalFinancial.sleeves.sector40.accountRisk.historicalHighWater*f.account.adoption.seeds.sector40.actualDollarsPerModelDollar);
 assert(state.operationalHighWater>=state.epoch.reference,'Fees must not ratchet the reset reference down');
 assert(!opening.openingPlan.entryReviews.some(row=>row.sleeve==='sector40'&&row.reason==='operational-risk-evidence-required'));
 const again=await execution.prepareC1AccountExecution({account:approved,book:exitBook,now,collectOpening:f.workflow.collectOpening});
 same(again.openingPlan,opening.openingPlan,'Reread cannot duplicate cash, orders or risk epochs');
 same(approved.adoption,original.adoption);same(approved.records,closed.account.records);
 const beforeHolding=closed.decision.positions.find(p=>p.symbol==='LLL'),afterHolding=opening.decision.positions.find(p=>p.symbol==='LLL');
 for(const field of ['shares','avgCost','openedAt','stops'])same(afterHolding[field],beforeHolding[field],'Income preserves '+field);
 let closingAccount=opening.account;
 if(recordCompletedAdd){
  // A fictional retained offer isolates the real recording/replay boundary.
  // It is not a claim that this fixture's current Buy gates authorize a trade.
  const at=new Date(date+'T17:02:00Z'),recovery=load('c1CompletedAddRecovery');f.workflow.now=at;
  const order={id:'fictional-income-issued-buy',sleeve:'sector40',date,symbol:'LLL',side:'buy',shares:1,estimatedPrice:100,reason:'buy'};
  const offer={...clone(opening.openingPlan),providerVerified:true,orders:[order]};
  const retained=load('c1IssuedTradeLog').retainC1IssuedEntries({account:approved,view:{openingPlan:offer,
   manualRecommendations:{date,sourceSessionDate:offer.sourceSessionDate,status:'ready',observedAt:offer.observedAt,validUntil:date+'T17:10:00Z',orders:[order]}}});
  const ticket={id:'fictional-income-completed-add',symbol:'LLL',side:'buy',shares:1,price:100,fee:0,
   executedAt:date+'T17:01:00Z',recordingReason:'recorded-issued-buy'};
  closingAccount=recovery.recordC1IssuedBuy({account:retained,book:exitBook,ticket,expectedRevision:retained.revision,now:at});
  const recorded=await execution.prepareC1AccountExecution({account:closingAccount,book:exitBook,now:at,collectOpening:f.workflow.collectOpening});
  assert.equal(recorded.openingError,null);assert.equal(recorded.openingPlan.riskBySleeve.sector40.operationalRisk.appliedEpochs.length,1);
  assert.equal(recorded.openingPlan.riskBySleeve.sector40.operationalRisk.purchaseRiskReady,true);
  assert.equal(recorded.decision.positions.find(p=>p.symbol==='LLL').shares,76);balance-=100;
  near(sum(recorded.openingPlan.openingBooks),balance);
  same(recovery.recordC1IssuedBuy({account:closingAccount,book:exitBook,ticket,expectedRevision:closingAccount.revision,now:at}),closingAccount,'The confirmed Add is recorded once');
 }
 const completedBook=close(exitBook,date),completed=service.deriveC1AccountAnalysis({account:closingAccount,book:completedBook,now:new Date(date+'T22:00:00Z')});
 const continued=cash.c1CashAccountingDecisionContinued(completed.decision),finalState=continued.sleeves.sector40.accountRisk.operationalRisk;
 near(continued.actualCash,balance);assert.equal(finalState.appliedEpochs.length,1);
 near(finalState.epoch.reference*f.account.adoption.seeds.sector40.actualDollarsPerModelDollar,receipt.postExitEquity);
 const nextNow=new Date('2026-11-27T17:00:00Z'),nextAccount=service.updateC1BrokerageCash({account:completed.account,brokerageCash:balance,expectedRevision:completed.account.revision,now:nextNow});
 f.workflow.now=nextNow;
 const next=await execution.prepareC1AccountExecution({account:nextAccount,book:completedBook,now:nextNow,collectOpening:f.workflow.collectOpening});
 assert.equal(next.openingError,null);assert.equal(next.openingPlan.riskBySleeve.sector40.operationalRisk.appliedEpochs.length,1);
 near(sum(next.openingPlan.openingBooks),balance);same(next.account.records,completed.account.records);
}

async function main(){
 await check('cash-dividend parser retains posted net income and rejects ambiguous or noncash activities',()=>{
  const row='11/25/2026,Cash Dividend,LLL,,,,$40.00\n',parsed=parser.parseC1BrokerStatement(header+row);
  assert.equal(parsed.rows[0].action,'Cash Dividend');assert.equal(parsed.rows[0].amount,40);assert.equal(parsed.rows[0].quantity,0);
  for(const bad of [row.replace(',$40.00',',-$40.00'),row.replace(',LLL,',',,'),row.replace('LLL,,,,','LLL,1,,,'),
   row.replace('LLL,,,,','LLL,,,0.01,'),row.replace('Cash Dividend','Reinvest Dividend'),row.replace('Cash Dividend','Return of Capital')])
   assert.throws(()=>parser.parseC1BrokerStatement(header+bad),/Broker statement review:/);
 });
 await check('confirmed cash dividends reconcile through the real authenticated HTTP review/confirm/reload path',async()=>{
  const h=harness(),before=clone(h.state.account);h.input.statementText=h.input.statementText.replace('Bank Interest,,','Cash Dividend,LLL,');
  const review=await h.review();assert.equal(review.pnlCashEvents.find(r=>r.kind==='dividend').netCash,3);assert.equal(review.externalCapitalNet,-800);
  assert.equal(h.state.writes,0);const saved=await h.request(h.confirmPayload(review));assert.equal(saved.statusCode,200,JSON.stringify(saved.body));
  const reload=await h.request();assert.equal(reload.statusCode,200,JSON.stringify(reload.body));assert.equal(h.state.writes,1);assert.equal(h.state.providerCalls,0);
  for(const field of ['adoption','records','sourceHashes'])same(h.state.account[field],before[field]);
  assert.equal(h.state.account.brokerageCash.balance,2203);assert.equal(h.state.account.cashAccountingCorrections.length,1);
 });
 await check('approved opening dividend permits exactly one original-equity reset and persists through close and next opening',()=>applicationFlow('Cash Dividend',40));
 await check('approved opening interest uses the same capability and preserves financial records',()=>applicationFlow('Bank Interest',40));
 await check('approved opening fee remains a loss against the conserved reset reference',()=>applicationFlow('Fee',-4));
 await check('opposite signed current postings net to zero without duplicating cash or reset',()=>applicationFlow('Cash Dividend',40,'11/25/2026,Fee,LLL,0,0,0,-40\n'));
 await check('a confirmed Add after the income-enabled opening preserves one reset and one fill through replay',()=>applicationFlow('Cash Dividend',40,'',true));
 console.log(`PASS: ${checks} income application cases, exact account services/HTTP/replay, unchanged financial facts and one-use risk continuation.`);
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
