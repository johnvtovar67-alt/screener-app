import {simulatePointInTimePortfolio} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {c1ModelEventPhase} from './c1PaperEvents';
import {marketSessionDistance,easternMarketClock,latestCompletedMarketSessionDay} from './marketSession';

const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const whole=value=>{const n=Math.round(value);if(Math.abs(value-n)>1e-7||!Number.isSafeInteger(n)||n<0)throw new Error('Whole-share sleeve ownership required');return n;};
const ids=['base','cooldown15','sector40'];
export const C1_ACCOUNT_PILOT={contract:'c1-account-limited-pilot-v1',maxNames:3,maxPositionPct:.01,confirmationSessions:2};

function accountBooks(adoption) {
  if(adoption?.contract!=='c1-prospective-account-adoption-v1'||!adoption.seeds)throw new Error('Accepted prospective account required');
  const books={};
  for(const id of ids){
    const seed=adoption.seeds[id],scale=seed?.actualDollarsPerModelDollar;
    if(!positive(scale)||seed.sleeve!==id)throw new Error('Account unit conversion missing');
    books[id]={cash:seed.cash*scale,positions:Object.fromEntries(seed.positions.map(p=>[p.symbol,{shares:whole(p.shares*scale),avgCost:p.entryPrice,openedAt:p.openedAt}]))};
  }
  if(Math.abs(ids.reduce((sum,id)=>sum+books[id].cash,0)-adoption.actualCash)>1e-6)throw new Error('Opening account cash does not reconcile');
  return books;
}

