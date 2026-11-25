// Wholly fictional saved accounting examples. No owner data, provider history,
// storage, brokerage, production endpoint or invented broker execution is used.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {reviewC1SaleAttribution:review,correctC1SaleAttribution:correct,C1_SALE_ATTRIBUTION_CORRECTION:contract}=loader.load('lib/c1SaleAttributionRecovery.js');
const {reconcileC1ActualAccountFills:reconcile}=loader.load('lib/c1AccountLedger.js');
const {c1IntradayRemainingPlan:remaining,correctC1IntradayTradeDetails:details}=loader.load('lib/c1IntradayActivity.js');
const {c1AccountCashAvailability:cash}=loader.load('lib/c1BrokerageCash.js');
const {deriveC1CompletedAccount:finalize}=loader.load('lib/c1AccountService.js');
const clone=value=>JSON.parse(JSON.stringify(value)),same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,message||`${actual} differs from ${expected}`);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const date='2026-11-25',source='2026-11-24',now=new Date(date+'T17:00:00Z'),ids=['base','cooldown15','sector40'];
const target='fictional:sector40:planned:ZZZ';
function fixture(){
 const openingBooks=Object.fromEntries(ids.map((sleeve,index)=>[sleeve,{cash:1000,positions:{ZZZ:{shares:[30,50,20][index],avgCost:[24,25,26][index],openedAt:'2026-11-18'}}}]));
 openingBooks.base.positions.YYY={shares:3,avgCost:9,openedAt:'2026-11-17'};
 const orders=[{id:target,date,sleeve:'sector40',symbol:'ZZZ',side:'sell',shares:20,estimatedPrice:25,reason:'portfolio-drawdown-stop'},
  ...ids.map((sleeve,index)=>({id:`fictional:${sleeve}:stop:ZZZ`,date,sleeve,symbol:'ZZZ',side:'sell',shares:[30,50,20][index],estimatedPrice:21,reason:'initial-stop',condition:'stop-triggered'}))];
 const ticket={id:'fictional-completed-sale',symbol:'ZZZ',side:'sell',shares:20,price:25.75,fee:.40,executedAt:date+'T15:01:00.000Z'};
 const fills=[['sector40',4,.08,target],['base',6,.12,'fictional:base:stop:ZZZ'],['cooldown15',10,.20,'fictional:cooldown15:stop:ZZZ']]
  .map(([sleeve,shares,fee,orderId])=>({id:ticket.id+':'+sleeve,orderId,symbol:ticket.symbol,side:ticket.side,shares,price:ticket.price,fee,executedAt:ticket.executedAt}));
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:source,observedAt:date+'T15:02:00.000Z',openingBooks,orders,
  providerVerified:true,purchaseFundingPolicy:'brokerage-cash-only-v1',
  riskBySleeve:{sector40:{highWater:2000,paused:true,historicalHighWater:2000,operationalRisk:{triggerDate:date,requiresLiquidationEpoch:true,purchaseRiskReady:false,status:'awaiting-completed-liquidation'}}}};
 return {contract:'c1-private-account-v1',revision:7,adoption:{contract:'c1-prospective-account-adoption-v1',sourceSessionDate:source},
  records:[],sourceHashes:[],brokerageCash:{balance:2500,observedAt:date+'T14:30:00.000Z',source:'manual-broker-balance'},
  intradayActivity:{date,openingObservedAt:plan.observedAt,plan,tickets:[ticket],fills}};
}
const actual=account=>reconcile({plan:account.intradayActivity.plan,fills:account.intradayActivity.fills,observedAt:now.toISOString()});
const confirm=(account,proposalId=review({account,now})?.proposalId,patch={})=>correct({account,proposalId,confirmed:true,expectedRevision:account.revision,now,...patch});
const noReview=account=>assert.equal(review({account,now}),null,'Unsupported evidence cannot be guessed into a correction');
let count=0;
function check(name,run){run();count++;console.log('PASS '+name);}

check('raw saved evidence produces an explicit proposed allocation/basis comparison without mutation',()=>{
 const account=fixture(),before=hash(account),r=review({account,now});
 assert.equal(r.status,'confirmation-required');assert.equal(r.contract,contract);assert.match(r.proposalId,/^[a-f0-9]{64}$/);
 assert.equal(r.date,date);assert.equal(r.revision,7);assert.equal(r.rows.length,1);
 same(r.rows[0],{symbol:'ZZZ',shares:20,allocationsBefore:[{sleeve:'base',shares:6},{sleeve:'cooldown15',shares:10},{sleeve:'sector40',shares:4}],
  allocationsAfter:[{sleeve:'sector40',shares:20}],remainingShares:80,basisBefore:1992,basisAfter:1970});
 near(r.summary.fees,.4);near(r.summary.netProceeds,514.6);near(r.summary.cashBefore,3514.6);near(r.summary.cashAfter,3514.6);
 near(r.summary.remainingBasisBefore,2019);near(r.summary.remainingBasisAfter,1997);
 assert(r.limitations.some(text=>text.includes('old form selection')));assert(r.limitations.some(text=>text.includes('basis can change')));
 same(review({account:clone(account),now}),r,'Serialization does not fabricate or change a proposal identity');assert.equal(hash(account),before);
});

