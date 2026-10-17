// Offline exploratory execution, explicitly separate from strict qualification.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createControlAdapter}=require('./account-adapter.cjs'),{challengerTransform}=require('./transform.cjs');
const {verifySources}=require('../c1-research/engine.cjs');
const root=path.resolve(__dirname,'../..'),plain=x=>JSON.parse(JSON.stringify(x));
function fillsFor(review,opening,bps){
 const books=plain(review.plan.openingBooks),prices=new Map(opening.prices.map(p=>[p.symbol,p])),fills=[];
 for(const o of review.plan.orders){
  const b=books[o.sleeve],p=prices.get(o.symbol);if(!p)throw Error('Missing executable quote '+o.symbol);
  let shares=o.shares,price=o.estimatedPrice;
  if(o.condition){assert.equal(o.condition,'stop-triggered');if(p.low>o.estimatedPrice)continue;shares=Math.min(shares,b.positions[o.symbol]?.shares||0);price=Math.min(p.open,o.estimatedPrice)*(1-bps/10000);}
  if(!shares)continue;
  assert(Number.isSafeInteger(shares)&&shares>0);assert(o.side==='buy'||shares<=(b.positions[o.symbol]?.shares||0));
  const delta=o.side==='buy'?shares:-shares;b.cash-=delta*price;assert(b.cash>=-1e-6);
  const held=(b.positions[o.symbol]?.shares||0)+delta;if(held)b.positions[o.symbol]={shares:held};else delete b.positions[o.symbol];
  fills.push({id:'exploratory:'+o.id,orderId:o.id,symbol:o.symbol,side:o.side,shares,price,fee:0,executedAt:o.condition?opening.date+'T19:00:00Z':openTime(opening.date)});
 }
 return fills;
}
function mark(books,s){const prices=new Map(s.prices.map(p=>[p.symbol,p.close]));let equity=0,cash=0;for(const b of Object.values(books)){assert(b.cash>=-1e-6);cash+=b.cash;equity+=b.cash;for(const [symbol,p] of Object.entries(b.positions)){assert(Number.isSafeInteger(p.shares)&&p.shares>0);if(!(prices.get(symbol)>0))throw Error('Missing held close '+symbol);equity+=p.shares*prices.get(symbol);}}return{date:s.date,equity,cash};}
function openTime(date){return date+(date>='2025-03-10'?'T13:30:00Z':'T14:30:00Z');}
function execute(dataset,arm,cost,{limit=Infinity,checkCausality=false,onProgress=()=>{},calculatorCache=true}={}){
 verifySources(root);
 require('./immutable-index.cjs').freezeRows(dataset);
 const adapter=createControlAdapter(root,{costBps:cost,policyMode:'retrospective-current',transform:challengerTransform(arm),calculatorCache}),loader=adapter.loader;
 const {buildC1StockScreenSnapshot,classifyC1StockScreen}=loader.load('lib/c1StockClassification.js'),{createC1ProspectiveSeeds}=loader.load('lib/c1AccountSeed.js');
 const sessions=dataset.sessions.slice(0,limit+1),warm=dataset.historyWarmup||[],snapshots=new Map();
 for(let i=0;i<sessions.length;i++)snapshots.set(sessions[i].date,buildC1StockScreenSnapshot(sessions[i],new Date(sessions[i].decisionAt),[...warm,...sessions.slice(0,i+1)]));
 if(typeof arm.sizing==='object')for(const cfg of Object.values(loader.load('lib/c1FrozenOptions.js').C1_FROZEN_OPTIONS)){
  cfg.researchLowerPct=arm.sizing.low;
  cfg.researchTargetPct=(signal,s)=>{const r=snapshots.get(s.date)?.candidates.find(c=>c.symbol===signal.symbol)?.researchRank;if(!snapshots.has(s.date))throw Error('Missing causal snapshot '+s.date);if(!r||r>9)return null;return arm.sizing.low+(arm.sizing.high-arm.sizing.low)*(9-r)/8;};
 }
 const portfolio=[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],adoption=createC1ProspectiveSeeds({portfolio,baseline:sessions[0],capitalRecord:{version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:loader.load('lib/portfolioGovernor.js').portfolioCompositionSignature(portfolio)},adoptionConfirmed:true});
 let books=loader.load('lib/c1AccountLedger.js').c1AccountBooks(adoption),records=[],curve=[mark(books,sessions[0])],trades=[],audit=[],screenDecisions=[],last;
 for(let i=1;i<sessions.length;i++){
  const s=sessions[i-1],opening=sessions[i],owned=sessions.slice(0,i),history=[...warm,...owned],observedAt=openTime(opening.date);
  const screen={decision:{stockScreen:snapshots.get(s.date),current:true,sourceSessionDate:s.date,decisionId:'exploratory:'+s.date},rows:s.screenRows,current:true};
  // Hypothetical independent brokerage observation rounded DOWN to cents.
  const account={brokerageCash:{balance:Math.floor((Object.values(books).reduce((a,b)=>a+b.cash,0)+1e-8)*100)/100,source:'manual-broker-balance',observedAt:opening.date+'T13:00:00Z'}};
  const args={adoption,sessions:owned,historySessions:history,records,opening,observedAt,screen,account},review=adapter.project(args);
  assert.deepEqual(plain(review.plan.openingBooks),plain(books));
  if(checkCausality&&i===1&&arm.id==='C'){const reference=require('../c1-research/control-adapter.cjs').createControlAdapter(root,{costBps:cost,policyMode:'retrospective-current'});assert.deepEqual(plain(review),plain(reference.project(args)));}
  if(checkCausality&&i===1){const future=plain(opening);for(const p of future.prices){p.high=p.open*10;p.low=p.open/10;p.close=p.open*3;};assert.deepEqual(plain(review),plain(adapter.project({...args,opening:future})));}
  const fills=fillsFor(review,opening,cost),accepted=adapter.record({review,fills,observedAt:opening.date+'T22:00:00Z'});records.push(accepted.record);books=accepted.accepted.books;
  const own=plain(review.plan.openingBooks);for(const f of fills){const o=review.plan.orders.find(o=>o.id===f.orderId),b=own[o.sleeve],p=b.positions[f.symbol],n=p?.shares||0,q=n+(f.side==='buy'?f.shares:-f.shares);b.cash+=(f.side==='buy'?-1:1)*f.shares*f.price-f.fee;if(q)b.positions[f.symbol]={shares:q,avgCost:f.side==='buy'?(n*(p?.avgCost||0)+f.shares*f.price+f.fee)/q:p.avgCost,openedAt:p?.openedAt||opening.date};else delete b.positions[f.symbol];}assert.deepEqual(plain(books),own);
  last=adapter.continue({adoption,sessions:sessions.slice(0,i+1),historySessions:[...warm,...sessions.slice(0,i+1)],records,observedAt:opening.date+'T22:00:00Z'});assert.deepEqual(plain(last.books),plain(books));
  for(const f of fills){const o=review.plan.orders.find(o=>o.id===f.orderId);trades.push({...f,date:opening.date,sleeve:o.sleeve,reason:o.reason});}
  const classified=classifyC1StockScreen({snapshot:screen.decision.stockScreen,rows:screen.rows,current:true});screenDecisions.push(...classified.map(r=>({date:s.date,...r})));
  audit.push({date:opening.date,heldBefore:[...new Set(Object.values(review.plan.openingBooks).flatMap(b=>Object.keys(b.positions)))],rawOrderIds:review.rawPlan.orders.map(o=>o.id),permittedOrderIds:review.plan.orders.map(o=>o.id),fills,screenBlocked:review.screenBlockedOrders.map(o=>({id:o.id,symbol:o.symbol,sleeve:o.sleeve})),eligibleSymbols:review.screenEvidence.buySymbols,cashBlocked:review.authorityPlan.cashBlockedOrders.length,entryReviews:review.rawPlan.entryReviews});curve.push(mark(books,opening));onProgress({arm:arm.id,cost,date:opening.date,completed:i,total:sessions.length-1});
 }
 return {arm:arm.id,cost,curve,trades,sleeves:last?.sleeves||{},screenDecisions,audit,finalBooks:books,label:'EXPLORATORY RETROSPECTIVE conditional fixed-cohort price-P&L; not historical production replay'};
}
module.exports={execute,fillsFor,mark,openTime};
