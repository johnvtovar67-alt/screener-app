// Independent adversarial authorization checks through the production resolver,
// cash/exposure cap and actual intraday reconciliation. All data are synthetic.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const normal=createResearchModuleLoader(process.cwd());
const config=normal.load('lib/c1OperationalRiskDecision.js');
assert.equal(config.C1_OPERATIONAL_RISK_DECISION.status,'approved','Real default uses the explicit owner-approved operational rule');
assert.equal(config.C1_OPERATIONAL_RISK_DECISION.mode,config.C1_OPERATIONAL_RISK_MODE);
const approved=normal;
// Preserve a separate adverse pending-server scenario. A serialized plan still
// cannot override a server decision, even though the actual default is approved.
const pendingServer=createResearchModuleLoader(process.cwd(),{'lib/c1OperationalRiskDecision.js':{
 C1_OPERATIONAL_RISK_MODE:config.C1_OPERATIONAL_RISK_MODE,
 C1_OPERATIONAL_RISK_DECISION:Object.freeze({status:'pending-owner-decision',mode:null})
}});
const {resolveC1AccountActions:resolve,capC1AccountExposure:capExposure}=approved.load('lib/c1AccountActions.js');
const cap=approved.load('lib/c1ExecutionCashAuthority.js').capC1ExecutionCash;
const record=approved.load('lib/c1IntradayActivity.js').recordC1IntradayActivity;
const pendingCap=pendingServer.load('lib/c1ExecutionCashAuthority.js').capC1ExecutionCash;
const pendingRecord=pendingServer.load('lib/c1IntradayActivity.js').recordC1IntradayActivity;
const ids=['base','cooldown15','sector40'],date='2026-11-11',now=new Date(date+'T16:10:00Z');
const policy={active:true,version:'c1-account-policy-v2',complete:true,blockedSymbols:[],identity:'synthetic-approved-policy'};
const book=()=>Object.fromEntries(ids.map(id=>[id,{cash:1000,positions:{}}]));
const account=()=>({contract:'c1-private-account-v1',revision:0,adoption:{contract:'c1-prospective-account-adoption-v1',
 sourceSessionDate:'2026-11-10',actualCash:3000,actualSwingEquity:3000,
 seeds:Object.fromEntries(ids.map(id=>[id,{sleeve:id,cash:1000,positions:[],actualDollarsPerModelDollar:1}]))},records:[],
 brokerageCash:{balance:3000,observedAt:date+'T15:30:00Z',source:'manual-broker-balance'}});
const order=(symbol,sleeve='base',shares=4,extra={})=>({id:symbol+':'+sleeve,symbol,sleeve,shares,side:'buy',estimatedPrice:100,reason:'Buy',...extra});
const limits=(holdings=[],candidates={})=>({holdings,candidates,maxPositionPct:1/3,maxSectorValue:1500,maxSectorPositions:2,maxIssuerPositions:1,maxDistinctPositions:4});
const exposure=()=>limits([],{AAA:{sector:'Technology',issuer:'issuer-A',price:100},BBB:{sector:'Healthcare',issuer:'issuer-B',price:100},CCC:{sector:'Energy',issuer:'issuer-C',price:100}});
const plan=()=>({contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-10',observedAt:date+'T15:45:00Z',
 purchaseFundingPolicy:'brokerage-cash-only-v1',openingBooks:book(),projectedBooks:book(),
 accountPolicy:{...policy,operationalRiskDecision:{status:'approved',mode:config.C1_OPERATIONAL_RISK_MODE}},accountExposure:exposure(),
 riskBySleeve:Object.fromEntries(ids.map(id=>[id,{highWater:1000,paused:false,operationalRisk:{purchaseRiskReady:true,decisionRequired:false,status:'active'}}])),
 orders:[order('AAA'),order('BBB','cooldown15'),order('AAA','base',4,{id:'protective-stop',side:'sell',estimatedPrice:90,condition:'stop-triggered',reason:'initial-stop'})]});
const ticket=(id,symbol,side,shares,minute,extra={})=>({id,symbol,side,shares,price:100,fee:0,executedAt:date+`T16:${minute}:00Z`,...extra});
let cases=0;
function check(name,fn){fn();cases++;console.log('PASS '+name);}

