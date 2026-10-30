import {markC1NonCashReplay} from './c1NonCashAdoption';
import {simulatePointInTimePortfolio} from './c1RecentMomentumAccountSimulator';
import {simulatePointInTimePortfolio as simulateLegacyAccount} from './c1LegacyAccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {c1ModelEventPhase} from './c1PaperEvents';
import {marketSessionDistance,latestCompletedMarketSessionDay} from './marketSession';
import {c1RecentMomentumLiveApplies} from './c1RecentMomentumLivePolicy';
import {C1_PURCHASE_FUNDING_POLICY} from './c1BrokerageCash';
import {c1AdditionalSwingCapacity} from './c1AdditionalSwingCapacity';

const clone=value=>JSON.parse(JSON.stringify(value));
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const whole=value=>{const n=Math.round(value);if(Math.abs(value-n)>1e-7||!Number.isSafeInteger(n)||n<0)throw new Error('Whole-share sleeve ownership required');return n;};
const ids=['base','cooldown15','sector40'];

// Deterministic model projection from dated inputs. This has no live opening
// authority; execution verifies the observed opening before using its orders.
export function projectC1AccountSession(input) {
  return projectAccountSession(input,simulatePointInTimePortfolio);
}

// Historical identity reconstruction has no live opening/recommendation
// authority. Newly accepted ordinary records receive the current saved plan.
export function projectC1LegacyRecordedAccountSession({record,replayObservedAt,...input}) {
  const latest=latestCompletedMarketSessionDay(replayObservedAt);
  if(!record||record.complete!==true||record.executionEvidence||!Array.isArray(record.fills)||!record.fills.length||
    record.date!==input.opening?.date||!latest||record.date>latest)throw new Error('Legacy order identity requires completed saved activity without captured execution evidence');
  const plan=projectAccountSession({...input,observedAt:record.openingObservedAt||input.opening.decisionAt},simulateLegacyAccount);
  return {...plan,status:'historical-reconstruction-only',executable:false,providerVerified:false};
}

// Price-free requirements from the same prior runs used by opening planning.
// This does not create a projection or authorize an order.
export function c1AccountProjectionOpeningSymbols(input){
  return [...accountProjectionPriorRuns(input,simulatePointInTimePortfolio).required];
}
function accountProjectionPriorRuns({adoption,baseline,sessions,historySessions,replay,accountCompletionRules=[]},simulate){
  const required=new Set(['SPY','QQQ']),runs={};
  for(const id of ids){
    const seed=adoption.seeds[id],config={...C1_FROZEN_OPTIONS[id],startDate:seed.asOfSession,endDate:baseline.date,liquidateAtEnd:false,...(accountCompletionRules.length?{accountCompletionRules}:{})};
    const prior=simulate({sessions,recentMomentumHistorySessions:historySessions||sessions},config,seed,replay?.[id]);
    for(const p of prior.openPositions)required.add(p.symbol);
    for(const p of prior.pendingDecisions)required.add(p.symbol);
    runs[id]={seed,config,prior};
  }
  return {required,runs};
}