check('confirmation conserves broker economics and removes the fulfilled planned remainder',()=>{
 const account=fixture(),snapshot=clone(account),r=review({account,now}),next=confirm(account),result=actual(next);
 assert.equal(next.revision,8);assert.equal(next.intradayActivity.attributionCorrectionId,r.proposalId);
 same(next.intradayActivity.tickets,snapshot.intradayActivity.tickets);same(next.intradayActivity.plan,snapshot.intradayActivity.plan);
 same(next.records,snapshot.records);same(next.adoption,snapshot.adoption);same(next.brokerageCash,snapshot.brokerageCash);
 same(next.intradayActivity.fills,[{...account.intradayActivity.fills[0],shares:20,fee:.4}]);
 same(ids.map(id=>result.books[id].positions.ZZZ?.shares||0),[30,50,0]);same(result.books.base.positions.YYY,snapshot.intradayActivity.plan.openingBooks.base.positions.YYY);
 near(result.actualCash,3514.6);near(cash({account:next,strategyCash:result.actualCash,now}).executableCash,3014.6);
 near(result.books.base.cash,1000);near(result.books.cooldown15.cash,1000);near(result.books.sector40.cash,1514.6);
 const rest=remaining({plan:next.intradayActivity.plan,activity:next.intradayActivity,opening:{prices:[]},baseline:{},decision:{positions:[]},now});
 assert(!rest.orders.some(order=>order.side==='sell'&&!order.condition),'No second phantom planned liquidation remains');
 same(next.intradayActivity.plan.riskBySleeve,snapshot.intradayActivity.plan.riskBySleeve,'The correction cannot reset a risk reference or clear its original latch');
 same(account,snapshot,'Confirmation returns a new revision rather than mutating its input');
});

check('the append-only audit retains every original ticket/part and effective split',()=>{
 const account=fixture(),next=confirm(account),audit=next.saleAttributionCorrections[0];
 assert.equal(audit.contract,contract);assert.equal(audit.sourceRevision,7);assert.equal(audit.appliedRevision,8);
 assert.equal(audit.sourceDigest,hash(account));assert.equal(audit.originalPlanDigest,hash(account.intradayActivity.plan));
 same(audit.originalTickets,account.intradayActivity.tickets);same(audit.originalFills,account.intradayActivity.fills);same(audit.correctedFills,next.intradayActivity.fills);
 assert.equal(audit.ownerConfirmed,true);assert.equal(audit.brokerageExecutionCreated,false);assert(Object.isFrozen(audit.originalFills));
 assert.equal(correct({account:next,proposalId:audit.proposalId,confirmed:true,expectedRevision:7,now}),next,'An identical accepted proposal is a no-op before revision validation');
 assert.equal(correct({account:clone(next),proposalId:audit.proposalId,confirmed:true,expectedRevision:7,now}).revision,8,'Idempotency survives serialization');
 assert.equal(review({account:next,now}).status,'applied');assert.equal(next.saleAttributionCorrections.length,1);
});

check('multiple actual partial tickets preserve each execution while fulfilling the same original planned target',()=>{
 const account=fixture(),original=account.intradayActivity.tickets[0];
 const tickets=[{...original,id:'fictional-part-one',shares:8,fee:.16},
  {...original,id:'fictional-part-two',shares:12,price:26.10,fee:.24,executedAt:date+'T15:02:00.000Z'}];
 account.intradayActivity.tickets=tickets;
 account.intradayActivity.fills=tickets.flatMap((ticket,index)=>[
  ['sector40',2,target],['base',index?4:2,'fictional:base:stop:ZZZ'],['cooldown15',index?6:4,'fictional:cooldown15:stop:ZZZ']
 ].map(([sleeve,shares,orderId])=>({id:ticket.id+':'+sleeve,orderId,symbol:ticket.symbol,side:'sell',shares,price:ticket.price,
  fee:ticket.fee*shares/ticket.shares,executedAt:ticket.executedAt})));
 const before=clone(account),next=confirm(account);
 same(next.intradayActivity.tickets,tickets);same(next.intradayActivity.fills.map(fill=>[fill.orderId,fill.shares,fill.price,fill.fee,fill.executedAt]),
  tickets.map(ticket=>[target,ticket.shares,ticket.price,ticket.fee,ticket.executedAt]));
 near(actual(next).actualCash,3518.8);same(ids.map(id=>actual(next).books[id].positions.ZZZ?.shares||0),[30,50,0]);
 same(next.saleAttributionCorrections[0].originalFills,before.intradayActivity.fills);same(account,before);
});

