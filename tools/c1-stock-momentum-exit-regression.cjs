// Actual shared momentum/account adapters with fictional accepted evidence only.
// No provider, private account, network, brokerage, or investment-performance claim.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const market=loader.load('lib/marketSession.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const symbol='ZZQA',other='ZZQB';
const ids=['base','cooldown15','sector40'];
const dates=[];
for(let time=Date.parse('2026-11-02T12:00:00Z');time<=Date.parse('2026-11-23T12:00:00Z');time+=86400000){
 const date=new Date(time).toISOString().slice(0,10);if(market.isUsMarketSessionDay(date))dates.push(date);
}
function acceptedSessions(overrides={}){
 return dates.map(date=>{
  const close=overrides[date]?.close??({'2026-11-16':199,'2026-11-17':198,'2026-11-18':197,'2026-11-19':205,'2026-11-20':206}[date]??200);
  const timing={available:true,asOf:date,macdImproving:date>='2026-11-19',...(overrides[date]?.timing||{})};
  return {date,decisionAt:date+'T21:00:00.000Z',universeSymbols:[symbol,other],corporateActions:[],
   prices:[symbol,other].map(name=>({symbol:name,date,open:name===symbol?close:100,high:name===symbol?close:100,low:name===symbol?close:100,close:name===symbol?close:100,adjusted:true,volume:10000000})),
   signals:[{symbol,entryTiming:timing},{symbol:other,entryTiming:{available:true,asOf:date,macdImproving:true}}]};
 });
}
function policy({openedAt='2026-11-10',date='2026-11-19',shares=10,periods=[],participatingAllocations=ids}={}){
 return {contract:'c1-account-policy-v2',version:'c1-account-policy-v2',active:true,complete:true,date,decisionDate:date,
  openInvestments:shares?[{symbol,openedAt,shares,participatingAllocations:[...participatingAllocations],realizedPnl:0,basisScope:'complete-recorded-lifecycle'}]:[],
  periods:clone(periods),blockedSymbols:[],stockCooldowns:[],activeExitSymbols:[],identity:'fictional-stock-policy'};
}
function books(){return Object.fromEntries(ids.map((id,index)=>[id,{cash:1000+index*100,positions:{[symbol]:{shares:[3,5,2][index],avgCost:200-index,openedAt:index?'2026-11-16':'2026-11-10'}}}]));}
function ownedDecision(){return {contract:'c1-account-decision-v1',revision:1,current:true,sourceSessionDate:'2026-11-18',decisionId:'fictional-decision',actionVersion:'fictional-decision',accountPolicy:policy(),
 positions:[{symbol,shares:10,avgCost:199.1,openedAt:'2026-11-10',stops:ids.map((sleeve,index)=>({sleeve,shares:[3,5,2][index],price:175+index})),exits:[],reviewRules:[],recentMomentumReviews:[],action:'Hold'}],opportunities:[]};}
