// Fictional recording examples only. Exercise the actual recorder, remaining
// plan and React save payload; no provider, account store or brokerage is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {recordC1IntradayActivity:record,c1IntradayRemainingPlan:remaining}=loader.load('lib/c1IntradayActivity.js');
const {reconcileC1ActualAccountFills:reconcile}=loader.load('lib/c1AccountLedger.js');
const {c1AccountCashAvailability:cash}=loader.load('lib/c1BrokerageCash.js');
const copy=value=>JSON.parse(JSON.stringify(value)),same=(actual,expected,message)=>assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);
const near=(actual,expected,message)=>assert(Math.abs(actual-expected)<1e-8,message||`${actual} differs from ${expected}`);
const ids=['base','cooldown15','sector40'],date='2026-11-25',now=new Date(date+'T17:00:00Z');
const plannedId='fictional:sector40:planned:ZZZ',stopIds=['fictional:base:stop:ZZZ','fictional:cooldown15:stop:ZZZ'];
const selection=(kind,orderIds)=>({kind,orderIds:[...orderIds]});
function fixture(){
 const openingBooks=Object.fromEntries(ids.map((id,index)=>[id,{cash:1000,positions:{ZZZ:{shares:[30,50,20][index],avgCost:24,openedAt:'2026-11-18'}}}]));
 const orders=[{id:plannedId,sleeve:'sector40',date,symbol:'ZZZ',side:'sell',shares:20,estimatedPrice:25,reason:'portfolio-drawdown-stop'},
  ...ids.map((sleeve,index)=>({id:`fictional:${sleeve}:stop:ZZZ`,sleeve,date,symbol:'ZZZ',side:'sell',shares:[30,50,20][index],estimatedPrice:21,reason:'initial-stop',condition:'stop-triggered'}))];
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:'2026-11-24',observedAt:date+'T14:45:00Z',
  purchaseFundingPolicy:'brokerage-cash-only-v1',openingBooks,orders,
  accountPolicy:{version:'c1-account-policy-v2',active:true,complete:true,blockedSymbols:[]},
  riskBySleeve:{sector40:{highWater:4000,paused:true,operationalRisk:{requiresLiquidationEpoch:true,purchaseRiskReady:false,status:'awaiting-completed-liquidation',triggerDate:date}}}};
 const account={contract:'c1-private-account-v1',revision:0,records:[],
  brokerageCash:{balance:2500,observedAt:date+'T14:30:00Z',source:'manual-broker-balance'}};
 return {plan,account};
}
const ticket=(id='fictional-planned-sale',shares=20,extra={})=>({id,symbol:'ZZZ',side:'sell',shares,price:25.75,fee:.37,executedAt:date+'T15:01:00Z',saleSelection:selection('planned',[plannedId]),...extra});
const save=(account,plan,value)=>record({account,plan,ticket:value,expectedRevision:account.revision,now});
const actual=account=>reconcile({plan:account.intradayActivity.plan,fills:account.intradayActivity.fills,observedAt:now.toISOString()});
const rest=(plan,account)=>remaining({plan,activity:account.intradayActivity,opening:{prices:[]},baseline:{},decision:{positions:[]},now});
const quantity=(books,id)=>books[id].positions.ZZZ?.shares||0;
const plannedOrders=plan=>plan.orders.filter(order=>order.symbol==='ZZZ'&&order.side==='sell'&&!order.condition&&order.reason!=='owner-discretionary-exit');
let cases=0;
function check(name,run){run();cases++;console.log('PASS '+name);}
function rejected(account,plan,value,pattern=/selected sale|sale selection|select.*sale|reload/i){
 const before=JSON.stringify({account,plan});
 let failure;assert.throws(()=>{try{return save(account,plan,value);}catch(error){failure=error;throw error;}},pattern);
 same(JSON.stringify({account,plan}),before,'Rejected attribution cannot mutate the account or captured plan');
 return failure;
}

