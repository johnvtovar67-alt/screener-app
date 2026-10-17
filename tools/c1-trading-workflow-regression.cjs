// End-to-end application-service + rendered production-component workflow.
// Deterministic examples only; never connects to Schwab or live account storage.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const RealDate=Date;let displayClock='2026-10-15T17:00:00Z';
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[displayClock]));}static now(){return new RealDate(displayClock).getTime();}};
const output=path.resolve(process.env.C1_WORKFLOW_EVIDENCE||'work/operational-evidence');fs.mkdirSync(output,{recursive:true});
const evidence={scope:'Deterministic operational workflow, no live account or broker writes',productionBase:'0a65e20964ae080b8718332e5f6f16daa6def452',cases:[]};
function render(file,props,fixture){
 displayClock=fixture.now.toISOString();
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core'),record={exports:{}};
 const native=Date;global.Date=class extends native{constructor(...a){super(...(a.length?a:[fixture.now]));}static now(){return fixture.now.getTime();}};
 try{
  const filename=path.resolve(file),code=babel.transformSync(fs.readFileSync(filename,'utf8'),{filename,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
  new Function('require','module','exports',code)(n=>n.startsWith('../lib/')?fixture.loader.load(n,filename):require(n.startsWith('@babel/runtime/')?'next/dist/compiled/'+n:n),record,record.exports);
  return renderToStaticMarkup(React.createElement(record.exports.default,props));
 }finally{global.Date=native;}
}
function html(f,v,view='opportunities'){
 return render('components/C1AccountOpportunities.js',{...v,screenRows:f.screenRows(),positionRows:f.screenRows(),screenCurrent:true,portfolio:f.portfolio,view},f);
}
const cost=p=>p.orders.filter(o=>o.side==='buy').reduce((s,o)=>s+o.shares*o.estimatedPrice,0);
const mrna=p=>p.orders.filter(o=>o.side==='buy'&&o.symbol==='MRNA');
async function main(){
 const f=createWorkflowFixture();f.setCash(100000);f.advance();const original=clone(f.account),before=f.service.evaluateC1Account({account:f.account,book:f.book,now:f.now});
 const v=await f.prepare(),required=Math.round(cost(v.openingPlan)*100)/100;
 assert.equal(v.manualRecommendations.status,'ready');assert(mrna(v.openingPlan).length===3);assert(required>before.strategyCash);
 assert.equal(v.openingPlan.purchaseFundingPolicy,'brokerage-cash-only-v1');
 assert(Object.values(v.openingPlan.projectedBooks).some(b=>b.cash<0),'Projection retains exact signed historical debit, not a fictitious transfer');
 const maximum=new Map(v.openingPlan.orders.filter(o=>o.side==='buy').map(o=>[o.id,o.shares]));
 for(const [label,balance] of [['greater',required+1000],['equal',required],['less',required-100],['zero',0]]){
  const c=createWorkflowFixture();c.setCash(balance);c.advance();const a=await c.prepare(),b=c.service.evaluateC1Account({account:c.account,book:c.book,now:c.now});
  assert.equal(JSON.stringify(b.positions),JSON.stringify(before.positions));assert.equal(JSON.stringify(b.opportunities),JSON.stringify(before.opportunities),'Funding cannot change underlying completed-session candidates');
  near(a.decision.executableCash,balance);assert(cost(a.openingPlan)<=balance+1e-7);
  for(const o of a.openingPlan.orders.filter(o=>o.side==='buy'))assert(o.shares<=maximum.get(o.id),'Available cash cannot enlarge the authorized target');
  if(label==='equal'||label==='greater')near(cost(a.openingPlan),required);
  else assert(a.openingPlan.cashBlockedOrders.some(o=>o.reason==='brokerage-cash-insufficient'));
  if(label==='zero'){assert(!a.openingPlan.orders.some(o=>o.side==='buy'));assert.match(html(c,a),/brokerage cash|Schwab cash/);}
  evidence.cases.push({case:'cash-'+label,brokerageCash:balance,accountingCash:b.strategyCash,authorizedPurchaseCost:required,fundedCost:cost(a.openingPlan),decisionParity:'PASS'});
 }
 const buyHtml=html(f,v);assert.match(buyHtml,/MRNA/);assert.match(buyHtml,/Buy 265 shares/);fs.writeFileSync(path.join(output,'buy-ready.html'),buyHtml);
 const cashHtml=render('components/C1BrokerageCash.js',{decision:v.decision,onSave(){}},f);
 assert.match(cashHtml,/Schwab cash available to trade/);assert.doesNotMatch(cashHtml,/C1 strategy cash|Available to deploy/);assert.match(cashHtml,/no live Schwab connection/);
 const missing=createWorkflowFixture('missing');missing.setCash(100000);missing.advance();const waiting=await missing.prepare();
 assert.equal(waiting.manualRecommendations.status,'waiting');assert.equal(waiting.openingPlan,null);
 const missingHtml=html(missing,waiting);assert.match(missingHtml,/MRNA/);assert.match(missingHtml,/Strong Buy rating|Buy rating/);assert.doesNotMatch(missingHtml,/Buy \d+ shares/);assert.match(missingHtml,/current opening quote unavailable/);
 await assert.rejects(missing.prepare({id:'must-not-save',symbol:'MRNA',side:'buy',shares:1,price:100,fee:0,executedAt:missing.now.toISOString()}),/opening checks|new purchases/i);
 assert(!missing.account.intradayActivity);evidence.cases.push({case:'MRNA-rating-with-incomplete-entry-verification',ratingPreserved:true,purchaseInstruction:false,serverRecordingRejected:true});fs.writeFileSync(path.join(output,'mrna-verification-blocked.html'),missingHtml);
 const shares=mrna(v.openingPlan).reduce((sum,o)=>sum+o.shares,0),price=100.12,ticket={id:'deterministic-schwab-buy',symbol:'MRNA',side:'buy',shares,price,fee:0,executedAt:f.now.toISOString()};
 const saved=await f.prepare(ticket);f.account=saved.account;
 near(saved.decision.brokerageCash,100000-shares*price);assert.equal(saved.decision.positions.find(p=>p.symbol==='MRNA').shares,shares);
 assert.equal(saved.intradaySession.tickets.length,1);assert.equal(JSON.stringify(f.account.adoption),JSON.stringify(original.adoption));assert(!f.account.cashReconciliations);
 const duplicate=await f.prepare(ticket);assert.equal(duplicate.account.intradayActivity.tickets.length,1);near(duplicate.decision.brokerageCash,saved.decision.brokerageCash);
 const books=f.loader.load('lib/c1AccountLedger.js').reconcileC1ActualAccountFills({plan:f.account.intradayActivity.plan,fills:f.account.intradayActivity.fills,observedAt:f.now}).books;
 assert(Object.values(books).every(b=>b.cash<0));
 f.advance();f.setCash(saved.decision.brokerageCash);const resnapshot=await f.prepare();near(resnapshot.decision.brokerageCash,saved.decision.brokerageCash);
 const closed=f.service.deriveC1CompletedAccount({account:f.account,book:{...f.book,model:{sessions:f.sessions.slice(0,222)},captures:f.sessions.slice(0,222).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))},now:new Date('2026-10-15T22:00:00Z')});
 const closedBook={...f.book,model:{sessions:f.sessions.slice(0,222)},captures:f.sessions.slice(0,222).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))};
 const continued=f.service.evaluateC1Account({account:closed,book:closedBook,now:new Date('2026-10-15T22:00:00Z')});assert.equal(continued.positions.find(p=>p.symbol==='MRNA').shares,shares);
 assert.equal(JSON.stringify(closed.adoption),JSON.stringify(original.adoption));
 evidence.cases.push({case:'actual-buy-fill-retry-resnapshot-and-completed-replay',shares,actualPrice:price,cashBefore:100000,cashAfter:saved.decision.brokerageCash,duplicateCount:1,originalAdoptionUnchanged:true,manufacturedTransfers:0,completedReplay:'PASS',signedSleeveAccounting:books});
 // On the next session a partial exit must work even when the retained
 // accounting residual stays negative and Buy verification is unavailable.
 f.account=closed;f.book.model=closedBook.model;f.book.captures=closedBook.captures;
 f.now=new Date('2026-10-16T17:00:00Z');f.setOpeningFailure(true);f.setCash(0);f.advance();
 const nextClosedBook={...f.book,model:{sessions:f.sessions.slice(0,223)},captures:f.sessions.slice(0,223).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))};
 const postFundingPending=f.loader.load('lib/c1AccountExecutionView.js').pendingC1AccountSession({account:closed,book:nextClosedBook,now:new Date('2026-10-16T22:00:00Z')});
 assert.equal(postFundingPending.plan.purchaseFundingPolicy,'brokerage-cash-only-v1');
 const nextSale=await f.prepare({id:'next-session-partial-sale',symbol:'MRNA',side:'sell',shares:20,price:70,fee:0,executedAt:f.now.toISOString()});
 assert.equal(nextSale.decision.positions.find(p=>p.symbol==='MRNA').shares,245);near(nextSale.decision.brokerageCash,1400);
 evidence.cases.push({case:'next-session-partial-sale-with-negative-audit-residual',sold:20,remaining:245,brokerageCash:1400,buyVerificationUnavailable:true});
 const sell=createWorkflowFixture('sell');sell.setCash(0);sell.setOpeningFailure(true);sell.advance();const exit=await sell.prepare(),sellHtml=html(sell,exit,'portfolio');
 assert.match(sellHtml,/SELL — STOP TRIGGERED/);assert.match(sellHtml,/Recorded holding: 20 shares/);assert.match(sellHtml,/Sell 20 shares in Schwab/);assert.doesNotMatch(sellHtml,/sale remains pending|sale completed|order submitted/);
 const noBuyEvidence={...exit,openingPlan:null,openingError:'Buy opening verification unavailable',manualRecommendations:{status:'waiting',orders:[]}};
 assert.match(html(sell,noBuyEvidence,'portfolio'),/Sell 20 shares in Schwab/,'A recorded Sell quantity survives missing Buy verification');
 fs.writeFileSync(path.join(output,'dell-stop-zero-cash.html'),sellHtml);
 const sale={id:'deterministic-schwab-sale',symbol:'DELL',side:'sell',shares:20,price:460,fee:.25,executedAt:sell.now.toISOString()};
 const sold=await sell.prepare(sale);sell.account=sold.account;assert(!sold.decision.positions.some(p=>p.symbol==='DELL'));near(sold.decision.brokerageCash,9199.75);
 const retried=await sell.prepare(sale);near(retried.decision.brokerageCash,9199.75);assert.equal(retried.intradaySession.tickets.length,1);
 sell.advance();sell.setCash(9199.75);sell.setOpeningFailure(false);near((await sell.prepare()).decision.brokerageCash,9199.75);
 evidence.cases.push({case:'DELL-triggered-stop-with-zero-cash',recordedShares:20,stop:468.85,verifiedPrice:460,saleInstructionShares:20,actualFillShares:20,fee:.25,brokerageCashAfter:9199.75,retryAndResnapshot:'PASS',noAssumedBrokerOrder:true});
 // Invert only the declared funding seams and require exact production source.
 let source=fs.readFileSync('lib/c1AccountSimulator.js','utf8');for(const [old,next] of require('./c1-operational-funding-seams.cjs')){assert.equal(source.split(next).length,2);source=source.replace(next,old);}
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'02e1edad62c96360a0380142e46e72eacf0a486cc8bb60f43979b7d7e21ce5fb');
 // JSON/client flags cannot authorize a negative historical sleeve debit.
 const replayModule=f.loader.load('lib/c1ActualFillReplay.js'),replayDate='2026-10-15';
 const forged={id:'untrusted',symbol:'MRNA',side:'buy',reason:'ranked-entry',shares:1,price:100,fee:0,executedAt:replayDate+'T17:00:00Z',brokerageFunded:true};
 const untrusted=replayModule.createC1ActualFillReplay({contract:'c1-actual-fill-replay-v1',sessions:[{date:replayDate,fills:[forged]}]}, {asOfSession:'2026-10-14'},[{date:replayDate}]);
 assert.equal(untrusted.lookup(replayDate,'MRNA','buy','ranked-entry').brokerageFunded,undefined);
 replayModule.markC1BrokerageFundedPurchase(forged,replayDate);
 const trusted=replayModule.createC1ActualFillReplay({contract:'c1-actual-fill-replay-v1',sessions:[{date:replayDate,fills:[forged]}]}, {asOfSession:'2026-10-14'},[{date:replayDate}]);
 assert.equal(trusted.lookup(replayDate,'MRNA','buy','ranked-entry').brokerageFunded,true);
 evidence.privateFundingCapability='Serialized flag rejected; reconciled identity only PASS';
 evidence.strategyBodiesOutsideFundingSeams='Exact production SHA256 PASS';
 evidence.status='PASS';fs.writeFileSync(path.join(output,'workflow.json'),JSON.stringify(evidence,null,2)+'\n');console.log('PASS: deterministic Buy/Sell/cash workflow; evidence '+output);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.Date=RealDate;});