check('missing confirmation, revision/proposal changes, later trades and rollover cannot apply a stale proposal',()=>{
 const account=fixture(),r=review({account,now}),snapshot=hash(account);
 assert.throws(()=>correct({account,proposalId:r.proposalId,expectedRevision:7,now}),/Confirm the planned-sale allocation correction before saving/);
 assert.throws(()=>confirm(account,r.proposalId,{expectedRevision:6}),/account changed.*reload/i);
 assert.throws(()=>confirm(account,'0'.repeat(64)),/correction changed.*reload/i);
 const changed=clone(account);changed.brokerageCash.balance=2400;
 assert.throws(()=>confirm(changed,r.proposalId),/correction changed.*reload/i);
 const later=clone(account),ticket={id:'fictional-later-sale',symbol:'YYY',side:'sell',shares:1,price:10,fee:.01,executedAt:date+'T15:03:00.000Z'};
 later.intradayActivity.plan.orders.push({id:'fictional:base:stop:YYY',sleeve:'base',date,symbol:'YYY',side:'sell',shares:3,condition:'stop-triggered',reason:'initial-stop'});
 later.intradayActivity.tickets.push(ticket);later.intradayActivity.fills.push({...ticket,id:ticket.id+':base',orderId:'fictional:base:stop:YYY'});
 assert.throws(()=>confirm(later,r.proposalId),/correction changed.*reload/i,'Even a new unrelated genuine sale invalidates the old proposal digest');
 assert.throws(()=>confirm(account,r.proposalId,{now:new Date('2026-11-27T17:00:00Z')}),/No eligible current-session/);
 assert.equal(hash(account),snapshot);
});

check('a completed-record rollover retains the audit and consumes only effective fills once',()=>{
 const account=confirm(fixture()),before=clone(account),close=new Date(date+'T23:00:00Z');
 // This calendar-only wrapper exercises the actual finalizer. No price,
 // signal, strategy result or completed market observation is invented.
 const book={universe:'sp500',model:{sessions:[{date:source},{date}]},captures:[{sessionDate:date,hash:'fictional-finalization-boundary',observedAt:close.toISOString()}]};
 const closed=finalize({account,book,now:close});assert(!closed.intradayActivity);assert.equal(closed.records.length,1);
 same(closed.records[0].fills,before.intradayActivity.fills);same(closed.records[0].executionEvidence,before.intradayActivity.plan);
 same(closed.saleAttributionCorrections,before.saleAttributionCorrections);
 const result=reconcile({plan:closed.records[0].executionEvidence,fills:closed.records[0].fills,observedAt:close.toISOString()});
 near(result.actualCash,3514.6);same(ids.map(id=>result.books[id].positions.ZZZ?.shares||0),[30,50,0]);
 near(cash({account:closed,strategyCash:result.actualCash,now:close}).brokerageCash,3014.6,'The archived original parts are not counted as new cash activity');
 same(finalize({account:closed,book,now:close}),closed);assert.equal(confirm(closed,before.intradayActivity.attributionCorrectionId),closed);
 same(account,before,'Finalization cannot mutate the correction audit or its source activity');
 const old=fixture();old.records=[{date,complete:true,fills:[]}];noReview(old);
});

check('later normal detail corrections use the effective split and keep the original audit intact',()=>{
 const applied=confirm(fixture()),audit=clone(applied.saleAttributionCorrections),ticket=applied.intradayActivity.tickets[0];
 const next=details({account:applied,ticketId:ticket.id,price:25.50,fee:.50,executedAt:date+'T15:02:00.000Z',expectedRevision:applied.revision,now});
 same(next.saleAttributionCorrections,audit);assert.equal(next.intradayActivity.fills.length,1);
 assert.equal(next.intradayActivity.fills[0].orderId,target);near(actual(next).actualCash,3509.5);
 assert.equal(review({account:next,now}).status,'applied');assert.equal(confirm(next,audit[0].proposalId),next);
});