check('serialized approval cannot override the actual pending server decision',()=>{
 const a=account(),p=plan(),before=JSON.stringify(a);
 const result=pendingCap({plan:p,account:{...a,operationalRiskDecision:{status:'approved'}},strategyCash:3000,now});
 assert.equal(result.orders.filter(o=>o.side==='buy').length,0);
 assert.match(result.policyPublicationStatus,/operational-risk-decision-pending/);
 assert.throws(()=>pendingRecord({account:a,plan:p,ticket:ticket('forged','AAA','buy',1,'01'),expectedRevision:0,now}),/remaining C1 quantity/);
 assert.equal(JSON.stringify(a),before);
});
check('conditional stops do not create an unconditional account exit',()=>{
 const result=resolve({accountPolicy:policy,positions:[{symbol:'AAA',exits:[{shares:4,condition:'stop-triggered'}]}],
  orders:[order('AAA'),order('AAA','sector40',4,{side:'sell',condition:'stop-triggered',reason:'initial-stop'})]});
 assert.equal(result.activeExitSymbols.length,0);
 assert(result.orders.some(o=>o.side==='buy'));
 assert.equal(result.accountActions.length,1);assert.equal(result.accountActions[0].side,'buy');
});
check('protective Sell survives conflicting Buy without quantity netting',()=>{
 const result=resolve({accountPolicy:policy,orders:[order('AAA','base',2,{side:'sell',reason:'initial-stop'}),order('AAA','sector40',3)]});
 assert.equal(result.accountActions.length,1);assert.equal(result.accountActions[0].side,'sell');assert.equal(result.accountActions[0].shares,2);
 assert.equal(result.blockedOrders[0].shares,3);
});
check('Add cannot bypass an existing account issuer alias conflict',()=>{
 const holdings=[{symbol:'AAA',sector:'S1',issuer:'same',price:100},{symbol:'ALIAS',sector:'S2',issuer:'same',price:100}];
 const result=capExposure({orders:[order('AAA','base',1)],openingBooks:{base:{positions:{AAA:{shares:1},ALIAS:{shares:1}}}},brokerageCash:3000,
  exposure:limits(holdings,{AAA:{sector:'S1',issuer:'same',price:100}})});
 assert.equal(result.blockedOrders[0].blockReason,'account-issuer-limit');
});
check('Add cannot bypass a preexisting sector-count violation',()=>{
 const holdings=['AAA','BBB','CCC'].map(symbol=>({symbol,sector:'same-sector',issuer:symbol,price:100}));
 const result=capExposure({orders:[order('AAA','base',1)],openingBooks:{base:{positions:Object.fromEntries(holdings.map(h=>[h.symbol,{shares:1}]))}},brokerageCash:3000,
  exposure:limits(holdings,{AAA:{sector:'same-sector',issuer:'AAA',price:100}})});
 assert.equal(result.blockedOrders[0].blockReason,'account-sector-position-limit');
});
check('candidate metadata cannot relabel existing sector or issuer exposure',()=>{
 for(const candidate of [{sector:'Changed',issuer:'A',price:100},{sector:'Technology',issuer:'Changed',price:100}]){
  const result=capExposure({orders:[order('AAA','base',1)],openingBooks:{base:{positions:{AAA:{shares:1}}}},brokerageCash:3000,
   exposure:limits([{symbol:'AAA',sector:'Technology',issuer:'A',price:100}],{AAA:candidate})});
  assert.equal(result.blockedOrders[0].blockReason,'account-exposure-unverified');
 }
});
check('missing captured quote cannot be fabricated from purchase cost basis',()=>{
 const result=capExposure({orders:[order('BBB','base',1)],openingBooks:{base:{positions:{AAA:{shares:1,avgCost:100}}}},brokerageCash:3000,
  exposure:limits([],{AAA:{sector:'Technology',issuer:'A'},BBB:{sector:'Healthcare',issuer:'B',price:100}})});
 assert.equal(result.blockedOrders[0].blockReason,'account-exposure-unverified');
});
check('four distinct stocks are counted across allocations, not allocation rows',()=>{
 const holdings=['AAA','BBB','CCC','DDD'].map(symbol=>({symbol,sector:symbol,issuer:symbol,price:100}));
 const result=capExposure({orders:[order('EEE','sector40',1)],openingBooks:{base:{positions:{AAA:{shares:1},BBB:{shares:1}}},cooldown15:{positions:{CCC:{shares:1},DDD:{shares:1}}}},brokerageCash:3000,
  exposure:limits(holdings,{EEE:{sector:'EEE',issuer:'EEE',price:100}})});
 assert.equal(result.blockedOrders[0].blockReason,'account-position-limit');
 const permitted=capExposure({orders:[order('BBB','sector40',1)],openingBooks:Object.fromEntries(ids.map(id=>[id,{positions:{AAA:{shares:1}}}])),brokerageCash:3000,
  exposure:limits([holdings[0]],{BBB:{sector:'BBB',issuer:'BBB',price:100}})});
 assert.equal(permitted.orders.length,1);
});