// First-opening plan from actual opening balances. Opening prices and current
// membership still need server provenance before this can carry live authority.
export function planC1ActualAccountOpening({adoption,baseline,opening,observedAt}={}) {
  return planFromHistory({adoption,baseline,opening,observedAt,books:accountBooks(adoption),sessions:[baseline],replay:null});
}
function planFromHistory({adoption,baseline,opening,observedAt,books,sessions,replay}) {
  const now=new Date(observedAt),clock=easternMarketClock(now);
  if(!baseline||sessions[0]?.date!==adoption.sourceSessionDate||!opening||marketSessionDistance(baseline.date,opening.date)!==1||!clock?.isSessionDay||clock.key!==opening.date||clock.minutes<570)throw new Error('The next observed market opening is required');
  if(!Array.isArray(opening.prices)||!Array.isArray(opening.universeSymbols)||!Array.isArray(opening.corporateActions))throw new Error('Opening prices, membership and corporate-action observations required');
  const prices=new Map();
  for(const row of opening.prices){
    if(typeof row.symbol!=='string'||prices.has(row.symbol)||row.adjusted!==true||!positive(row.open))throw new Error('Invalid or duplicate adjusted opening quote');
    prices.set(row.symbol,{symbol:row.symbol,open:row.open,high:row.open,low:row.open,close:row.open,adjusted:true});
  }
  const required=new Set(['SPY','QQQ']),runs={},orders=[],blockedOrders=[],stopPrices={},priorBuySymbols={},priorSessionDate=sessions.at(-2)?.date||null;
  for(const id of ids){
    const seed=adoption.seeds[id],config={...C1_FROZEN_OPTIONS[id],startDate:seed.asOfSession,endDate:baseline.date,liquidateAtEnd:false};
    const prior=simulatePointInTimePortfolio({sessions},config,seed,replay?.[id]);
    const previousSessions=sessions.slice(0,-1),previousDate=previousSessions.at(-1)?.date;
    if(previousDate){
      const previousReplay=replay?.[id]?{...replay[id],sessions:replay[id].sessions.filter(record=>record.date<=previousDate)}:null;
      if(previousReplay)delete previousReplay.projectionDate;
      const previous=simulatePointInTimePortfolio({sessions:previousSessions},{...config,endDate:previousDate},seed,previousReplay);
      priorBuySymbols[id]=new Set(previous.pendingDecisions.filter(order=>order.side==='buy').map(order=>order.symbol));
    }else priorBuySymbols[id]=new Set();
    for(const p of prior.openPositions)required.add(p.symbol);
    for(const p of prior.pendingDecisions)required.add(p.symbol);
    runs[id]={seed,config};
  }
  for(const symbol of required)if(!prices.has(symbol))throw new Error('Missing opening quote: '+symbol);
  const session={date:opening.date,decisionAt:now.toISOString(),prices:[...prices.values()],signals:[],universeSymbols:opening.universeSymbols,corporateActions:clone(opening.corporateActions)};
  for(const id of ids){
    const {seed,config}=runs[id],scale=seed.actualDollarsPerModelDollar;
    const projectedReplay=replay?{...replay[id],projectionDate:opening.date}:null;
    const run=simulatePointInTimePortfolio({sessions:[...sessions,session]},{...config,endDate:opening.date},seed,projectedReplay);
    stopPrices[id]=Object.fromEntries(run.openPositions.map(p=>[p.symbol,p.stopPrice]));
    for(const [index,trade] of run.trades.filter(t=>t.date===opening.date).entries()){
      const requested=trade.shares*scale;
      const shares=trade.side==='sell'?whole(requested):Math.floor(requested+1e-9);
      if(!shares)continue;
      const order={id:`${id}:${opening.date}:${index}`,sleeve:id,date:opening.date,symbol:trade.symbol,side:trade.side,shares,
        sequence:index,estimatedPrice:trade.price,reason:trade.reason,phase:c1ModelEventPhase(trade),executable:false};
      if(order.side==='buy'&&['MSTR','SCHW'].includes(order.symbol)){blockedOrders.push({...order,blockReason:'Personal purchase restriction'});continue;}
      if(order.side==='buy'&&!priorBuySymbols[id].has(order.symbol)){blockedOrders.push({...order,blockReason:'Limited pilot requires the same candidate in two completed market sessions'});continue;}
      orders.push(order);
    }
  }
  orders.sort((a,b)=>a.phase-b.phase||ids.indexOf(a.sleeve)-ids.indexOf(b.sleeve)||a.sequence-b.sequence);
  const projected=clone(books);
  const accountEquity=ids.reduce((total,id)=>total+projected[id].cash+Object.entries(projected[id].positions).reduce((sum,[symbol,position])=>sum+position.shares*(prices.get(symbol)?.open||0),0),0);
  if(!positive(accountEquity))throw new Error('Positive opening account equity required');
  const limitedOrders=[];
  for(const original of orders){
    let order=original;
    if(order.side==='buy'){
      const held=new Map();
      for(const id of ids)for(const [symbol,position] of Object.entries(projected[id].positions))held.set(symbol,(held.get(symbol)||0)+position.shares);
      if(!held.has(order.symbol)&&held.size>=C1_ACCOUNT_PILOT.maxNames){blockedOrders.push({...order,blockReason:'Limited pilot already has three names'});continue;}
      const mark=Math.max(order.estimatedPrice,prices.get(order.symbol)?.open||0);
      const room=Math.max(0,accountEquity*C1_ACCOUNT_PILOT.maxPositionPct-(held.get(order.symbol)||0)*mark);
      const permitted=Math.min(order.shares,Math.floor(room/mark+1e-9));
      if(permitted<order.shares)blockedOrders.push({...order,shares:order.shares-permitted,blockReason:'Limited pilot caps total position value at 1% of opening Swing equity'});
      if(!permitted)continue;
      order={...order,shares:permitted,pilot:{contract:C1_ACCOUNT_PILOT.contract,confirmedSessionDates:[priorSessionDate,baseline.date],positionSharesBefore:held.get(order.symbol)||0,maxPositionShares:Math.floor(accountEquity*C1_ACCOUNT_PILOT.maxPositionPct/mark+1e-9)}};
    }
    const book=projected[order.sleeve],position=book.positions[order.symbol],delta=order.side==='buy'?order.shares:-order.shares;
    const shares=(position?.shares||0)+delta;
    const cash=book.cash-delta*order.estimatedPrice;
    if(shares<0||cash< -1e-6)throw new Error('Proposed whole-share order exceeds its own sleeve funds or holdings');
    book.cash=Math.max(0,cash);
    if(shares)book.positions[order.symbol]={...(position||{avgCost:order.estimatedPrice,openedAt:order.date}),shares};else delete book.positions[order.symbol];
    limitedOrders.push(order);
  }
  // Standing stops are conditional orders, not assumed sales in projections.
  // A partial entry can only fund a stop for shares actually acquired.
  for(const id of ids)for(const [symbol,position] of Object.entries(projected[id].positions)){
    const stop=stopPrices[id]?.[symbol];
    if(positive(stop))limitedOrders.push({id:`${id}:${opening.date}:stop:${symbol}`,sleeve:id,date:opening.date,symbol,side:'sell',shares:position.shares,
      estimatedPrice:stop,reason:'initial-stop',phase:4,condition:'stop-triggered',executable:false});
  }
  return {contract:'c1-actual-account-opening-plan-v1',status:'projection-only',sourceSessionDate:baseline.date,date:opening.date,observedAt:now.toISOString(),
    openingBooks:books,projectedBooks:projected,orders:limitedOrders,blockedOrders,pilot:{...C1_ACCOUNT_PILOT,enforced:true,openingEquity:accountEquity},executable:false,providerVerified:false,
    limitations:['Opening quotes and membership require server verification.','Actual fills replace estimated prices and quantities.','Account history must be continued from confirmed fills and complete dated sessions.']};
}