check('genuine stops, profit exits, owner exits and unrelated stocks are not selected for recovery',()=>{
 for(const reason of ['initial-stop','recent-momentum-profit-protection','owner-discretionary-exit']){
  const account=fixture();account.intradayActivity.plan.orders[0].reason=reason;
  if(reason==='owner-discretionary-exit')account.intradayActivity.tickets[0].recordingReason=reason;
  noReview(account);
 }
 const explicit=fixture();explicit.intradayActivity.tickets[0].saleSelection={kind:'planned',orderIds:[target]};noReview(explicit);
 const mixed=fixture(),ticket={id:'fictional-independent-stop',symbol:'YYY',side:'sell',shares:1,price:10,fee:.02,executedAt:date+'T15:03:00.000Z'};
 mixed.intradayActivity.plan.orders.push({id:'fictional:base:stop:YYY',sleeve:'base',date,symbol:'YYY',side:'sell',shares:3,reason:'initial-stop',condition:'stop-triggered'});
 mixed.intradayActivity.tickets.push(ticket);mixed.intradayActivity.fills.push({...ticket,id:ticket.id+':base',orderId:'fictional:base:stop:YYY'});
 const r=review({account:mixed,now});same(r.rows.map(row=>row.symbol),['ZZZ']);
 const next=confirm(mixed);same(next.intradayActivity.fills.at(-1),mixed.intradayActivity.fills.at(-1));
 same(actual(next).books.base.positions.YYY,actual(mixed).books.base.positions.YYY);
});

check('partial targets, buys, multiple affected allocations and non-flat recovery remain unavailable',()=>{
 const partial=fixture();partial.intradayActivity.tickets[0].shares=10;partial.intradayActivity.fills[0].shares=2;partial.intradayActivity.fills[1].shares=3;partial.intradayActivity.fills[2].shares=5;noReview(partial);
 const bought=fixture();bought.intradayActivity.tickets[0].side='buy';noReview(bought);
 const twoGroups=fixture();twoGroups.intradayActivity.plan.orders.push({id:'fictional:base:planned:ZZZ',sleeve:'base',date,symbol:'ZZZ',side:'sell',shares:30,reason:'portfolio-drawdown-stop'});noReview(twoGroups);
 const notFlat=fixture();notFlat.intradayActivity.plan.openingBooks.sector40.positions.XXX={shares:1,avgCost:10,openedAt:'2026-11-18'};noReview(notFlat);
 const notFull=fixture();notFull.intradayActivity.plan.orders[0].shares=21;noReview(notFull);
 const alreadyCorrect=fixture(),ticket=alreadyCorrect.intradayActivity.tickets[0];alreadyCorrect.intradayActivity.fills=[{...ticket,id:ticket.id+':sector40',orderId:target}];noReview(alreadyCorrect);
 const wrongAllocation=fixture();wrongAllocation.intradayActivity.plan.orders.find(order=>order.id==='fictional:base:stop:ZZZ').condition=undefined;noReview(wrongAllocation);
});

check('malformed or mismatched historical facts do not break a normal read or create a correction',()=>{
 const mutations=[
  account=>account.intradayActivity.fills[0].price++,account=>account.intradayActivity.fills[0].fee+=.01,
  account=>account.intradayActivity.fills[0].executedAt=date+'T15:02:00Z',account=>account.intradayActivity.fills[0].shares++,
  account=>account.intradayActivity.fills[0].orderId='client-invented',account=>account.intradayActivity.fills[0].id='unmatched-ticket',
  account=>account.intradayActivity.fills.push(clone(account.intradayActivity.fills[0])),
  account=>account.intradayActivity.tickets.push(clone(account.intradayActivity.tickets[0])),
  account=>{account.intradayActivity.tickets[0].executedAt=date+'T22:00:00.000Z';for(const fill of account.intradayActivity.fills)fill.executedAt=date+'T22:00:00.000Z';},
  account=>account.intradayActivity.plan.sourceSessionDate='2026-11-20',account=>account.intradayActivity.plan.openingBooks=null,
  account=>account.saleAttributionCorrections={},account=>account.intradayActivity.tickets=null,
  account=>account.saleAttributionCorrections=[{contract,date,proposalId:'f'.repeat(64)}],
  account=>account.saleAttributionCorrections=[{contract,date,proposalId:'f'.repeat(64),summary:{}}]
 ];
 for(const mutate of mutations){const account=fixture();mutate(account);const before=hash(account);noReview(account);assert.equal(hash(account),before);}
 assert.equal(review({account:fixture(),now:new Date('invalid')}),null);assert.equal(review({account:null,now}),null);
});

console.log(`PASS: ${count} fictional owner-reviewed sale-attribution recovery cases; conserved economics, disclosed basis, full target binding, immutable append-only audit, one-time finalization, idempotency and unsupported-case rejection. No live data or writes.`);