check('a selected planned sale consumes only its unconditional allocation and preserves actual cash/fees',()=>{
 const {account,plan}=fixture(),before=copy({account,plan}),value=ticket(),saved=save(account,plan,value),result=actual(saved);
 same(result.fills.map(fill=>[fill.orderId,fill.shares,fill.price,fill.fee]),[[plannedId,20,25.75,.37]]);
 same(ids.map(id=>quantity(result.books,id)),[30,50,0]);
 same(saved.intradayActivity.tickets[0],value,'The exact selected ticket is retained for identity/idempotency');
 near(result.books.sector40.cash,1514.63);near(result.books.base.cash,1000);near(result.books.cooldown15.cash,1000);
 near(result.actualCash,3514.63);near(cash({account:saved,strategyCash:result.actualCash,now}).executableCash,3014.63);
 same(saved.brokerageCash,account.brokerageCash,'A recorded sale does not rewrite the manually observed cash balance');
 same(plannedOrders(rest(plan,saved)),[],'A completely recorded planned liquidation cannot leave a phantom planned remainder');
 same({account,plan},before,'Returning the new revision cannot mutate original financial evidence');
});

check('selected conditional stop fills affect only the exact available stop group',()=>{
 const {account,plan}=fixture();
 const saved=save(account,plan,ticket('fictional-stop',16,{saleSelection:selection('stop',stopIds),price:20,fee:.16})),result=actual(saved);
 same(result.fills.map(fill=>[fill.orderId,fill.shares]),[[stopIds[0],6],[stopIds[1],10]]);
 same(ids.map(id=>quantity(result.books,id)),[24,40,20]);
 same(plannedOrders(rest(plan,saved)).map(order=>[order.id,order.shares]),[[plannedId,20]],'A chosen other-allocation stop must not fill the sector planned order');
 near(result.actualCash,3319.84);near(cash({account:saved,strategyCash:result.actualCash,now}).executableCash,2819.84);
 near(result.fills.reduce((sum,fill)=>sum+fill.fee,0),.16);
});

check('partials, explicit retries and overfills keep the selected order identity',()=>{
 const {account,plan}=fixture(),first=ticket('fictional-part-one',7,{fee:.19}),partial=save(account,plan,first),partialBytes=copy(partial);
 same(plannedOrders(rest(plan,partial)).map(order=>order.shares),[13]);
 assert.equal(record({account:partial,plan,ticket:first,expectedRevision:0,now}),partial,'An identical retry acknowledges the existing fact without another revision');
 rejected(partial,plan,{...first,saleSelection:selection('stop',stopIds)},/Conflicting trade reference/);
 rejected(partial,plan,ticket('fictional-too-large',14),/remaining|selected sale|quantity/i);
 const completed=save(partial,plan,ticket('fictional-part-two',13,{fee:.31,executedAt:date+'T15:02:00Z'}));
 same(completed.intradayActivity.fills.slice(0,partial.intradayActivity.fills.length),partial.intradayActivity.fills,'The second fill cannot reassign a prior execution');
 same(plannedOrders(rest(plan,completed)),[]);same(ids.map(id=>quantity(actual(completed).books,id)),[30,50,0]);
 near(actual(completed).actualCash,3514.50);near(cash({account:completed,strategyCash:actual(completed).actualCash,now}).executableCash,3014.50);
 rejected(completed,plan,ticket('fictional-after-full',1));
 same(partial,partialBytes,'Later calls cannot mutate an accepted earlier revision');
});

check('unknown, wrong-side, wrong-symbol, duplicate and cross-kind identities cannot direct attribution',()=>{
 const {account,plan}=fixture();
 plan.openingBooks.base.positions.YYY={shares:3,avgCost:10,openedAt:'2026-11-18'};
 plan.orders.push({id:'fictional:base:stop:YYY',sleeve:'base',date,symbol:'YYY',side:'sell',shares:3,estimatedPrice:9,reason:'initial-stop',condition:'stop-triggered'},
  {id:'fictional:base:buy:ZZZ',sleeve:'base',date,symbol:'ZZZ',side:'buy',shares:1,estimatedPrice:25,reason:'Buy'});
 for(const choice of [
  selection('planned',['client-invented-order']),selection('planned',[plannedId,plannedId]),
  selection('planned',[stopIds[0]]),selection('stop',[plannedId]),
  selection('planned',['fictional:base:stop:YYY']),selection('planned',['fictional:base:buy:ZZZ']),
  selection('planned',[plannedId,stopIds[0]]),selection('stop',[...stopIds,'fictional:sector40:stop:ZZZ']),
  selection('other',[plannedId]),selection('planned',[]),{kind:'planned',orderIds:'not-an-array'},
  {kind:'planned',orderIds:[plannedId],sourceSessionDate:plan.sourceSessionDate},
  {kind:'planned',orderIds:[plannedId],sleeve:'base'},[],{},false,'planned'
 ])rejected(account,plan,ticket('fictional-invalid',1,{saleSelection:choice}));
 rejected(account,plan,ticket('fictional-spoofed-source',1,{saleSelection:{kind:'planned',orderIds:['client-invented-order'],
  sourceSessionDate:plan.sourceSessionDate,orders:[{...plan.orders[0],id:'client-invented-order'}]}}));
 rejected(account,plan,ticket('fictional-owner-with-selection',1,{recordingReason:'owner-discretionary-exit'}));
 rejected(account,plan,ticket('fictional-buy-with-selection',1,{side:'buy'}));
});

