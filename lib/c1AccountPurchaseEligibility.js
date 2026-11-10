import {capC1AccountExposure} from './c1AccountActions';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';

const symbolOf=value=>String(value?.symbol||value||'').replace('-','.').toUpperCase().trim();
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const runCash=prior=>Number.isFinite(prior?.actualCash)?prior.actualCash:prior?.endingCash;

// Cheap viability calculation from the same actual prior runs used by the
// projector. This checks the frozen target before spending selection slots;
// it does not run a simulator per name or change any generated quantity.
function allocationCapacity(symbol,{seed,config,prior},quotes,purchaseFundingIndependent,brokerageCash){
 const positions=prior.openPositions,order=prior.pendingDecisions.find(row=>row.side==='buy'&&row.symbol===symbol);
 if(!order)return {shares:0,reason:'not-in-entry-queue'};
 const existing=positions.find(row=>row.symbol===symbol),completion=Boolean(existing&&order.completeExisting);
 if(existing&&!completion)return {shares:0,reason:'not-in-entry-queue'};
 const raw=quotes.get(symbol)?.open??quotes.get(symbol),fill=raw*(1+config.slippageBps/10000);
 if(!positive(raw)||!positive(fill))return {shares:0,reason:'account-exposure-unverified'};
 if(number(order.stopPrice)>0&&raw<=order.stopPrice)return {shares:0,reason:'entry-invalidated-at-open'};
 const reference=order.signal?.price??order.signal?.currentPrice??order.signal?.lastPrice??order.signal?.close;
 if(positive(reference)&&Number.isFinite(config.maxEntryGapPct)&&(fill/reference-1)*100>config.maxEntryGapPct)return {shares:0,reason:'entry-gap-limit'};
 if(!existing&&positions.length>=4)return {shares:0,reason:'account-position-limit'};
 const sector=existing?.sector||order.sector||'Other',issuer=order.issuer;
 if(Number.isFinite(config.maxSectorPositions)&&positions.filter(position=>position.symbol!==symbol&&position.sector===sector).length>=config.maxSectorPositions)return {shares:0,reason:'account-sector-position-limit'};
 if(Number.isFinite(config.maxIssuerPositions)&&positions.filter(position=>position.symbol!==symbol&&position.issuer===issuer).length>=config.maxIssuerPositions)return {shares:0,reason:'account-issuer-limit'};
 const mark=position=>quotes.get(position.symbol)?.open??quotes.get(position.symbol);
 if(positions.some(position=>!positive(mark(position))))return {shares:0,reason:'account-exposure-unverified'};
 const cash=runCash(prior),equity=cash+positions.reduce((sum,position)=>sum+position.shares*mark(position),0);
 const existingValue=completion?existing.shares*raw:0,strong=order.action==='Strong Buy';
 let target=Number.isFinite(order.targetPct)?order.targetPct:strong?config.strongBuyTargetPct:config.buyTargetPct;
 const volatility=order.signal?.researchFactors?.volatility60Pct;
 if(positive(config.volatilityTargetPct)&&positive(volatility))target*=Math.max(.55,Math.min(1.25,config.volatilityTargetPct/volatility));
 const maxPosition=strong?config.strongBuyMaxPositionPct:config.buyMaxPositionPct,maxFactor=strong?config.strongBuyMaxFactorPct:config.buyMaxFactorPct;
 const factorValue=positions.filter(position=>position.factor===order.factor).reduce((sum,position)=>sum+position.shares*mark(position),0);
 let budget=Math.min(purchaseFundingIndependent?Infinity:cash-config.commissionPerOrder,
   Math.max(0,equity*target-existingValue),Math.max(0,equity*maxPosition-existingValue),Math.max(0,equity*maxFactor-factorValue));
 if(positive(config.maxSectorPct))budget=Math.min(budget,Math.max(0,equity*config.maxSectorPct-positions.filter(position=>position.sector===sector).reduce((sum,position)=>sum+position.shares*mark(position),0)));
 const remaining=completion&&Number.isFinite(existing.entryTargetShares)?Math.max(0,existing.entryTargetShares-existing.shares):Infinity;
 const modelShares=Math.min(Math.floor(Math.max(0,budget)/fill),remaining),cost=modelShares*fill+config.commissionPerOrder;
 if(modelShares<1||cost<config.minimumTrade)return {shares:0,reason:'account-allocation-trade-size-limit'};
 let shares=Math.floor(modelShares*seed.actualDollarsPerModelDollar+1e-9);
 if(shares<1)return {shares:0,reason:'account-allocation-whole-share-limit'};
 shares=Math.min(shares,Math.floor((brokerageCash+1e-8)/fill));
 if(!existing&&positions.length>=config.maxPositions&&shares*fill+1e-7<config.minimumTrade*seed.actualDollarsPerModelDollar)return {shares:0,reason:'account-allocation-trade-size-limit'};
 return {shares,reason:shares>0?null:'brokerage-cash-insufficient'};
}