// Actual posted economics, including partial fills, are conserved per sleeve.
// Unfilled orders remain outstanding; projected balances are never adopted.
export function reconcileC1ActualAccountFills({plan,fills,observedAt}={}) {
  if(plan?.contract!=='c1-actual-account-opening-plan-v1'||!Array.isArray(fills)||fills.length>10000)throw new Error('Account plan and actual fill records required');
  const now=new Date(observedAt);
  if(!Number.isFinite(now.getTime()))throw new Error('Valid reconciliation time required');
  const books=clone(plan.openingBooks),orders=new Map(plan.orders.map(o=>[o.id,o])),seen=new Map(),quantities=new Map();
  if(orders.size!==plan.orders.length)throw new Error('Duplicate account order');
  let lastTime=-Infinity;
  for(const fill of fills){
    if(typeof fill.id!=='string'||!fill.id||fill.id.length>200)throw new Error('Unique actual fill ID required');
    if(seen.has(fill.id)){if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))throw new Error('Conflicting actual fill ID');continue;}
    const order=orders.get(fill.orderId),time=new Date(fill.executedAt),clock=easternMarketClock(time);
    if(!order||order.symbol!==fill.symbol||order.side!==fill.side)throw new Error('Actual fill does not match an account order');
    if(!Number.isFinite(time.getTime())||time>now||time.getTime()<lastTime||clock?.key!==plan.date||clock.minutes<570)throw new Error('Invalid actual execution time');
    if(!Number.isSafeInteger(fill.shares)||fill.shares<=0||!positive(fill.price)||typeof fill.fee!=='number'||!Number.isFinite(fill.fee)||fill.fee<0)throw new Error('Actual quantity, execution price and fee required');
    const filled=(quantities.get(order.id)||0)+fill.shares;
    if(filled>order.shares)throw new Error('Actual fills exceed the planned account order');
    const book=books[order.sleeve],position=book.positions[fill.symbol],delta=fill.side==='buy'?fill.shares:-fill.shares;
    const shares=(position?.shares||0)+delta,cash=book.cash-delta*fill.price-fill.fee;
    if(shares<0||cash< -1e-6)throw new Error('Actual fill oversells or exceeds its sleeve cash');
    book.cash=Math.max(0,cash);
    if(shares){
      const avgCost=fill.side==='buy'?((position?.shares||0)*(position?.avgCost||0)+fill.shares*fill.price+fill.fee)/shares:position.avgCost;
      book.positions[fill.symbol]={shares,avgCost,openedAt:position?.openedAt||plan.date};
    }else delete book.positions[fill.symbol];
    seen.set(fill.id,clone(fill));quantities.set(order.id,filled);lastTime=time.getTime();
  }
  const outstanding=plan.orders.map(o=>({...o,shares:Math.min(o.shares-(quantities.get(o.id)||0),o.condition==='stop-triggered'?(books[o.sleeve].positions[o.symbol]?.shares||0):Infinity)})).filter(o=>o.shares>0);
  return {contract:'c1-actual-account-fills-v1',status:outstanding.length?'partial':'recorded',date:plan.date,books,
    fills:[...seen.values()],outstanding,actualCash:ids.reduce((sum,id)=>sum+books[id].cash,0),
    executable:false,modelAdvanceAuthorized:false,brokerageVerified:false};
}