check('the whole current UI group is required rather than a client-selected allocation subset',()=>{
 const {account,plan}=fixture(),secondId='fictional:base:planned:ZZZ';
 plan.orders.push({id:secondId,sleeve:'base',date,symbol:'ZZZ',side:'sell',shares:10,estimatedPrice:25,reason:'portfolio-drawdown-stop'});
 rejected(account,plan,ticket('fictional-subset',5));
 const saved=save(account,plan,ticket('fictional-whole-group',30,{saleSelection:selection('planned',[secondId,plannedId]),fee:.30}));
 same(actual(saved).fills.map(fill=>[fill.orderId,fill.shares]),[[plannedId,20],[secondId,10]],'Client ID order cannot reorder the server allocation priority');
 same(ids.map(id=>quantity(actual(saved).books,id)),[20,50,0]);
 near(actual(saved).fills.reduce((sum,fill)=>sum+fill.fee,0),.30);
});

check('an ambiguous legacy normal sale fails closed while unambiguous legacy clients remain usable',()=>{
 const {account,plan}=fixture(),legacy=ticket('fictional-legacy',20);delete legacy.saleSelection;
 const conflict=rejected(account,plan,legacy,/reload|select.*sale|selected sale/i);
 const response=loader.load('lib/c1ApiErrors.js').c1AccountApiFailure(conflict);
 assert.equal(response.status,409);assert.equal(response.retryable,false);assert.equal(response.error,conflict.message,'The real safe API boundary retains the actionable reload explanation without replaying a financial POST');
 const invalid=rejected(account,plan,ticket('fictional-malformed-selection',1,{saleSelection:{kind:'unknown',orderIds:[plannedId]}}));
 assert.equal(loader.load('lib/c1ApiErrors.js').c1AccountApiFailure(invalid).status,422,'Malformed attribution remains a validation failure rather than a generic account-analysis error');
 const plannedOnly={...plan,orders:plan.orders.filter(order=>!order.condition)},planned=save(account,plannedOnly,legacy);
 same(actual(planned).fills.map(fill=>[fill.orderId,fill.shares]),[[plannedId,20]]);
 const stopOnly={...plan,orders:plan.orders.filter(order=>order.condition)},stopped=save(account,stopOnly,{...legacy,id:'fictional-legacy-stop',shares:10,fee:.10});
 same(ids.map(id=>quantity(actual(stopped).books,id)),[27,45,18]);
 const otherSymbol={...copy(plannedOnly),orders:[...plannedOnly.orders,{id:'fictional:base:stop:YYY',sleeve:'base',date,symbol:'YYY',side:'sell',shares:1,condition:'stop-triggered'}]};
 otherSymbol.openingBooks.base.positions.YYY={shares:1,avgCost:10,openedAt:'2026-11-18'};
 same(actual(save(account,otherSymbol,{...legacy,id:'fictional-unrelated-stop'})).fills.map(fill=>fill.orderId),[plannedId],'An unrelated stock stop cannot make this sale ambiguous');
});

check('explicit owner-discretionary exits retain their separate all-allocation proportional behavior',()=>{
 const {account,plan}=fixture(),value=ticket('fictional-owner',10,{recordingReason:'owner-discretionary-exit',fee:.10});delete value.saleSelection;
 const saved=save(account,plan,value),result=actual(saved);
 same(result.fills.map(fill=>[saved.intradayActivity.plan.orders.find(order=>order.id===fill.orderId).sleeve,fill.shares]),[['base',3],['cooldown15',5],['sector40',2]]);
 assert(result.fills.every(fill=>saved.intradayActivity.plan.orders.find(order=>order.id===fill.orderId).reason==='owner-discretionary-exit'));
 same(plannedOrders(rest(plan,saved)).map(order=>order.shares),[18],'An explicit other sale is distinct from confirming the original planned allocation exit');
 near(result.actualCash,3257.40);
});

