// Wholly fictional broker facts. Test a publication/recording hold; never
// create a correction, provider request, persisted record or broker execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs'),loader=createResearchModuleLoader(process.cwd());
const {buildC1SaleAttributionHold:build,applyC1SaleAttributionHold:apply,assertC1SaleAttributionHold:guard,C1_SALE_ATTRIBUTION_HOLD_ERROR:error}=loader.load('lib/c1SaleAttributionHold.js');
const {reviewC1SaleAttribution:review,correctC1SaleAttribution:correct}=loader.load('lib/c1SaleAttributionRecovery.js');
const {reconcileC1ActualAccountFills:reconcile}=loader.load('lib/c1AccountLedger.js');
const {c1PositionPresentation:presentation}=loader.load('lib/c1PositionPresentation.js');
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b,message)=>assert.equal(JSON.stringify(a),JSON.stringify(b),message),date='2026-11-25',source='2026-11-24',now=new Date(date+'T18:00:00Z'),ids=['base','cooldown15','sector40'],target='fictional:sector40:planned:ZZZ';
function fixture(){
 const openingBooks=Object.fromEntries(ids.map((sleeve,i)=>[sleeve,{cash:1000,positions:{ZZZ:{shares:[30,50,20][i],avgCost:[24,25,26][i],openedAt:'2026-11-18'}}}]));
 openingBooks.base.positions.YYY={shares:4,avgCost:10,openedAt:'2026-11-17'};
 const orders=[{id:target,date,sleeve:'sector40',symbol:'ZZZ',side:'sell',shares:20,estimatedPrice:25,reason:'portfolio-drawdown-stop'},
  ...ids.map((sleeve,i)=>({id:`fictional:${sleeve}:stop:ZZZ`,date,sleeve,symbol:'ZZZ',side:'sell',shares:[30,50,20][i],estimatedPrice:21,reason:'initial-stop',condition:'stop-triggered'})),
  {id:'fictional:base:stop:YYY',date,sleeve:'base',symbol:'YYY',side:'sell',shares:4,estimatedPrice:9,reason:'initial-stop',condition:'stop-triggered'},
  {id:'fictional:base:buy:XXX',date,sleeve:'base',symbol:'XXX',side:'buy',shares:1,estimatedPrice:10,reason:'Buy'}];
 const ticket={id:'fictional-completed-sale',symbol:'ZZZ',side:'sell',shares:20,price:25.75,fee:.4,executedAt:date+'T15:01:00.000Z'};
 const fills=[['sector40',4,.08,target],['base',6,.12,'fictional:base:stop:ZZZ'],['cooldown15',10,.2,'fictional:cooldown15:stop:ZZZ']].map(([sleeve,shares,fee,orderId])=>({id:ticket.id+':'+sleeve,orderId,symbol:'ZZZ',side:'sell',shares,price:ticket.price,fee,executedAt:ticket.executedAt}));
 const plan={contract:'c1-actual-account-opening-plan-v1',date,sourceSessionDate:source,observedAt:date+'T15:02:00.000Z',openingBooks,orders,providerVerified:true,
  riskBySleeve:{sector40:{highWater:2000,paused:true,operationalRisk:{purchaseRiskReady:false,requiresLiquidationEpoch:true}}}};
 return {contract:'c1-private-account-v1',revision:7,adoption:{sourceSessionDate:source},records:[],sourceHashes:[],
  brokerageCash:{balance:2500,observedAt:date+'T14:30:00Z',source:'manual-broker-balance'},intradayActivity:{date,plan,openingObservedAt:plan.observedAt,tickets:[ticket],fills}};
}
function view(account){
 const a=account.intradayActivity,r=reconcile({plan:a.plan,fills:a.fills,observedAt:now.toISOString()}),orders=r.outstanding,
  exits=[{sleeve:'sector40',shares:16,reason:'portfolio-drawdown-stop'}],position={symbol:'ZZZ',shares:80,avgCost:24.9,totalCost:1992,openedAt:'2026-11-18',action:'Exit candidate',reason:'Portfolio loss limit',exits,
   stops:ids.map((sleeve,i)=>({sleeve,shares:[24,40,16][i],price:21})),reviewRules:[]},
  action={symbol:'ZZZ',side:'sell',activeExit:true,shares:16,reason:'portfolio-drawdown-stop',allocationBreakdown:[{...exits[0],orderId:target}],orderIds:[target]},
  decision={contract:'c1-account-decision-v1',current:true,sourceSessionDate:source,revision:account.revision,positions:[position],accountActions:[action],activeExitSymbols:['ZZZ'],accountPolicy:{blockedSymbols:['OTHER']},actualCash:r.actualCash};
 return {account,decision,executionDecision:decision,completedDecision:decision,openingPlan:{...a.plan,orders},manualRecommendations:{date,sourceSessionDate:source,orders,accountActions:[action]},intradaySession:{date,plan:a.plan,fills:a.fills,tickets:a.tickets,revision:account.revision}};
}
let count=0;const check=(name,run)=>{run();count++;console.log('PASS '+name);};
check('real reconciled pending review quarantines exact planned scope without changing financial facts',()=>{
 const account=fixture(),before=clone(account),original=view(account),v=apply({view:original,account,now}),hold=build({account,now});
 assert.equal(hold.status,'review-required');same(hold.targets,[{orderId:target,symbol:'ZZZ',sleeve:'sector40',reason:'portfolio-drawdown-stop'}]);
 same(account,before);assert.equal(v.intradaySession.plan,account.intradayActivity.plan);same(v.intradaySession.fills,before.intradayActivity.fills);same(v.intradaySession.tickets,before.intradayActivity.tickets);
 same(v.intradaySession.withheldSaleOrderIds,[target]);assert.equal(v.openingPlan.orders.filter(o=>o.reason==='portfolio-drawdown-stop').length,0);
 assert.equal(v.openingPlan.orders.filter(o=>o.condition).length,4);assert.equal(v.manualRecommendations.orders.filter(o=>o.reason==='portfolio-drawdown-stop').length,0);
 for(const key of ['decision','executionDecision','completedDecision']){assert.equal(v[key].positions[0].action,'Review');same(v[key].positions[0].exits,[]);same(v[key].accountActions,[]);same(v[key].activeExitSymbols,original[key].activeExitSymbols);same(v[key].accountPolicy,original[key].accountPolicy);same(v[key].positions[0].stops,original[key].positions[0].stops);assert.equal(v[key].actualCash,original[key].actualCash);}
 same(original,view(account),'The input response is not mutated');same(v.openingPlan.riskBySleeve,original.openingPlan.riskBySleeve);
});
check('other allocation exits, verified protective stops and mixed canonical quantities survive',()=>{
 const account=fixture(),v=view(account),other={sleeve:'base',shares:24,reason:'recent-momentum-deterioration'};
 v.decision.positions[0].exits.push(other);v.decision.accountActions[0].allocationBreakdown.push({...other,orderId:'fictional-unrelated-exit'});v.decision.accountActions[0].shares+=24;
 v.openingPlan.orders.push({id:'fictional-unrelated-exit',date,symbol:'ZZZ',side:'sell',...other});
 const next=apply({view:v,account,now});same(next.decision.positions[0].exits,[other]);assert.equal(next.decision.accountActions[0].shares,24);assert.equal(next.decision.positions[0].action,'Exit candidate');
 assert(next.openingPlan.orders.some(o=>o.id==='fictional-unrelated-exit'));assert.equal(presentation({decision:next.decision,position:next.decision.positions[0],now}).action,'Sell');
 const stopped=clone(next.decision);stopped.positions[0].exits=[{sleeve:'base',shares:24,reason:'initial-stop'}];assert.equal(presentation({decision:stopped,position:stopped.positions[0],now}).label,'SELL — STOP TRIGGERED');
});
check('all held views label unresolved allocation Review instead of Sell or Hold',()=>{
 const account=fixture(),v=apply({view:view(account),account,now}),p=presentation({decision:v.decision,executionDecision:v.executionDecision,position:v.decision.positions[0],openingPlan:v.openingPlan,manualRecommendations:v.manualRecommendations,now});
 assert.equal(p.action,'Review');assert.equal(p.label,'SALE ALLOCATION REVIEW REQUIRED');assert.equal(p.canAdd,false);assert.match(p.reason,/already recorded/);
});
check('server guard rejects stale planned tickets but preserves stop/owner/unrelated/identical receipts',()=>{
 const account=fixture(),ticket={id:'fictional-next-sale',symbol:'ZZZ',side:'sell',shares:16,saleSelection:{kind:'planned',orderIds:[target]}};
 assert.throws(()=>guard({account,ticket,now}),e=>e.message===error);assert.throws(()=>guard({account,ticket:{...ticket,saleSelection:undefined},now}),e=>e.message===error);
 for(const patch of [{saleSelection:{kind:'stop',orderIds:['fictional:base:stop:ZZZ']}},{recordingReason:'owner-discretionary-exit'},{symbol:'YYY'},{side:'buy'}])assert.doesNotThrow(()=>guard({account,ticket:{...ticket,...patch},now}));
 assert.doesNotThrow(()=>guard({account,ticket:clone(account.intradayActivity.tickets[0]),now}));
});
check('later actual selected stop cannot revive disputed planned exits; native correction stays unavailable',()=>{
 const account=fixture(),plan=account.intradayActivity.plan,old=clone(account),ticket={id:'fictional-later-stop',symbol:'ZZZ',side:'sell',shares:1,price:20.5,fee:.01,executedAt:date+'T16:00:00.000Z',saleSelection:{kind:'stop',orderIds:['fictional:base:stop:ZZZ']}};
 account.intradayActivity.tickets.push(ticket);account.intradayActivity.fills.push({id:ticket.id+':base',orderId:'fictional:base:stop:ZZZ',symbol:'ZZZ',side:'sell',shares:1,price:ticket.price,fee:ticket.fee,executedAt:ticket.executedAt});
 assert.equal(review({account,now}),null);const hold=build({account,now});assert.equal(hold.evidenceScope,'verified-saved-ticket-prefix');assert.equal(hold.prefixTicketCount,1);assert.equal(account.intradayActivity.plan,plan);same(hold.targets,build({account:old,now}).targets);
 assert.doesNotThrow(()=>guard({account,ticket:{...ticket,id:'fictional-another-stop'},now}));assert.throws(()=>guard({account,ticket:{id:'fictional-repeat',symbol:'ZZZ',side:'sell'},now}),e=>e.message===error);
 const altered=clone(account);altered.intradayActivity.tickets.reverse();assert.equal(build({account:altered,now}),null,'Never reorder or select an arbitrary subset to create proof');
 const inconsistent=clone(account);inconsistent.intradayActivity.plan.orders.find(o=>o.id===target).shares=19;assert.equal(build({account:inconsistent,now}),null,'A changed planned target cannot be held using invented old quantities');
});
check('later actual purchase also retains only the verified original disputed scope',()=>{
 const account=fixture(),ticket={id:'fictional-later-buy',symbol:'XXX',side:'buy',shares:1,price:10,fee:0,executedAt:date+'T16:00:00.000Z'};
 account.intradayActivity.tickets.push(ticket);account.intradayActivity.fills.push({...ticket,id:ticket.id+':base',orderId:'fictional:base:buy:XXX'});
 const before=clone(account);assert.equal(build({account,now}).evidenceScope,'verified-saved-ticket-prefix');same(account,before);
});
check('applied correction, rollover, genuine stop and unsupported history are not quarantined',()=>{
 const account=fixture(),r=review({account,now}),applied=correct({account,proposalId:r.proposalId,expectedRevision:account.revision,confirmed:true,now});assert.equal(build({account:applied,now}),null);
 assert.equal(build({account,now:new Date('2026-11-27T17:00:00Z')}),null);
 const stop=fixture();stop.intradayActivity.tickets[0].saleSelection={kind:'stop',orderIds:['fictional:base:stop:ZZZ']};assert.equal(build({account:stop,now}),null);
 assert.equal(build({account:{},now}),null);const untouched=view(applied);assert.equal(apply({view:untouched,account:applied,now}),untouched);
});
check('actual React recorder removes only withheld planned choice and keeps stop/owner choices',()=>{
 const account=fixture(),v=apply({view:view(account),account,now}),React=require('react'),babel=require('next/dist/compiled/babel/core');
 const mock={...React,useMemo:calculate=>calculate(),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]},file=path.resolve('components/C1IntradayActivity.js'),module={exports:{}},compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',compiled)(name=>name==='react'?mock:name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),module,module.exports);
 const walk=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(walk)],render=module.exports.default({session:v.intradaySession}),options=walk(render).filter(node=>node.type==='option').map(node=>node.props.value);
 assert(!options.includes('planned:sell:ZZZ'));assert(options.includes('stop:sell:ZZZ'));assert(options.includes('stop:sell:YYY'));assert(options.includes('owner-exit:ZZZ'));same(account.intradayActivity.plan,v.intradaySession.plan);
});
console.log(`${count} sale-attribution hold cases passed`);