// Rebuild from the immutable adoption and actual executions. All state inside
// the strategy (including age, stops and cooldowns) is replayed chronologically;
// it is never reset by re-normalizing today's equity into a new account.
export function continueC1ActualAccount({adoption,sessions,records,observedAt}={}) {
  let books=accountBooks(adoption);
  if(!Array.isArray(sessions)||!sessions.length||sessions[0]?.date!==adoption.sourceSessionDate||!Array.isArray(records)||records.length!==sessions.length-1)throw new Error('Complete account sessions and execution records required');
  const latest=latestCompletedMarketSessionDay(observedAt);
  if(!latest||sessions.at(-1).date>latest)throw new Error('Account continuation requires completed sessions');
  const replay=Object.fromEntries(ids.map(id=>[id,{contract:'c1-actual-fill-replay-v1',sessions:[]}]));
  const plans=[];
  for(let i=1;i<sessions.length;i++){
    const session=sessions[i],record=records[i-1];
    if(record?.date!==session.date||record.complete!==true||marketSessionDistance(sessions[i-1].date,session.date)!==1)throw new Error('Confirm complete actual activity for each consecutive session');
    const plan=planFromHistory({adoption,baseline:sessions[i-1],opening:session,observedAt:record.openingObservedAt,books,sessions:sessions.slice(0,i),replay});
    const accepted=reconcileC1ActualAccountFills({plan,fills:record.fills,observedAt});
    for(const id of ids){
      const scale=adoption.seeds[id].actualDollarsPerModelDollar;
      replay[id].sessions.push({date:session.date,fills:accepted.fills.filter(f=>plan.orders.find(o=>o.id===f.orderId).sleeve===id).map(f=>({...f,reason:plan.orders.find(o=>o.id===f.orderId).reason,shares:f.shares/scale,fee:f.fee/scale}))});
    }
    books=accepted.books;plans.push(plan);
  }
  const sleeves={};
  for(const id of ids){
    const seed=adoption.seeds[id],scale=seed.actualDollarsPerModelDollar;
    const run=simulatePointInTimePortfolio({sessions},{...C1_FROZEN_OPTIONS[id],startDate:seed.asOfSession,endDate:sessions.at(-1).date,liquidateAtEnd:false},seed,replay[id]);
    if(Math.abs(run.actualCash*scale-books[id].cash)>1e-6)throw new Error('Continued strategy cash differs from actual fills');
    const held=new Map(run.openPositions.map(p=>[p.symbol,whole(p.shares*scale)]));
    if(held.size!==Object.keys(books[id].positions).length||Object.entries(books[id].positions).some(([symbol,p])=>held.get(symbol)!==p.shares))throw new Error('Continued strategy ownership differs from actual fills');
    sleeves[id]=run;
  }
  return {contract:'c1-actual-account-continuation-v1',sourceSessionDate:sessions.at(-1).date,books,sleeves,replay,plans,holdingRankings:sessions.at(-1).accountHoldingRanks||{},
    actualCash:ids.reduce((sum,id)=>sum+books[id].cash,0),actualFillsApplied:true,executable:false,providerVerified:false};
}

export function planC1ContinuedAccountOpening({adoption,sessions,records,opening,observedAt}={}) {
  const continued=continueC1ActualAccount({adoption,sessions,records,observedAt});
  return planFromHistory({adoption,baseline:sessions.at(-1),opening,observedAt,books:continued.books,sessions,replay:continued.replay});
}