check('already recorded legacy tickets and fill allocations are preserved without automatic historical migration',()=>{
 const {account,plan}=fixture(),oldTicket=ticket('fictional-already-recorded',10,{price:25.40,fee:.10});delete oldTicket.saleSelection;
 const oldFills=[
  {id:oldTicket.id+':base',orderId:stopIds[0],symbol:'ZZZ',side:'sell',shares:3,price:25.40,fee:.03,executedAt:oldTicket.executedAt},
  {id:oldTicket.id+':cooldown15',orderId:stopIds[1],symbol:'ZZZ',side:'sell',shares:5,price:25.40,fee:.05,executedAt:oldTicket.executedAt},
  {id:oldTicket.id+':sector40',orderId:plannedId,symbol:'ZZZ',side:'sell',shares:2,price:25.40,fee:.02,executedAt:oldTicket.executedAt}];
 const prior={...account,revision:1,intradayActivity:{date,openingObservedAt:plan.observedAt,plan:copy(plan),tickets:[oldTicket],fills:oldFills}},snapshot=copy(prior);
 assert.equal(record({account:prior,plan,ticket:oldTicket,expectedRevision:0,now}),prior,'An old identical ticket remains idempotent despite lacking new metadata');
 const next=save(prior,plan,ticket('fictional-new-selected',18,{executedAt:date+'T15:03:00Z'}));
 same(next.intradayActivity.tickets[0],snapshot.intradayActivity.tickets[0]);
 same(next.intradayActivity.fills.slice(0,oldFills.length),snapshot.intradayActivity.fills,'A new selected trade cannot repair or rewrite prior fill attribution');
 same(next.intradayActivity.plan.openingBooks,snapshot.intradayActivity.plan.openingBooks);
 same(ids.map(id=>quantity(actual(next).books,id)),[27,45,0]);same(plannedOrders(rest(plan,next)),[]);
 same(prior,snapshot,'Historical evidence stays byte-identical in its prior revision');
});

check('a stale selected stop ID is rejected after that slice was already filled',()=>{
 const {account,plan}=fixture(),old={id:'fictional-old-stop',symbol:'ZZZ',side:'sell',shares:30,price:20,fee:.30,executedAt:date+'T15:00:00Z'};
 const prior={...account,revision:1,intradayActivity:{date,openingObservedAt:plan.observedAt,plan:copy(plan),tickets:[old],fills:[
  {id:old.id+':base',orderId:stopIds[0],symbol:'ZZZ',side:'sell',shares:30,price:20,fee:.30,executedAt:old.executedAt}]}};
 rejected(prior,plan,ticket('fictional-stale-group',1,{saleSelection:selection('stop',stopIds)}));
 const next=save(prior,plan,ticket('fictional-current-stop-group',5,{saleSelection:selection('stop',[stopIds[1]])}));
 same(next.intradayActivity.fills.at(-1).orderId,stopIds[1]);same(ids.map(id=>quantity(actual(next).books,id)),[0,45,20]);
});

check('a later client plan cannot replace captured original order identities or shift an earlier fill',()=>{
 const {account,plan}=fixture(),first=save(account,plan,ticket('fictional-first-captured',5)),before=copy(first);
 const later={...copy(plan),orders:plan.orders.map(order=>order.id===plannedId?{...order,id:'fictional:later:planned:ZZZ',sleeve:'base'}:order)};
 rejected(first,later,ticket('fictional-shifted-source',5,{saleSelection:selection('planned',['fictional:later:planned:ZZZ'])}));
 same(first,before,'A rejected later ID cannot replace prior tickets, fills, original books or captured source plan');
});