let actual=account();const originalPlan=plan();
check('first recorded partial purchase reconciles exactly',()=>{
 actual=record({account:actual,plan:originalPlan,ticket:ticket('first','AAA','buy',2,'01',{fee:1}),expectedRevision:actual.revision,now});
 assert.equal(actual.intradayActivity.fills[0].shares,2);assert.equal(actual.intradayActivity.fills[0].fee,1);
});
check('fresh Sell blocks an old captured unfilled Buy without erasing posted fills',()=>{
 const before=JSON.stringify(actual),fresh={...originalPlan,activeExitSymbols:['AAA'],orders:[...originalPlan.orders,
  order('AAA','base',2,{id:'fresh-sell',side:'sell',reason:'recent-momentum-deterioration'})]};
 assert.throws(()=>record({account:actual,plan:fresh,ticket:ticket('must-reject','AAA','buy',1,'02'),expectedRevision:actual.revision,now}),/remaining C1 quantity/);
 assert.equal(JSON.stringify(actual),before);
});
check('second ticket uses verified captured candidate marks for the first posted holding',()=>{
 actual=record({account:actual,plan:originalPlan,ticket:ticket('second','BBB','buy',3,'03'),expectedRevision:actual.revision,now});
 assert.equal(actual.intradayActivity.fills.length,2);
 assert.equal(actual.intradayActivity.fills.reduce((sum,f)=>sum+f.shares*f.price+f.fee,0),501);
});
check('a conditional-only protective stop permits the remaining valid Add',()=>{
 actual=record({account:actual,plan:originalPlan,ticket:ticket('add','AAA','buy',1,'04',{price:101}),expectedRevision:actual.revision,now});
 assert.equal(actual.intradayActivity.fills.filter(f=>f.symbol==='AAA').reduce((sum,f)=>sum+f.shares,0),3);
});
check('completed actual loss blocks another allocation despite a forged cleared policy',()=>{
 actual=record({account:actual,plan:originalPlan,ticket:ticket('loss','AAA','sell',3,'05',{price:90,fee:1,recordingReason:'owner-discretionary-exit'}),expectedRevision:actual.revision,now});
 const other={...originalPlan,accountPolicy:{...policy,blockedSymbols:[]},orders:[order('AAA','sector40',1)]};
 const result=cap({account:actual,plan:other,strategyCash:2667,now});
 assert(result.accountPolicy.blockedSymbols.includes('AAA'));
 assert.equal(result.orders.filter(o=>o.side==='buy'&&o.symbol==='AAA').length,0);
 const period=result.accountPolicy.stockCooldowns.find(row=>row.symbol==='AAA');
 assert.equal(period.netRealizedPnl,-33);assert.equal(period.durationSessions,10);assert.equal(period.triggerDate,date);
});
check('completed historical fact authority cannot be serialized or reused after mutation',()=>{
 const {createC1ActualFillReplay:create,markC1ReconciledAccountFill:mark}=approved.load('lib/c1ActualFillReplay.js');
 const source={symbol:'AAA',sector:'Technology',issuer:'A'};
 const fill={id:'completed-fact',orderId:'original-order',symbol:'AAA',side:'buy',reason:'Buy',shares:1,price:100,fee:0,executedAt:date+'T16:00:00Z'};
 const input=f=>({contract:'c1-actual-fill-replay-v1',sessions:[{date,fills:[f]}]});
 const seed={asOfSession:'2026-11-10',sleeve:'base'},sessions=[{date:'2026-11-10'},{date}];
 const fake={...fill,reconciledAccountFill:true,sourceSignal:source};
 assert.equal(create(input(fake),seed,sessions).reconciledAccountExecutions(date).length,0,'A serialized trust flag has no authority');
 mark(fill,date,source);
 assert.equal(create(input(fill),seed,sessions).reconciledAccountExecutions(date).length,1,'Original ledger capability admits the exact individual fact');
 assert.equal(create(input(clone(fill)),seed,sessions).reconciledAccountExecutions(date).length,0,'Serialization drops request-local capability');
 fill.fee=.01;
 assert.equal(create(input(fill),seed,sessions).reconciledAccountExecutions(date).length,0,'Changing any reconciled economics invalidates the original capability');
});
assert.equal(normal.load('lib/c1OperationalRiskDecision.js').C1_OPERATIONAL_RISK_DECISION.status,'approved','The adverse pending test fixture cannot alter actual owner approval');
console.log(`PASS: ${cases} independent account-policy authorization cases through real resolver, exposure/cash caps and intraday recording; synthetic software evidence only.`);
