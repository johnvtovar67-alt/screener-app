const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createWorkflowFixture,currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const portfolio=[...['BBB','CCC','LLL'].map(symbol=>({symbol,role:'Swing',shares:40,avgCost:100,openedAt:'2026-10-14'})),{symbol:'CASH',role:'Swing',shares:8000,avgCost:1}];
const ids=['base','cooldown15','sector40'],buys=p=>p.orders.filter(o=>o.side==='buy'),orders=p=>clone(p.orders),evidence={scope:'Synthetic prospective capacity workflow only; no account/provider writes',cases:[]};
function fixture(){return createWorkflowFixture('buy',{portfolio});}
function completedBook(f,n=222){return {...f.book,model:{sessions:f.sessions.slice(0,n)},captures:f.sessions.slice(0,n).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))};}
function input(f){return {adoption:f.account.adoption,sessions:[f.sessions[220]],historySessions:f.sessions.slice(0,221),records:[],opening:f.opening(),observedAt:f.now.toISOString(),purchaseFundingIndependent:true};}
(async()=>{
 const f=fixture();f.setCash(5000);f.advance();const before=clone(f.account),view=await f.prepare(),plan=view.openingPlan;
 assert.equal(view.manualRecommendations.status,'ready');assert.equal(view.decision.positions.length,3);assert.deepEqual(clone(plan.additionalSwingCapacity.symbols),['MRNA','BBB','CCC']);
 assert(buys(plan).every(o=>o.symbol==='MRNA'&&o.additionalCapacity===true));
 const quantity=buys(plan).reduce((n,o)=>n+o.shares,0);assert.equal(quantity,49);near(buys(plan).reduce((n,o)=>n+o.shares*o.estimatedPrice,0),4905.88);
 const old=f.loader.load('lib/c1AccountExecution.js').planC1ContinuedAccountOpening(input(f));assert.equal(buys(old).length,0,'Production control must reproduce the three-position block');
 const saved=await f.prepare({id:'fourth-position',symbol:'MRNA',side:'buy',shares:quantity,price:100.12,fee:0,executedAt:f.now.toISOString()});f.account=saved.account;
 assert.equal(saved.decision.positions.length,4);assert.equal(saved.decision.positions.find(p=>p.symbol==='MRNA').shares,49);near(saved.decision.brokerageCash,94.12);
 assert.equal(JSON.stringify(f.account.adoption),JSON.stringify(before.adoption));assert(!f.account.cashReconciliations);
 const fourth=saved.decision.positions.find(p=>p.symbol==='MRNA');assert.equal(fourth.stops.length,3);for(const s of fourth.stops)near(s.price,100.12*.86);
 const book=completedBook(f),closed=f.service.deriveC1CompletedAccount({account:f.account,book,now:new Date('2026-10-15T22:00:00Z')});
 const continued=f.loader.load('lib/c1AccountLedger.js').continueC1ActualAccount({adoption:closed.adoption,sessions:f.sessions.slice(220,222),historySessions:f.sessions.slice(0,222),records:closed.records,observedAt:'2026-10-15T22:00:00Z'});
 assert(ids.every(id=>continued.books[id].positions.MRNA&&Object.keys(continued.books[id].positions).length===4));
 const mark=100.025,equity=ids.reduce((n,id)=>n+continued.books[id].cash+Object.values(continued.books[id].positions).reduce((s,p)=>s+p.shares*mark,0),0);near(equity,20000+120*.025+49*(100.025-100.12));
 const repeated=await f.prepare({id:'fourth-position',symbol:'MRNA',side:'buy',shares:quantity,price:100.12,fee:0,executedAt:f.now.toISOString()});assert.equal(repeated.account.intradayActivity.tickets.length,1);near(repeated.decision.brokerageCash,94.12);
 evidence.cases.push({case:'three-held-5000-cash-fourth-purchase',shares:quantity,price:100.12,cashAfter:94.12,heldPositions:4,sleeves:ids.map(id=>({id,shares:continued.books[id].positions.MRNA.shares,stop:continued.sleeves[id].openPositions.find(p=>p.symbol==='MRNA').stopPrice})),completedReplay:'PASS',equity});
 // Honest blockers, with no fallback to slot capacity when another gate fails.
 for(const [name,edit,expected] of [
  ['event',g=>{for(const s of [...g.sessions[220].signals,...g.sessions[220].positionSignals])if(s.symbol==='MRNA')s.eventRisk={status:'Blocked',blockNewCapital:true,checkComplete:true};},/material-event|entry|verification|event/],
  ['liquidity',g=>{for(const s of [...g.sessions[220].signals,...g.sessions[220].positionSignals])if(s.symbol==='MRNA')s.entryTiming.averageDollarVolume20=1;},/liquidity|entry|verification/],
  ['missing-opening',g=>g.setOpeningFailure(true),/opening|verification/],
  ['zero-cash',g=>g.setCash(0),/cash/],
  ['stale-cash',g=>{g.account={...g.account,brokerageCash:{...g.account.brokerageCash,observedAt:'2026-10-14T17:00:00Z'}};},/cash/],
  ['breaker',g=>{g.account=clone(g.account);for(const seed of Object.values(g.account.adoption.seeds))seed.highWater=200000;},/cooldown|entry|verification/]
 ]){
  const g=fixture();g.setCash(5000);edit(g);g.advance();
  // This control represents a genuinely adverse current observation, rather
  // than asking historical source flags to override fresh clear provider proof.
  const v=name==='event'?await g.loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution({account:g.account,book:g.book,now:g.now,
   collectOpening:async args=>({...await g.collectOpening(args),currentEventEvidence:currentEventEvidenceFor(args.symbols,g.now,{MRNA:{state:'VERIFIED_BLOCKED'}})})}):await g.prepare();
  assert(!v.openingPlan||!buys(v.openingPlan).some(o=>o.symbol==='MRNA'),name);
  if(name==='liquidity'){assert(!v.decision.stockScreen.candidates.some(c=>c.symbol==='MRNA'));evidence.cases.push({case:'blocked-source-liquidity',sourceEligibility:'excluded',status:'PASS'});continue;}
  const reasons=JSON.stringify({openingError:v.openingError,review:v.openingPlan?.additionalSwingCapacity?.reviews,entries:v.openingPlan?.entryReviews,cash:v.openingPlan?.cashBlockedOrders});assert.match(reasons,expected,name);
  evidence.cases.push({case:'blocked-'+name,status:'PASS'});
 }
 for(const name of ['sector','issuer','gap']){
  const g=fixture();g.setCash(5000);
  if(name==='gap')g.setQuote('MRNA',110);
  else{
   g.account=clone(g.account);
   for(const seed of Object.values(g.account.adoption.seeds))for(const p of seed.positions){if(name==='sector'&&['BBB','CCC'].includes(p.symbol)){p.sector='Healthcare';p.stock.sector='Healthcare';}if(name==='issuer'&&p.symbol==='BBB')p.stock.cik='999';}
   for(const s of [...g.sessions[220].signals,...g.sessions[220].positionSignals]){if(name==='sector'&&['BBB','CCC'].includes(s.symbol))s.sector='Healthcare';if(name==='issuer'&&s.symbol==='MRNA')s.cik='999';}
  }
  g.advance();const v=await g.prepare();assert(!buys(v.openingPlan).some(o=>o.symbol==='MRNA'),name+' must block an additional position');
  const reason=JSON.stringify({entries:v.openingPlan.entryReviews,qualification:v.openingPlan.additionalSwingCapacity.reviews});assert.match(reason,name==='sector'?/sector-position-limit/:name==='issuer'?/issuer-concentration-limit/:/opening-gap/);
  evidence.cases.push({case:'blocked-'+name,status:'PASS'});
 }
 const large=createWorkflowFixture('buy',{portfolio:portfolio.map(p=>p.symbol==='CASH'?{...p,shares:1000000}:p)});large.setCash(1000);large.advance();const minimum=await large.prepare();
 assert(!buys(minimum.openingPlan).length,'Cash rounding cannot waive the existing additional-order minimum trade');
 assert(minimum.openingPlan.cashBlockedOrders.some(o=>o.symbol==='MRNA'&&o.reason==='trade-size-limit'&&o.minimumTradeDollars>1000));
 evidence.cases.push({case:'minimum-trade-after-cash-rounding',cash:1000,status:'PASS'});
 // A Watch entry from the existing nine-name queue never gains qualification.
 assert(!buys(plan).some(o=>!['MRNA','BBB','CCC'].includes(o.symbol)));
 // Ordinary decisions and funded quantities must match the control exactly
 // whenever no additional order receives funds. Preserve existing Add targets.
 const regular=createWorkflowFixture();regular.setCash(5000);regular.advance();
 const a=f.loader.load('lib/c1AccountExecution.js');
 const raw=a.planC1ContinuedAccountOpening(input(regular)),expanded=a.planC1ContinuedAccountOpening({...input(regular),additionalSwingCapacity:true});
 const cap=f.loader.load('lib/c1ExecutionCashAuthority.js').capC1ExecutionCash;
 for(const balance of [0,50,5000]){
  const account={...regular.account,brokerageCash:{...regular.account.brokerageCash,balance}};
  const x=cap({plan:raw,account,strategyCash:1000,now:regular.now}),y=cap({plan:expanded,account,strategyCash:1000,now:regular.now});
  assert(!buys(y).some(o=>o.additionalCapacity));assert.deepEqual(orders(y),orders(x),'Unfunded exception cannot change ordinary orders/quantities');assert.deepEqual(clone(y.riskBySleeve),clone(x.riskBySleeve));
 }
 evidence.cases.push({case:'exception-unused-parity',cash:[0,50,5000],ordersAndQuantities:'exact',risk:'exact'});
 // Existing partial-entry Adds retain their original quantity and cash priority,
 // even when a higher-ranked new name could use the capacity exception.
 const addArgs={...input(f),adoption:before.adoption,completionPolicy:{version:1,partialSymbols:['BBB']}};
 const addControl=a.planC1ContinuedAccountOpening(addArgs),addExpanded=a.planC1ContinuedAccountOpening({...addArgs,additionalSwingCapacity:true});
 assert(buys(addControl).some(o=>o.symbol==='BBB'),'Fixture must create a genuine existing partial Add');
 for(const balance of [0,1000]){
  const acct={...before,brokerageCash:{...before.brokerageCash,balance}};
  const x=cap({plan:addControl,account:acct,strategyCash:8000,now:f.now}),y=cap({plan:addExpanded,account:acct,strategyCash:8000,now:f.now});
  assert(!buys(y).some(o=>o.additionalCapacity));assert.deepEqual(orders(y),orders(x),'An unfunded additional name cannot alter an existing Add');
 }
 evidence.cases.push({case:'existing-Add-parity',ordersAndQuantities:'exact',cash:[0,1000]});
 // Actual API persistence and reload using the same handler and strong ETags.
 const api=createWorkflowApi('capacity');let r=await api.request('POST',{operation:'update-brokerage-cash',brokerageCash:5000,expectedRevision:0});assert.equal(r.status,200);
 r=await api.request('POST',{operation:'prepare-execution'});assert.equal(r.status,200);const q=buys(r.body.openingPlan).reduce((n,o)=>n+o.shares,0);assert.equal(q,49);
 const ticket={id:'api-fourth',symbol:'MRNA',side:'buy',shares:q,price:100.12,fee:0,executedAt:api.fixture.now.toISOString()};
 r=await api.request('POST',{operation:'record-intraday',ticket,expectedRevision:r.body.decision.revision});assert.equal(r.status,200);assert.equal(r.body.decision.positions.length,4);near(r.body.decision.brokerageCash,94.12);
 r=await api.request('GET');assert.equal(r.status,200);assert.equal(r.body.decision.positions.find(p=>p.symbol==='MRNA').shares,49);near(r.body.decision.brokerageCash,94.12);
 evidence.cases.push({case:'real-api-fill-and-reload',status:'PASS'});
 // Later current qualification can change without invalidating an actual Buy
 // already saved before an owner-recorded sale/replacement replan.
 api.fixture.setQuote('MRNA',110);
 const ownerSale={id:'after-fourth-owner-sale',symbol:'BBB',side:'sell',shares:40,price:100,fee:0,recordingReason:'owner-discretionary-exit',executedAt:api.fixture.now.toISOString()};
 r=await api.request('POST',{operation:'record-intraday',ticket:ownerSale,expectedRevision:r.body.decision.revision});assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.decision.positions.find(p=>p.symbol==='MRNA').shares,49);
 assert(!api.fixture.account.intradayActivity.plan.additionalSwingCapacity.symbols.includes('MRNA'));
 assert(api.fixture.account.intradayActivity.plan.orders.some(o=>o.symbol==='MRNA'&&o.side==='buy'&&o.additionalCapacityEvidence.rating==='Buy'));
 evidence.cases.push({case:'captured-fill-survives-changed-current-qualification',status:'PASS'});
 
 // Broker-funded fourth position can leave signed residuals without changing
 // the original sizing NAV, and its actual stop sale remains recordable.
 const negative=createWorkflowFixture('buy',{portfolio:portfolio.map(p=>p.symbol==='CASH'?{...p,shares:1000}:p)});negative.setCash(5000);negative.advance();const nv=await negative.prepare();
 const nq=buys(nv.openingPlan).reduce((n,o)=>n+o.shares,0);assert.equal(nq,41);
 const nb=await negative.prepare({id:'negative-fourth',symbol:'MRNA',side:'buy',shares:nq,price:100.12,fee:0,executedAt:negative.now.toISOString()});negative.account=nb.account;
 const nbook=completedBook(negative),nc=negative.service.deriveC1CompletedAccount({account:negative.account,book:nbook,now:new Date('2026-10-15T22:00:00Z')});
 const nl=negative.loader.load('lib/c1AccountLedger.js').continueC1ActualAccount({adoption:nc.adoption,sessions:negative.sessions.slice(220,222),historySessions:negative.sessions.slice(0,222),records:nc.records,observedAt:'2026-10-15T22:00:00Z'});
 assert(ids.every(id=>nl.books[id].cash<0));const neq=ids.reduce((n,id)=>n+nl.books[id].cash+Object.values(nl.books[id].positions).reduce((a,p)=>a+p.shares*100.025,0),0);near(neq,13000+120*.025+nq*(100.025-100.12));
 negative.account=nc;negative.book.model=nbook.model;negative.book.captures=nbook.captures;negative.now=new Date('2026-10-16T17:00:00Z');negative.setCash(0);negative.setOpeningFailure(true);negative.advance();
 const ns=await negative.prepare({id:'negative-fourth-stop',symbol:'MRNA',side:'sell',shares:nq,price:75,fee:.25,executedAt:negative.now.toISOString()});assert(!ns.decision.positions.some(p=>p.symbol==='MRNA'));near(ns.decision.brokerageCash,3074.75);
 evidence.cases.push({case:'negative-residual-fourth-position-and-stop',shares:nq,independentEquity:neq,cashAfterBuy:5000-nq*100.12,stopSaleCash:3074.75,remainingPositions:3,status:'PASS'});
 // Same unmodified early-rank exit rules monitor the additional position.
 const history=clone(f.sessions.slice(0,222)),records=clone(closed.records),market=f.loader.load('lib/marketSession.js');let day='2026-10-15',exit=null;
 for(let i=0;i<10;i++){
  do{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10);}while(!market.isUsMarketSessionDay(day));
  const s=clone(history.at(-1));s.date=day;s.decisionAt=day+'T21:00:00Z';for(const p of s.prices)p.date=day;
  for(const signal of [...s.signals,...s.positionSignals])if(signal.symbol==='MRNA')signal.researchFactors.momentumPercentile=-10;
  history.push(s);records.push({date:day,complete:true,fills:[]});
  const c=f.loader.load('lib/c1AccountLedger.js').continueC1ActualAccount({adoption:closed.adoption,sessions:history.slice(220),historySessions:history,records,observedAt:day+'T22:00:00Z'});
  assert(ids.every(id=>c.sleeves[id].openPositions.find(p=>p.symbol==='MRNA').stopPrice===continued.sleeves[id].openPositions.find(p=>p.symbol==='MRNA').stopPrice));
  if(ids.every(id=>c.sleeves[id].pendingDecisions.some(o=>o.symbol==='MRNA'&&o.side==='sell'&&o.reason==='early-rank-deterioration'))){exit=day;break;}
 }
 assert(exit,'Additional holding must receive the original early momentum rotation exit');evidence.cases.push({case:'additional-position-rotation',queuedOn:exit,reason:'early-rank-deterioration',allSleeves:true});
 // Retain Core ownership exactly; a new Swing lot does not migrate Core shares.
 const core={symbol:'MRNA',role:'Core',shares:10,avgCost:45,openedAt:'2026-01-02'};
 const merged=f.loader.load('lib/c1AccountPortfolio.js').mergeC1AccountPortfolio([core,...portfolio],saved.decision);assert.deepEqual(clone(merged.find(p=>p.role==='Core')),core);assert.equal(merged.find(p=>p.symbol==='MRNA'&&p.role==='Swing').shares,49);
 const replay=f.loader.load('lib/c1ActualFillReplay.js').createC1ActualFillReplay({contract:'c1-actual-fill-replay-v1',sessions:[{date:'2026-10-15',fills:[{symbol:'MRNA',side:'buy',reason:'Buy',shares:1,price:100,fee:0,additionalCapacity:true}]}]}, {asOfSession:'2026-10-14'},[{date:'2026-10-15'}]);assert.equal(replay.additionalCapacityAllowed('2026-10-15','MRNA','Buy'),false,'Serialized flags cannot permit historical capacity');
 let source=fs.readFileSync('lib/c1AccountSimulator.js','utf8');for(const [a,b] of require('./c1-non-cash-adoption-seams.cjs')){assert.equal(source.split(b).length,2);source=source.replace(b,a);}for(const [before,after] of require('./c1-additional-capacity-seams.cjs')){assert.equal(source.split(after).length,2);source=source.replace(after,before);}
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),'8a3e1544efd3c612201127ea1e9a1f82e22ca7758ef94c10419d588025b50ec9','All production engine bodies outside capacity seam identical');
 evidence.status='PASS';fs.mkdirSync('work/capacity-evidence',{recursive:true});fs.writeFileSync('work/capacity-evidence/workflow.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS: fourth Swing purchase, exact unused-exception parity, API persistence, stops, rotation, blockers and Core preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