// Run real React hooks and event closures, as in the existing completed-add
// form regression. The onSave callback uses the real recorder above.
async function uiChecks(){
 const React=require('react'),babel=require('next/dist/compiled/babel/core');let active;
 const mockReact={...React,useMemo:calculate=>calculate(),useState:initial=>{
  const index=active.index++;if(!(index in active.state))active.state[index]=typeof initial==='function'?initial():initial;
  return [active.state[index],value=>{active.state[index]=typeof value==='function'?value(active.state[index]):value;}];
 }};
 const file=path.resolve('components/C1IntradayActivity.js'),compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code,moduleRecord={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='react'?mockReact:name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),moduleRecord,moduleRecord.exports);
 const Component=moduleRecord.exports.default;
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];
 const text=node=>node==null||typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node.props?.children).map(text).join('');
 function form(){
  const {account:initialAccount,plan}=fixture(),state={state:[],index:0},calls=[];let account=initialAccount;
  const session={date,revision:0,plan,fills:[],tickets:[]};
  const onSave=async(value,revision)=>{assert.equal(revision,account.revision);calls.push(copy(value));account=save(account,plan,value);return {ticket:value,view:{decision:{brokerageCash:cash({account,strategyCash:actual(account).actualCash,now}).brokerageCash}}};};
  const render=()=>{active=state;state.index=0;return Component({session,onSave,busy:false});};
  const find=predicate=>{const node=nodes(render()).find(predicate);assert(node,'Expected actual recorder form element');return node;};
  return {calls,session,render,get account(){return account;},
   options:()=>nodes(render()).filter(node=>node.type==='option').map(node=>({value:node.props.value,label:text(node)})),
   choose(value){find(node=>node.type==='select').props.onChange({target:{value}});},
   enter(label,value){find(node=>node.type==='input'&&node.props['aria-label']===label).props.onChange({target:{value}});},
   approve(){find(node=>node.type==='input'&&node.props.type==='checkbox').props.onChange({target:{checked:true}});},
   submit:()=>find(node=>node.type==='form').props.onSubmit({preventDefault(){}})};
 }
 const execution=new Date(date+'T15:01:00Z'),pad=value=>String(value).padStart(2,'0');
 const localExecution=`${execution.getFullYear()}-${pad(execution.getMonth()+1)}-${pad(execution.getDate())}T${pad(execution.getHours())}:${pad(execution.getMinutes())}:${pad(execution.getSeconds())}`;
 const fill=(h,shares)=>{h.enter('Shares filled',String(shares));h.enter('Execution price','25.75');h.enter('Fee','0.37');h.enter('Execution time',localExecution);h.approve();};
 const planned=form();assert(planned.options().some(row=>row.value==='planned:sell:ZZZ'&&row.label.includes('20 shares')));
 planned.choose('planned:sell:ZZZ');fill(planned,20);await planned.submit();
 assert.equal(planned.calls.length,1,'A real planned-sale form submits once');same(planned.calls[0].saleSelection,selection('planned',[plannedId]));
 same(ids.map(id=>quantity(actual(planned.account).books,id)),[30,50,0]);same(plannedOrders(rest(planned.session.plan,planned.account)),[]);
 planned.session.fills=copy(planned.account.intradayActivity.fills);planned.session.tickets=copy(planned.account.intradayActivity.tickets);planned.session.revision=planned.account.revision;
 assert(!planned.options().some(row=>row.value==='planned:sell:ZZZ'),'The actual form removes the completed planned sale');
 const stopped=form();stopped.choose('stop:sell:ZZZ');fill(stopped,16);await stopped.submit();
 assert.equal(stopped.calls.length,1);same(stopped.calls[0].saleSelection,selection('stop',stopIds));same(ids.map(id=>quantity(actual(stopped.account).books,id)),[24,40,20]);
 const owner=form();owner.choose('owner-exit:ZZZ');fill(owner,10);await owner.submit();
 assert.equal(owner.calls[0].recordingReason,'owner-discretionary-exit');assert(!Object.hasOwn(owner.calls[0],'saleSelection'),'A dedicated owner sale is not mislabeled as a selected C1 action');
 const priorOwner=form();priorOwner.session.plan.openingBooks.base.positions.YYY={shares:2,avgCost:10,openedAt:'2026-11-18'};
 priorOwner.session.plan.orders.push({id:'fictional:prior-owner:YYY',sleeve:'base',date,symbol:'YYY',side:'sell',shares:2,recordingOnly:true,reason:'owner-discretionary-exit'});
 assert(!priorOwner.options().some(row=>row.value==='planned:sell:YYY'),'A retained owner-exit identity cannot be mislabeled as a new planned C1 sale');
 assert(priorOwner.options().some(row=>row.value==='owner-exit:YYY'),'Its separate owner-recorded sale choice remains available');
 cases++;console.log('PASS actual React planned/stop/owner save payloads and selected allocation recording');
}

uiChecks().then(()=>console.log(`PASS: ${cases} focused fictional planned-sale attribution cases; exact server group binding, immutable prior facts, remaining protective exits, cash/fees and actual React payloads. No live data or writes.`)).catch(error=>{console.error(error);process.exitCode=1;});