function projectAccountSession({adoption,baseline,opening,observedAt,books,sessions,historySessions,replay,projectionFills={},accountCompletionRules=[],purchaseFundingIndependent=false,additionalSwingCapacity=false},simulate) {
  const now=new Date(observedAt);
  if(!baseline||sessions[0]?.date!==adoption.sourceSessionDate||!opening||marketSessionDistance(baseline.date,opening.date)!==1||!Number.isFinite(now.getTime()))throw new Error('Consecutive dated account inputs required');
  if(!Array.isArray(opening.prices)||!Array.isArray(opening.universeSymbols)||!Array.isArray(opening.corporateActions))throw new Error('Opening prices, membership and corporate-action observations required');
  if(opening.entryRecheck){
    const review=opening.entryRecheck;
    if(review.contract!=='c1-intraday-entry-recheck-v1'||review.date!==opening.date||review.sourceSessionDate!==baseline.date||!Array.isArray(review.blocks))throw new Error('Invalid saved entry recheck');
    const references=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(s=>[s.symbol,s.price??s.currentPrice??s.lastPrice??s.close]));
    for(const block of review.blocks){
      const config=C1_FROZEN_OPTIONS[block.sleeve],acceptedReference=references.get(block.symbol);
      const recordedGapPct=positive(block.referencePrice)&&positive(block.observedPrice)?(block.observedPrice/block.referencePrice-1)*100:null;
      const acceptedGapPct=positive(acceptedReference)&&positive(block.observedPrice)?(block.observedPrice/acceptedReference-1)*100:null;
      const equivalentFailedGate=Boolean(config)&&recordedGapPct>config.maxEntryGapPct&&acceptedGapPct>config.maxEntryGapPct;
      if(!config||block.reason!=='entry-gap-limit'||!positive(block.observedPrice)||!equivalentFailedGate){
        console.warn('C1_ENTRY_RECHECK_REJECT',JSON.stringify({symbol:block.symbol,sleeve:block.sleeve,reason:block.reason,hasConfig:Boolean(config),observedPrice:block.observedPrice,recordedReference:block.referencePrice,acceptedReference,recordedGapPct,acceptedGapPct,maxEntryGapPct:config?.maxEntryGapPct}));
        throw new Error('Entry recheck does not establish a failed price gate');
      }
    }
  }
  const prices=new Map();
  for(const row of opening.prices){
    if(typeof row.symbol!=='string'||prices.has(row.symbol)||row.adjusted!==true||!positive(row.open))throw new Error('Invalid or duplicate adjusted opening quote');
    prices.set(row.symbol,{symbol:row.symbol,open:row.open,high:row.open,low:row.open,close:row.open,adjusted:true});
  }
  const heldSymbols=[...new Set(Object.values(books||{}).flatMap(book=>Object.keys(book?.positions||{})))];
  const conservedBuySymbols=new Set(ids.flatMap(id=>(projectionFills[id]||[]).filter(fill=>fill?.side==='buy').map(fill=>fill.symbol)));
  for(const symbol of conservedBuySymbols)if(!heldSymbols.includes(symbol))heldSymbols.push(symbol);
  const capacity=additionalSwingCapacity?c1AdditionalSwingCapacity({baseline,historySessions:historySessions||sessions,opening,observedAt,heldSymbols}):null;
  const accountHeldSymbols=new Set(heldSymbols),permittedNewSymbols=new Set(capacity?.symbols||[]);
  const {required,runs}=accountProjectionPriorRuns({adoption,baseline,sessions,historySessions,replay,accountCompletionRules},simulate);
  const orders=[],blockedOrders=[],stopPrices={},entryReviews=[],riskBySleeve={};
  for(const symbol of required)if(!prices.has(symbol))throw new Error('Missing opening quote: '+symbol);
  const session={date:opening.date,decisionAt:now.toISOString(),prices:[...prices.values()],signals:[],universeSymbols:opening.universeSymbols,corporateActions:clone(opening.corporateActions),...(opening.entryRecheck?{accountEntryBlocks:clone(opening.entryRecheck.blocks)}:{})};
  for(const id of ids){
    const {seed,config,prior}=runs[id],scale=seed.actualDollarsPerModelDollar;
    const capacityBlocks=capacity?[...new Set(prior.pendingDecisions.filter(order=>order.side==='buy'&&!accountHeldSymbols.has(order.symbol)&&!conservedBuySymbols.has(order.symbol)&&!permittedNewSymbols.has(order.symbol)).map(order=>order.symbol))].map(symbol=>({sleeve:id,symbol,reason:'position-limit'})):[];
    const projectedSession=capacityBlocks.length?{...session,accountEntryBlocks:[...(session.accountEntryBlocks||[]),...capacityBlocks]}:session;
    const projectedReplay=replay||purchaseFundingIndependent?{...(replay?.[id]||{contract:'c1-actual-fill-replay-v1',sessions:[]}),projectionDate:opening.date,
      ...(purchaseFundingIndependent?{purchaseFundingIndependent:true}:{}),...(capacity?{additionalCapacitySymbols:capacity.symbols}:{}),...(projectionFills[id]?.length?{projectionFills:projectionFills[id]}:{})}:null;
    markC1NonCashReplay(projectedReplay,adoption,id,historySessions||sessions,baseline.date);
    const run=simulate({sessions:[...sessions,projectedSession],recentMomentumHistorySessions:historySessions||sessions},{...config,endDate:opening.date,
      ...(simulate===simulatePointInTimePortfolio?{recentMomentumSourceSessionDate:baseline.date,recentMomentumProjectionDate:opening.date}:{})},seed,projectedReplay);
    riskBySleeve[id]={highWater:run.accountRisk.highWater*scale,paused:run.accountRisk.activeSessionNumber<=run.accountRisk.pausedThrough};
    stopPrices[id]=Object.fromEntries(run.openPositions.map(p=>[p.symbol,p.stopPrice]));
    for(const skipped of run.skippedOrders||[])if(skipped.date===opening.date&&skipped.side==='buy')entryReviews.push({sleeve:id,symbol:skipped.symbol,reason:skipped.reason});
    const queued=new Set(prior.pendingDecisions.filter(o=>o.side==='buy').map(o=>o.symbol));
    const rule=accountCompletionRules.find(r=>r.date===opening.date);
    for(const p of prior.openPositions)if(!queued.has(p.symbol)){
      const reason=p.completionClosed?'completion-closed':Number.isFinite(p.entryTargetShares)&&p.entryTargetShares-p.shares<=1e-7?'target-complete':!Number.isFinite(p.entryTargetShares)&&!rule?.partialSymbols.includes(p.symbol)?'purchase-target-missing':'not-in-entry-queue';
      entryReviews.push({sleeve:id,symbol:p.symbol,reason});
    }
    const heldSymbols=new Set(Object.keys(books[id].positions));
    const recorded=new Map();
    const individualRecorded=new Map((projectionFills[id]||[]).filter(fill=>typeof fill.id==='string').map(fill=>[fill.id,fill]));
    for(const fill of projectionFills[id]||[]){const key=fill.symbol+':'+fill.side+':'+fill.reason;recorded.set(key,(recorded.get(key)||0)+fill.shares);}
    for(const [index,trade] of run.trades.filter(t=>t.date===opening.date).entries()){
      const key=trade.symbol+':'+trade.side+':'+trade.reason,executed=recorded.get(key);
      if(trade.actualProjectionFillId!=null){
        const fact=individualRecorded.get(trade.actualProjectionFillId);
        if(!fact||fact.symbol!==trade.symbol||fact.side!==trade.side||fact.reason!==trade.reason||
          Math.abs(fact.shares-trade.shares)>1e-7||fact.price!==trade.price||fact.fee!==trade.actualProjectionFee||
          executed==null||trade.shares>executed+1e-7)throw new Error('Projected account execution differs from its recorded identity or economics');
        individualRecorded.delete(trade.actualProjectionFillId);
        if(Math.abs(executed-trade.shares)<=1e-7)recorded.delete(key);else recorded.set(key,executed-trade.shares);
        continue;
      }
      if(executed!=null){if(Math.abs(executed-trade.shares)>1e-7)throw new Error('Projected account execution differs from its recorded quantity');recorded.delete(key);continue;}
      const requested=trade.shares*scale;
      const shares=trade.side==='sell'?whole(requested):Math.floor(requested+1e-9);
      if(!shares){if(trade.side==='buy')entryReviews.push({sleeve:id,symbol:trade.symbol,reason:'whole-share-limit'});continue;}
      // A stop already triggered at an accepted prior close is an opening
      // carry exit, not a newly triggered intraday standing stop. The engine
      // sells it before funding replacements; retain that causal cash order.
      const carriedRiskExit=trade.side==='sell'&&['initial-stop','invalidation-stop','ratcheted-stop','profit-trailing-stop','portfolio-drawdown-stop'].includes(trade.reason)&&
        (trade.openingStopPriority===true||prior.pendingDecisions.some(order=>order.side==='sell'&&order.symbol===trade.symbol&&order.reason===trade.reason));
      const additionalCapacity=trade.side==='buy'&&!heldSymbols.has(trade.symbol)&&heldSymbols.size>=config.maxPositions;
      if(additionalCapacity&&!capacity?.symbols.includes(trade.symbol))throw new Error('Additional position lacks existing Buy qualification');
      if(trade.side==='buy')heldSymbols.add(trade.symbol);else heldSymbols.delete(trade.symbol);
      const order={...(additionalCapacity?{additionalCapacity:true,minimumTradeDollars:config.minimumTrade*scale,additionalCapacityEvidence:{contract:capacity.contract,sourceSessionDate:baseline.date,symbol:trade.symbol,rating:capacity.reviews.find(r=>r.symbol===trade.symbol).rating,observedAt:now.toISOString()}}:{}),id:`${id}:${opening.date}:${index}`,sleeve:id,date:opening.date,symbol:trade.symbol,side:trade.side,shares,
        sequence:index,estimatedPrice:trade.price,reason:trade.reason,phase:carriedRiskExit?1:c1ModelEventPhase(trade),executable:false,
        ...(Number.isFinite(trade.entryTargetShares)?{targetShares:Math.floor(trade.entryTargetShares*scale+1e-9)}:{})};
      if(order.side==='buy'&&['MSTR','SCHW'].includes(order.symbol)){blockedOrders.push({...order,blockReason:'Personal purchase restriction'});continue;}
      orders.push(order);
    }
    if(recorded.size)throw new Error('A recorded projected execution was not conserved');
  }
  orders.sort((a,b)=>a.phase-b.phase||ids.indexOf(a.sleeve)-ids.indexOf(b.sleeve)||a.sequence-b.sequence);
  const projected=clone(books);
  for(const order of orders){
    const book=projected[order.sleeve],position=book.positions[order.symbol],delta=order.side==='buy'?order.shares:-order.shares;
    const shares=(position?.shares||0)+delta;
    const cash=book.cash-delta*order.estimatedPrice;
    if(shares<0||(!purchaseFundingIndependent&&cash< -1e-6))throw new Error('Proposed whole-share order exceeds its own sleeve funds or holdings');
    book.cash=purchaseFundingIndependent?cash:Math.max(0,cash);
    if(shares)book.positions[order.symbol]={...(position||{avgCost:order.estimatedPrice,openedAt:order.date}),shares};else delete book.positions[order.symbol];
  }
  // Standing stops are conditional orders, not assumed sales in projections.
  // A partial entry can only fund a stop for shares actually acquired.
  for(const id of ids)for(const [symbol,position] of Object.entries(projected[id].positions)){
    const stop=stopPrices[id]?.[symbol];
    if(positive(stop))orders.push({id:`${id}:${opening.date}:stop:${symbol}`,sleeve:id,date:opening.date,symbol,side:'sell',shares:position.shares,
      estimatedPrice:stop,reason:'initial-stop',phase:4,condition:'stop-triggered',executable:false});
  }
  return {contract:'c1-actual-account-opening-plan-v1',status:'projection-only',sourceSessionDate:baseline.date,date:opening.date,observedAt:now.toISOString(),
    ...(purchaseFundingIndependent?{purchaseFundingPolicy:C1_PURCHASE_FUNDING_POLICY}:{}),...(capacity?{additionalSwingCapacity:capacity}:{}),
    ...(c1RecentMomentumLiveApplies(baseline.date)?{priceAssumptions:{zeroBrokerageCommissionPerOrder:0,estimatedSpreadSlippageBps:C1_FROZEN_OPTIONS.base.slippageBps,actualFillsOverride:true}}:{}),
    ...(accountCompletionRules.some(r=>r.date===opening.date)?{completionPolicy:{version:1,partialSymbols:accountCompletionRules.find(r=>r.date===opening.date).partialSymbols}}:{}),
    ...(opening.entryRecheck?{entryRecheck:clone(opening.entryRecheck)}:{}),
    openingBooks:books,projectedBooks:projected,orders,blockedOrders,entryReviews,riskBySleeve,executable:false,providerVerified:false,
    limitations:['Opening quotes and membership require server verification.','Actual fills replace estimated prices and quantities.','Account history must be continued from confirmed fills and complete dated sessions.']};
}