// Reject known account-level impossibilities before selection spends a sector,
// issuer or opportunity slot. The canonical exposure cap decides each probe;
// this helper neither sizes orders nor treats proposed sales as recorded cash.
// A partially fundable/concentration-limited stock remains eligible: the later
// execution gate retains its exact permitted quantity and funding priority.
export function buildC1AccountPurchaseBlocks({openingBooks={},brokerageCash,exposure,quotes=[],priorRuns=null,purchaseFundingIndependent=false}={}){
 const unavailable=()=>({complete:false,purchaseBlocks:{},reason:'Account-wide purchase exposure is unverified.'});
 if(typeof brokerageCash!=='number'||!Number.isFinite(brokerageCash)||brokerageCash<0||
   !exposure||!Array.isArray(exposure.holdings)||!exposure.candidates||!positive(exposure.maxPositionPct)||
   !positive(exposure.maxSectorValue)||exposure.maxDistinctPositions!==4||!Number.isSafeInteger(exposure.maxSectorPositions)||!Number.isSafeInteger(exposure.maxIssuerPositions))return unavailable();
 const held=new Map();
 for(const book of Object.values(openingBooks))for(const [symbol,position]of Object.entries(book.positions||{}))held.set(symbol,(held.get(symbol)||0)+position.shares);
 for(const [symbol,shares]of held){
  const rows=exposure.holdings.filter(row=>symbolOf(row)===symbol);
  if(!positive(shares)||rows.length!==1||!positive(rows[0].price)||!rows[0].sector||!rows[0].issuer)return unavailable();
 }
 const bySymbol=quotes instanceof Map?quotes:new Map(quotes.map(row=>[symbolOf(row),row]));
 const allocationRuns=priorRuns?Object.values(priorRuns):null;
 if(allocationRuns&&(!allocationRuns.length||allocationRuns.some(run=>!positive(run.seed?.actualDollarsPerModelDollar)||!run.config||!Number.isFinite(runCash(run.prior))||!Array.isArray(run.prior?.pendingDecisions)||!Array.isArray(run.prior?.openPositions))))return unavailable();
 const purchaseBlocks={};
 for(const symbol of Object.keys(exposure.candidates)){
  const quote=bySymbol.get(symbol),raw=typeof quote==='number'?quote:quote?.open;
  const estimatedPrice=positive(raw)?raw*(1+C1_FROZEN_OPTIONS.base.slippageBps/10000):null;
  if(!positive(estimatedPrice)){purchaseBlocks[symbol]='account-exposure-unverified';continue;}
  const probe={id:'selection-probe:'+symbol,symbol,side:'buy',shares:1,estimatedPrice};
  const permitted=capC1AccountExposure({orders:[probe],openingBooks,brokerageCash,exposure});
  const rejection=permitted.blockedOrders.find(order=>order.symbol===symbol);
  if(rejection)purchaseBlocks[symbol]=rejection.blockReason;
  else if(brokerageCash+1e-8<estimatedPrice)purchaseBlocks[symbol]='brokerage-cash-insufficient';
  else if(allocationRuns){
   const capacities=allocationRuns.map(run=>allocationCapacity(symbol,run,bySymbol,purchaseFundingIndependent,brokerageCash));
   if(!capacities.some(capacity=>capacity.shares>0)){
    const reasons=capacities.map(capacity=>capacity.reason);
    purchaseBlocks[symbol]=reasons.includes('account-allocation-whole-share-limit')?'account-allocation-whole-share-limit':
      reasons.includes('account-allocation-trade-size-limit')?'account-allocation-trade-size-limit':reasons[0]||'not-in-entry-queue';
   }
  }
 }
 return {complete:true,purchaseBlocks};
}