const perOrder=(id,sleeve,side,shares,reason='Buy',extra={})=>({id,symbol,sleeve,date:'2026-11-19',side,shares,estimatedPrice:196,reason,executable:false,...extra});
const readReview=(reviews,name=symbol)=>{
 if(typeof reviews?.get==='function')return reviews.get(name);
 if(Array.isArray(reviews))return reviews.find(row=>row.symbol===name);
 if(Array.isArray(reviews?.reviews))return reviews.reviews.find(row=>row.symbol===name);
 return reviews?.[name];
};
const exitReason=review=>review?.exitReason??review?.state?.exitReason??null;
function run(){
 const api=loader.load('lib/c1StockMomentumExit.js');
 const {buildC1StockMomentumReviews:build,withC1StockMomentumDecision:decision,applyC1StockMomentumOrders:orders}=api;
 assert.equal(typeof build,'function');assert.equal(typeof decision,'function');assert.equal(typeof orders,'function');
 const history=acceptedSessions(),accountPolicy=policy(),sourceSessionDate='2026-11-18';
 const input={accountPolicy,sessions:history.filter(row=>row.date<=sourceSessionDate),historySessions:history,sourceSessionDate,runs:{}};
 const inputBytes=JSON.stringify(input),held=books(),heldBytes=JSON.stringify(held);
 const reviews=build(input),review=readReview(reviews);
 assert(review,'The continuous account holding receives a stock-level review');
 assert.equal(exitReason(review),'recent-momentum-deterioration','Three verified weak closes confirm the shared ordinary stock exit despite later sleeve entries');
 const current=ownedDecision(),currentBytes=JSON.stringify(current),next=decision(current,reviews);
 const row=next.positions.find(row=>row.symbol===symbol);
 assert.equal(row.exits.reduce((sum,exit)=>sum+exit.shares,0),10,'One verified momentum exit covers every recorded Swing share');
 assert.deepEqual(Array.from(row.exits.map(exit=>exit.sleeve)).sort(),[...ids].sort());
 assert.deepEqual(clone(row.stops),clone(current.positions[0].stops),'Expanding a momentum sale cannot rewrite individual stops');
 assert.equal(JSON.stringify(current),currentBytes,'Decision projection cannot mutate its source holdings');

 const initial=[perOrder('old-momentum','base','sell',3,'recent-momentum-deterioration'),perOrder('conflicting-buy','cooldown15','buy',1),
  perOrder('other-buy','base','buy',1,'Buy',{symbol:other}),perOrder('stronger-stop','sector40','sell',2,'initial-stop'),
  perOrder('standing-stop','cooldown15','sell',5,'initial-stop',{condition:'stop-triggered'})];
 const priceMap=new Map([[symbol,{symbol,open:196,observedPrice:195.5}],[other,{symbol:other,open:100,observedPrice:100}]]);
 const initialBytes=JSON.stringify(initial),planned=orders({orders:initial,books:held,reviews,prices:priceMap,date:'2026-11-19'});
 const exits=planned.orders.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition);
 assert.equal(exits.reduce((sum,order)=>sum+order.shares,0),10,'Concrete recording orders match full ticker decision quantity');
 assert.equal(new Set(exits.map(order=>order.sleeve)).size,3,'A protective overlap cannot duplicate a sleeve sale');
 assert(exits.some(order=>order.sleeve==='sector40'&&order.reason==='initial-stop'),'Existing protective reason retains priority');
 assert(!planned.orders.some(order=>order.symbol===symbol&&order.side==='buy'),'A full ticker exit forbids cross-allocation conflicting purchases');
 assert(planned.orders.some(order=>order.symbol===other&&order.side==='buy'),'An unrelated purchase is not blocked by the ticker exit');
 assert(planned.orders.some(order=>order.id==='standing-stop'&&order.condition==='stop-triggered'),'An untriggered conditional stop retains its original identity');
 assert(planned.blockedOrders.some(order=>order.id==='conflicting-buy'),'Withdrawn purchase is explicit');
 assert.equal(JSON.stringify(initial),initialBytes);assert.equal(JSON.stringify(held),heldBytes);

 const {reconcileC1ActualAccountFills}=loader.load('lib/c1AccountLedger.js');
 const plan={contract:'c1-actual-account-opening-plan-v1',date:'2026-11-19',sourceSessionDate,openingBooks:held,orders:planned.orders};
 const fills=exits.map((order,index)=>({id:'fictional-exit:'+index,orderId:order.id,symbol,side:'sell',shares:order.shares,price:195,fee:.1,executedAt:'2026-11-19T16:00:00.000Z'}));
 const actual=reconcileC1ActualAccountFills({plan,fills,observedAt:'2026-11-19T16:01:00.000Z'});
 assert(ids.every(id=>!actual.books[id].positions[symbol]),'Real accounting reconciliation accepts the full recorded sale without overselling');
 assert(Math.abs(actual.actualCash-(3300+10*195-.3))<1e-7,'Actual proceeds and fees reconcile exactly without projected fills');

 const onEntry=build({...input,accountPolicy:policy({openedAt:'2026-11-18'})});
 assert.equal(exitReason(readReview(onEntry)),null,'The first global entry day cannot establish post-entry confirmations');
 const newer=build({...input,accountPolicy:policy({openedAt:'2026-11-16'})});
 assert.equal(exitReason(readReview(newer)),null,'A genuinely new global lifecycle has only two post-entry closes by November18');
 assert.equal(review.streak,3,'The original account episode receives exactly three distinct completed confirmations');
 assert.equal(readReview(newer).streak,2,'Later entry creates only two confirmations when the account itself was genuinely new');
 const greenContinuation=acceptedSessions({'2026-11-16':{close:190},'2026-11-17':{close:191},'2026-11-18':{close:189}});
 const continued=readReview(build({...input,sessions:greenContinuation.filter(row=>row.date<=sourceSessionDate),historySessions:greenContinuation}));
 assert.equal(continued.streak,3,'A green latest close retains the established counter only while both longer windows remain negative and MACD is not improving');
 const priorOriginalSold=build({...input,accountPolicy:policy({shares:7,participatingAllocations:['cooldown15','sector40']})});
 assert.equal(exitReason(readReview(priorOriginalSold)),'recent-momentum-deterioration','Selling the original sleeve while others remain cannot restart the account clock');
 const remainingBooks=books();delete remainingBooks.base.positions[symbol];
 const remaining=orders({orders:[],books:remainingBooks,reviews:priorOriginalSold,prices:priceMap,date:'2026-11-19'});
 assert.equal(remaining.orders.filter(order=>order.side==='sell'&&!order.condition).reduce((sum,order)=>sum+order.shares,0),7,'An outstanding stock exit follows remaining actual ownership after a partial liquidation');

 const recoveryInput={...input,accountPolicy:policy({date:'2026-11-20'}),sourceSessionDate:'2026-11-19',sessions:history.filter(row=>row.date<='2026-11-19')};
 assert.equal(exitReason(readReview(build(recoveryInput))),'recent-momentum-deterioration','A later recovery cannot clear an issued, unfilled stock exit');
 const missing=clone(history);missing.find(row=>row.date==='2026-11-19').signals=[];
 assert.equal(exitReason(readReview(build({...recoveryInput,sessions:missing.filter(row=>row.date<='2026-11-19'),historySessions:missing}))),'recent-momentum-deterioration','Missing later evidence cannot erase an established stock exit');
 const neverValid=clone(history);neverValid.find(row=>row.date==='2026-11-17').signals=[];
 assert.equal(exitReason(readReview(build({...input,sessions:neverValid.filter(row=>row.date<=sourceSessionDate),historySessions:neverValid}))),null,'A missing confirmation cannot be invented from elapsed days or current data');
 for(const invalidate of [
  row=>{row.stale=true;},
  row=>{row.prices[0].date='2026-11-16';},
  row=>{row.prices.push(clone(row.prices[0]));},
  row=>{row.signals[0].entryTiming.macdImproving='false';},
  row=>{row.signals[0].entryTiming.asOf='2026-11-16';},
  row=>{row.signals[0].entryTiming.availableAt='2026-11-18T21:00:00.000Z';}
 ]){
  const invalid=clone(history);invalidate(invalid.find(row=>row.date==='2026-11-17'));
  const rejected=readReview(build({...input,sessions:invalid.filter(row=>row.date<=sourceSessionDate),historySessions:invalid}));
  assert.equal(exitReason(rejected),null,'Invalid/stale/duplicate/future-dated inputs cannot manufacture the third confirmation');
 }
 const duplicate=clone(history);duplicate.splice(duplicate.findIndex(row=>row.date==='2026-11-17'),0,clone(duplicate.find(row=>row.date==='2026-11-17')));
 assert.throws(()=>build({...input,sessions:duplicate.filter(row=>row.date<=sourceSessionDate),historySessions:duplicate}),/chronological|Unique|duplicate/i,'Duplicate market sessions cannot silently gain a confirmation');
 const recoveredBeforeActivation=acceptedSessions({'2026-11-12':{close:199},'2026-11-13':{close:198},'2026-11-16':{close:197},'2026-11-17':{close:203,timing:{macdImproving:true}},'2026-11-18':{close:204,timing:{macdImproving:true}}});
 assert.equal(exitReason(readReview(build({...input,sessions:recoveredBeforeActivation.filter(row=>row.date<=sourceSessionDate),historySessions:recoveredBeforeActivation}))),null,'A historical recovered weak patch cannot acquire a retroactive pre-activation exit latch');

 const completed=[{symbol,openedAt:'2026-11-10',triggerDate:'2026-11-18',completedAt:'2026-11-18T16:00:00.000Z',netRealizedPnl:-25,loss:true,participatingAllocations:ids}];
 const flat=build({...input,accountPolicy:policy({shares:0,periods:completed})});
 assert(!readReview(flat)||!exitReason(readReview(flat)),'No stock exit remains against zero actual ownership');
 const reentry=build({...input,accountPolicy:policy({openedAt:'2026-11-18',shares:2,periods:completed})});
 assert.equal(exitReason(readReview(reentry)),null,'A same-day completed exit and real reentry cannot inherit the closed episode latch');
 assert.notEqual(readReview(reentry).episodeId,review.episodeId,'A completed actual account episode has a distinct future identity');
 const nextEntry=build({...recoveryInput,accountPolicy:policy({openedAt:'2026-11-19',date:'2026-11-20',shares:2,periods:completed})});
 assert.equal(exitReason(readReview(nextEntry)),null,'A later real reentry begins a fresh account episode');
 const flatCloses=acceptedSessions(Object.fromEntries(['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20'].map(date=>[date,{close:200,timing:{macdImproving:false}}])));
 const profit={symbol,phase:'close-holding',date:'2026-11-18',sourceSessionDate:'2026-11-18',available:true,exitReason:'recent-momentum-profit-protection',state:{streak:2,profitProtectionArmed:true},metrics:{streak:2,verifiedPeak:true,meaningfulGiveback:true}};
 const profitInput={...input,sessions:flatCloses.filter(row=>row.date<=sourceSessionDate),historySessions:flatCloses,runs:{sector40:{prior:{recentMomentumDecisions:[profit]}}}};
 const profitBytes=JSON.stringify(profitInput),archived=readReview(build(profitInput));
 assert.equal(exitReason(archived),'recent-momentum-profit-protection','An accepted allocation profit exit promotes the full ticker without inventing a shared profit threshold');
 assert.equal(archived.streak,0,'Promoting an existing profit exit does not manufacture ordinary deterioration');
 assert.equal(exitReason(readReview(build({...profitInput,accountPolicy:policy({date:'2026-11-20'}),sourceSessionDate:'2026-11-19',sessions:flatCloses.filter(row=>row.date<='2026-11-19')}))),'recent-momentum-profit-protection','Archived verified profit exit remains latched after a later no-fill session');
 for(const patch of [{available:false},{phase:'open-entry'},{sourceSessionDate:'2026-11-20'},{sourceSessionDate:'2026-11-17'}]){
  const invalid={...profitInput,runs:{sector40:{recentMomentumDecisions:[{...profit,...patch}]}}};
  assert.equal(exitReason(readReview(build(invalid))),null,'Unavailable/non-holding/future/pre-activation archived rows cannot create an exit');
 }
 assert.equal(exitReason(readReview(build({...profitInput,accountPolicy:policy({openedAt:'2026-11-18',shares:2,periods:completed})}))),null,'A prior allocation exit cannot attach to same-day real account reentry');
 assert.equal(JSON.stringify(profitInput),profitBytes,'Reading archived accepted exits cannot mutate saved model observations');
 const rankInput={...profitInput,runs:{base:{prior:{openPositions:[{symbol,rankVerified:true}],pendingDecisions:[{symbol,side:'sell',reason:'early-rank-deterioration',fraction:1}]}}}};
 const rank=readReview(build(rankInput));
 assert.equal(exitReason(rank),'early-rank-deterioration','An already confirmed current rank exit retains its original criteria and promotes the whole stock');
 assert.equal(decision(ownedDecision(),build(rankInput)).positions[0].exits.reduce((sum,exit)=>sum+exit.shares,0),10);
 for(const prior of [
  {openPositions:[{symbol,rankVerified:false}],pendingDecisions:rankInput.runs.base.prior.pendingDecisions},
  {openPositions:[],pendingDecisions:rankInput.runs.base.prior.pendingDecisions},
  {openPositions:[{symbol,rankVerified:true}],pendingDecisions:[{...rankInput.runs.base.prior.pendingDecisions[0],condition:'stop-triggered'}]}
 ])assert.equal(exitReason(readReview(build({...rankInput,runs:{base:{prior}}}))),null,'A rank exit needs an actually held, verified, unconditional current instruction');
 const capturedPolicy={...policy({date:'2026-11-20',shares:7,participatingAllocations:['cooldown15','sector40']}),stockMomentumExitEvidence:[{symbol,reason:rank.exitReason,episodeId:rank.episodeId,triggerSourceSessionDate:sourceSessionDate}]};
 const captured=build({...profitInput,accountPolicy:capturedPolicy,sourceSessionDate:'2026-11-19',sessions:flatCloses.filter(row=>row.date<='2026-11-19'),runs:{}});
 assert.equal(exitReason(readReview(captured)),'early-rank-deterioration','A partially recorded original stock exit remains effective for the same continuous episode after current rank recovery');
 assert.equal(exitReason(readReview(build({...profitInput,accountPolicy:{...policy({openedAt:'2026-11-18',shares:2,periods:completed}),stockMomentumExitEvidence:capturedPolicy.stockMomentumExitEvidence},runs:{}}))),null,'Saved exit proof cannot transfer to a completed-and-reentered account episode');
 const recordOnly=orders({orders:[],books:held,reviews,prices:new Map(),date:'2026-11-19',recordingOnly:true});
 assert.equal(recordOnly.orders.filter(order=>order.side==='sell'&&!order.condition).reduce((sum,order)=>sum+order.shares,0),10,'A confirmed completed sale remains recordable during unavailable opening collection');
 assert(recordOnly.orders.every(order=>order.executable===false&&!Object.hasOwn(order,'estimatedPrice')),'Accounting-only recovery does not manufacture an execution quote or new authority');
 const prePolicy=policy({date:'2026-11-18'}),preInput={...input,accountPolicy:prePolicy,sourceSessionDate:'2026-11-17',sessions:history.filter(row=>row.date<='2026-11-17')};
 const pre=build(preInput),preDecision=ownedDecision(),preOrders=[...initial];
 assert.equal(JSON.stringify(decision(preDecision,pre)),JSON.stringify(preDecision),'Pre-activation decision behavior remains exact');
 assert.equal(JSON.stringify(orders({orders:preOrders,books:held,reviews:pre,prices:priceMap,date:'2026-11-18'}).orders),JSON.stringify(preOrders),'Pre-activation order identities and quantities remain exact');
 assert.equal(JSON.stringify(input),inputBytes,'Accepted sessions and policy observations remain byte-unchanged');
 assert.equal(JSON.stringify(held),heldBytes,'Actual cash, basis, dates and holdings remain byte-unchanged');
 console.log('PASS: shared stock momentum clock and full-ticker decision/order quantities preserve actual accounting, stop priority, activation, episode boundaries, evidence limits and sticky unfilled exits; synthetic behavior only.');
}
async function actualHandler(){
 const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
 const {currentEventEvidenceFor}=require('./fixtures/c1-trading-workflow.cjs');
 let f,unavailable=false;
 const api=createWorkflowApi('buy',{baselineDate:'2026-11-13',now:'2026-11-19T17:00:00.000Z',
  portfolio:[{symbol:'BBB',role:'Swing',shares:3,avgCost:100,openedAt:'2026-11-10'},{symbol:'CASH',role:'Swing',shares:10000,avgCost:1}],
  collectOpening:async()=>{
   if(unavailable)throw Error('Fictional current opening unavailable');
   const source=f.book.model.sessions.at(-1),date=f.now.toISOString().slice(0,10),observedAt=f.now.toISOString();
   return {date,decisionAt:observedAt,universeSymbols:source.universeSymbols,corporateActions:[],
    currentEventEvidence:currentEventEvidenceFor(source.universeSymbols,f.now),
    prices:source.prices.map(row=>({...row,date,open:row.close,observedPrice:row.close,observedAt})),
    receipt:{provider:'FMP',observedAt,membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true}};
  }});
 f=api.fixture;
 const rename=value=>JSON.parse(JSON.stringify(value).replaceAll('"BBB"','"ZZQA"'));
 function assertJoinedShares(viewResult,quantity){
  const {joinC1Opportunities}=f.loader.load('lib/c1OpportunitiesContract.js');
  for(const view of ['portfolio','opportunities']){
   const joined=joinC1Opportunities({...viewResult,screenRows:rename(f.screenRows()),positionRows:rename(f.screenRows()),screenCurrent:true,
    portfolio:viewResult.decision.positions.map(row=>({...row,role:'Swing'})),view},{readTime:()=>f.now});
   const projected=joined.projection,held=projected.sellActions.find(row=>row.symbol===symbol);
   assert(held,'Actual '+view+' join publishes the held stock Sell');
   assert.equal(held.holding.label,'SELL — MOMENTUM EXIT');
   assert.equal(held.sellInstruction.recordedShares,quantity,'Actual '+view+' join uses current recorded ownership');
   assert.equal(held.sellInstruction.shares,quantity,'Actual '+view+' instruction covers the full remaining stock');
   assert.equal(projected.positionOrders.filter(order=>order.symbol===symbol).reduce((sum,order)=>sum+order.shares,0),quantity,'Actual '+view+' checked orders match the displayed instruction');
   assert(!projected.actionableBuys.some(order=>order.symbol===symbol),'Actual '+view+' cannot publish a conflicting Buy');
  }
 }
 f.account=rename(f.account);f.portfolio.splice(0,f.portfolio.length,...rename(f.portfolio));
 for(const session of f.sessions)Object.assign(session,rename(session));
 for(const date of ['2026-11-18','2026-11-19','2026-11-20']){
  const session=clone(f.sessions.at(-1));session.date=date;session.decisionAt=date+'T21:00:00.000Z';
  for(const row of session.prices)row.date=date;
  for(const field of ['signals','positionSignals'])for(const row of session[field]||[])row.entryTiming.asOf=date;
  f.sessions.push(session);
 }
 for(const session of f.sessions){
  if(session.date<'2026-11-16')continue;
  const value={'2026-11-16':99,'2026-11-17':98,'2026-11-18':97,'2026-11-19':100,'2026-11-20':101}[session.date];
  const price=session.prices.find(row=>row.symbol===symbol);
  Object.assign(price,{open:value,high:value*1.001,low:value*.999,close:value});
  for(const field of ['signals','positionSignals'])for(const row of session[field]||[])if(row.symbol===symbol){row.price=value;Object.assign(row.entryTiming,{available:true,macdImproving:session.date>'2026-11-18',asOf:session.date});}
 }
 const seedTemplate=clone(Object.values(f.account.adoption.seeds).flatMap(seed=>seed.positions)[0]);
 for(const id of ids){
  const seed=f.account.adoption.seeds[id],quantity=id==='base'?3:0;
  seed.positions=quantity?[{...clone(seedTemplate),symbol,shares:quantity/seed.actualDollarsPerModelDollar,entryPrice:100,openedAt:'2026-11-10'}]:[];
  seed.cash=100000-quantity*100/seed.actualDollarsPerModelDollar;
 }
 const ledger=f.loader.load('lib/c1AccountLedger.js'),openingBooks=ledger.c1AccountBooks(f.account.adoption);
 const issuedOrders=[['cooldown15',5],['sector40',2]].map(([sleeve,shares])=>({id:'fictional-new:'+sleeve,sleeve,symbol,date:'2026-11-16',side:'buy',shares,estimatedPrice:99,reason:'Buy',executable:false}));
 const executionEvidence={contract:'c1-actual-account-opening-plan-v1',date:'2026-11-16',sourceSessionDate:'2026-11-13',observedAt:'2026-11-16T15:00:00.000Z',openingBooks,orders:issuedOrders,providerVerified:true,executable:false};
 const recordedFills=issuedOrders.map((order,index)=>({id:'fictional-new-fill:'+index,orderId:order.id,symbol,side:'buy',shares:order.shares,price:99,fee:index?.02:.05,executedAt:'2026-11-16T16:00:00.000Z'}));
 f.account.records=[{date:'2026-11-16',openingObservedAt:executionEvidence.observedAt,complete:true,executionEvidence,fills:recordedFills},
  ...['2026-11-17','2026-11-18'].map(date=>({date,openingObservedAt:date+'T15:00:00.000Z',complete:true,fills:[]}))];
 f.book.model.sessions=f.sessions.filter(session=>session.date<='2026-11-18');
 f.book.captures=f.book.model.sessions.map(session=>({sessionDate:session.date,hash:'synthetic-stock-exit:'+session.date,observedAt:session.decisionAt}));
 f.account.sourceHashes=f.book.captures.filter(row=>row.sessionDate>='2026-11-13').map(row=>({date:row.sessionDate,hash:row.hash}));
 f.setCash(9000);
 async function legacyPartialCase(missingOpening,withPostedBuy=false){
  let legacyFixture;
  const legacyApi=createWorkflowApi('buy',{baselineDate:'2026-11-13',now:'2026-11-19T17:00:00.000Z',
   collectOpening:async()=>{
    if(missingOpening)throw Error('Fictional opening unavailable after legacy partial execution');
    const source=legacyFixture.book.model.sessions.at(-1),observedAt=legacyFixture.now.toISOString();
    return {date:'2026-11-19',decisionAt:observedAt,universeSymbols:source.universeSymbols,corporateActions:[],
     currentEventEvidence:currentEventEvidenceFor(source.universeSymbols,legacyFixture.now),
     prices:source.prices.map(row=>({...row,date:'2026-11-19',open:row.close,observedPrice:row.close,observedAt})),
     receipt:{provider:'FMP',observedAt,membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true}};
   }});
  legacyFixture=legacyApi.fixture;legacyFixture.account=clone(f.account);
  legacyFixture.book.model=clone(f.book.model);legacyFixture.book.captures=clone(f.book.captures);
  const originalLedger=legacyFixture.loader.load('lib/c1AccountLedger.js');
  const actualBefore=originalLedger.continueC1ActualAccount({adoption:legacyFixture.account.adoption,
   sessions:legacyFixture.book.model.sessions.filter(row=>row.date>='2026-11-13'),historySessions:legacyFixture.book.model.sessions,
   records:legacyFixture.account.records,observedAt:legacyFixture.now});
  const oldOrder={id:'fictional-legacy:base:momentum',sleeve:'base',symbol,date:'2026-11-19',side:'sell',shares:3,
   estimatedPrice:96.88,reason:'recent-momentum-deterioration',phase:1,executable:false};
  const oldPlan={contract:'c1-actual-account-opening-plan-v1',date:'2026-11-19',sourceSessionDate:'2026-11-18',observedAt:'2026-11-19T15:00:00.000Z',
   providerVerified:true,executable:false,openingBooks:clone(actualBefore.books),orders:[oldOrder,
    ...['cooldown15','sector40'].map(sleeve=>({id:'fictional-legacy:stop:'+sleeve,sleeve,symbol,date:'2026-11-19',side:'sell',shares:actualBefore.books[sleeve].positions[symbol].shares,
     estimatedPrice:85.14,reason:'initial-stop',condition:'stop-triggered',phase:4,executable:false}))]};
  const oldTicket={id:'fictional-pre-release-sale',symbol,side:'sell',shares:3,price:96.75,fee:.03,executedAt:'2026-11-19T16:45:00.000Z'};
  const oldFill={id:oldTicket.id+':base',orderId:oldOrder.id,symbol,side:'sell',shares:3,price:96.75,fee:.03,executedAt:oldTicket.executedAt};
  const buyOrder={id:'fictional-legacy:unrelated-buy',sleeve:'base',symbol:'CCC',date:'2026-11-19',side:'buy',shares:1,estimatedPrice:100,reason:'Buy',executable:false};
  const buyTicket={id:'fictional-pre-release-buy',symbol:'CCC',side:'buy',shares:1,price:100,fee:.01,executedAt:'2026-11-19T16:46:00.000Z'};
  const buyFill={...buyTicket,id:buyTicket.id+':base',orderId:buyOrder.id};
  if(withPostedBuy)oldPlan.orders.push(buyOrder);
  legacyFixture.account.revision++;
  legacyFixture.account.intradayActivity={date:'2026-11-19',openingObservedAt:oldPlan.observedAt,plan:oldPlan,recordingEvidence:clone(oldPlan),tickets:[oldTicket,...(withPostedBuy?[buyTicket]:[])],fills:[oldFill,...(withPostedBuy?[buyFill]:[])]};
  const ticketBytes=JSON.stringify(oldTicket),fillBytes=JSON.stringify(oldFill),recordsBytes=JSON.stringify(legacyFixture.account.records);
  let response=await legacyApi.request('POST',{operation:'prepare-execution'});assert.equal(response.status,200,JSON.stringify(response.body));
  const session=response.body.intradaySession;
  if(!missingOpening){
   const checked=response.body.manualRecommendations.orders.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition);
   assert.equal(checked.reduce((sum,order)=>sum+order.shares,0),7,'A newly deployed full-stock policy expands a legacy partial-sale plan to the actual remaining seven shares');
  }else assert.equal(session.sellOnly,true,'Unavailable opening supplies accounting-only recording, not checked trade authority');
  const remaining=originalLedger.reconcileC1ActualAccountFills({plan:session.plan,fills:session.fills,observedAt:legacyFixture.now.toISOString()});
  assert.equal(remaining.outstanding.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition).reduce((sum,order)=>sum+order.shares,0),7,'Legacy original executed IDs coexist with new remaining full-stock recorder quantity');
  assert.equal(JSON.stringify(legacyFixture.account.intradayActivity.tickets[0]),ticketBytes);
  assert.equal(JSON.stringify(legacyFixture.account.intradayActivity.fills[0]),fillBytes);
  const finish={id:'fictional-after-release-sale',symbol,side:'sell',shares:7,price:96.5,fee:.07,executedAt:legacyFixture.now.toISOString()};
  response=await legacyApi.request('POST',{operation:'record-intraday',ticket:finish,expectedRevision:legacyFixture.account.revision});assert.equal(response.status,200,JSON.stringify(response.body));
  assert(!response.body.decision.positions.some(row=>row.symbol===symbol),'The remaining completed actual sale is recordable after release without owner-exit relabeling');
  const saved=legacyFixture.account.intradayActivity;
  assert.equal(saved.tickets.length,withPostedBuy?3:2);assert.equal(JSON.stringify(saved.tickets[0]),ticketBytes);assert.equal(JSON.stringify(saved.fills.find(fill=>fill.id===oldFill.id)),fillBytes);
  if(withPostedBuy){
   assert.equal(JSON.stringify(saved.tickets.find(ticket=>ticket.id===buyTicket.id)),JSON.stringify(buyTicket),'The unrelated already completed purchase ticket remains byte-identical');
   assert.equal(JSON.stringify(saved.fills.find(fill=>fill.id===buyFill.id)),JSON.stringify(buyFill),'The unrelated posted Buy cannot be remapped or replayed by a stock-exit upgrade');
   assert.equal(response.body.decision.positions.find(row=>row.symbol==='CCC').shares,1,'A different owned stock is unaffected by the full-stock sale');
  }
  assert.equal(saved.plan.orders.find(order=>order.id===oldOrder.id).reason,oldOrder.reason,'The historical executed sale retains its original reason and order identity');
  assert.equal(JSON.stringify(legacyFixture.account.records),recordsBytes,'Release migration never rewrites prior completed financial records');
 }
 await legacyPartialCase(false);await legacyPartialCase(true);await legacyPartialCase(false,true);
 const financial=JSON.stringify({adoption:f.account.adoption,records:f.account.records,brokerageCash:f.account.brokerageCash});
 let result=await api.request('GET');assert.equal(result.status,200,JSON.stringify(result.body));
 let position=result.body.decision.positions.find(row=>row.symbol===symbol);assert.equal(position.shares,10);
 assert.equal(position.stockMomentumReview.streak,3,'The real handler publishes the shared account confirmation counter');
 assert.equal(result.body.decision.accountActions.find(row=>row.symbol===symbol&&row.side==='sell').shares,10,'The actual GET account summary exits all fictional ten shares');
 result=await api.request('POST',{operation:'prepare-execution'});assert.equal(result.status,200,JSON.stringify(result.body));
 assert(result.body.openingPlan,JSON.stringify(result.body));
 const sells=result.body.manualRecommendations.orders.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition);
 assert.equal(sells.reduce((sum,order)=>sum+order.shares,0),10,'Fresh real prepare-execution authorizes the full stock quantity with supplied checked evidence');
 assertJoinedShares(result.body,10);
 assert.equal(JSON.stringify({adoption:f.account.adoption,records:f.account.records,brokerageCash:f.account.brokerageCash}),financial,'Read and checked opening review preserve every prior financial record');
 const ticket={id:'fictional-stock-partial',symbol,side:'sell',shares:3,price:96.75,fee:.03,executedAt:'2026-11-19T17:00:00.000Z'};
 result=await api.request('POST',{operation:'record-intraday',ticket,expectedRevision:f.account.revision});assert.equal(result.status,200,JSON.stringify(result.body));
 position=result.body.decision.positions.find(row=>row.symbol===symbol);assert.equal(position.shares,7);
 assert.equal(result.body.decision.accountActions.find(row=>row.symbol===symbol&&row.side==='sell').shares,7,'Partial actual fill leaves the entire remaining ticker under its original exit');
 assert.equal(f.account.intradayActivity.tickets.length,1);assert.equal(f.account.intradayActivity.tickets[0].id,ticket.id);
 result=await api.request('POST',{operation:'prepare-execution'});assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.manualRecommendations.orders.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition).reduce((sum,order)=>sum+order.shares,0),7,'A subsequent checked opening does not restart the confirmation clock or restore filled shares');
 assertJoinedShares(result.body,7);
 unavailable=true;
 result=await api.request('POST',{operation:'prepare-execution'});assert.equal(result.status,200,JSON.stringify(result.body));
 assert.equal(result.body.intradaySession.sellOnly,true);
 const recording=result.body.intradaySession,remaining=ledger.reconcileC1ActualAccountFills({plan:recording.plan,fills:recording.fills,observedAt:f.now.toISOString()});
 assert.equal(remaining.outstanding.filter(order=>order.symbol===symbol&&order.side==='sell'&&!order.condition).reduce((sum,order)=>sum+order.shares,0),7,'Unavailable opening collection retains original order identity and subtracts actual recorded fills from recorder capacity');
 const savedBytes=JSON.stringify(f.account);
 const excessive=await api.request('POST',{operation:'record-intraday',ticket:{...ticket,id:'fictional-oversale',shares:8,executedAt:f.now.toISOString()},expectedRevision:f.account.revision});
 assert.equal(excessive.status,422,'The real unavailable-opening recorder cannot oversell the remaining actual seven shares');assert.equal(JSON.stringify(f.account),savedBytes);
 const lastTicket={...ticket,id:'fictional-stock-completion',shares:7,price:96.5,fee:.07,executedAt:f.now.toISOString()};
 result=await api.request('POST',{operation:'record-intraday',ticket:lastTicket,expectedRevision:f.account.revision});assert.equal(result.status,200,JSON.stringify(result.body));
 assert(!result.body.decision.positions.some(row=>row.symbol===symbol),'Recording the actual remaining fill ends account-wide ownership');
 assert.equal(f.account.intradayActivity.tickets.length,2,'Only two actual broker tickets were recorded');
 assert(Math.abs(result.body.decision.actualCash-(10000-7*99-.07+3*96.75-.03+7*96.5-.07))<1e-7,'Actual final cash includes only recorded purchase and sale prices and fees');
 const completedCash=result.body.decision.actualCash,completedBytes=JSON.stringify(f.account);
 f.book.model.sessions=f.sessions.filter(session=>session.date<='2026-11-19');
 f.book.captures=f.book.model.sessions.map(session=>({sessionDate:session.date,hash:'synthetic-stock-exit:'+session.date,observedAt:session.decisionAt}));
 f.now='2026-11-20T17:00:00.000Z';
 const following=await api.request('GET');assert.equal(following.status,200,JSON.stringify(following.body));
 assert(!following.body.decision.positions.some(row=>row.symbol===symbol),'The next-session real account replay preserves the actual complete liquidation');
 assert(Math.abs(following.body.decision.actualCash-completedCash)<1e-7,'Next-session replay cannot invent a sale, rebuy or cash change');
 assert.equal(JSON.stringify(f.account),completedBytes,'A normal next-session read cannot rewrite the saved actual fills');
 assert.equal(JSON.stringify(f.account.records),JSON.stringify(JSON.parse(financial).records),'New recording never rewrites older completed sessions');
 console.log('PASS: real C1 HTTP handler and Portfolio/Opportunities joins agree on ten-share then seven-share exits after a partial actual fill; unavailable-opening recording and next-session replay preserve actual completion.');
}
run();actualHandler().catch(error=>{console.error(error);process.exitCode=1;});
