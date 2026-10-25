import {c1WatchPresentation,c1OpportunityPresentation} from './c1EntryReview';
import {c1OrderDisplayGroups} from './c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from './c1ManualRecommendations';
import {c1PositionPresentation,c1RecordedSellInstruction} from './c1PositionPresentation';
import {c1PlainDecisionReason} from './c1DecisionCopy';

// Presentation only. Inputs keep their independently observed evidence; checked
// orders remain server authority. A supplied clock makes replay deterministic.
export function projectC1Opportunities({decision,executionDecision=decision,openingPlan,openingError,manualRecommendations,purchaseDiagnostics,screenRows=[],positionRows=[],portfolio=[],view="opportunities",evidence},{readTime=()=>new Date()}={}){
 const ready=!evidence.pending&&Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision,readTime());
 const portfolioOnly=view==='portfolio';
 const ratedRows=evidence.ratings;
 const currentBuySymbols=new Set(evidence.buySymbols);
 const orders=c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view,now:readTime()});
 const rawBuys=orders.filter(order=>order.side==='buy'&&!order.condition&&currentBuySymbols.has(order.symbol));
 const buys=c1OrderDisplayGroups(portfolioOnly?rawBuys.filter(order=>currentBuySymbols.has(order.symbol)):rawBuys);
 const positionOrders=c1OrderDisplayGroups(c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view:'opportunities',now:readTime()}).filter(order=>order.side==='sell'&&!order.condition));
 const exits=positionOrders;
 const waitingReason=decision.accountMismatch?'Resolve the differences in Account settings.':evidence.pending?evidence.reason:openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 const ratedDecision={...decision,opportunities:ratedRows};
 const presentation=c1OpportunityPresentation({decision:ratedDecision,buys,plan:openingPlan,ready,waitingReason});
 const heldSymbols=new Set([
  ...(decision.positions||[]).map(position=>String(position?.symbol||'').toUpperCase()),
  ...(portfolio||[]).filter(position=>position?.role==='Swing'&&Number(position?.shares)>0).map(position=>String(position?.symbol||'').toUpperCase())
 ]);
 const holdingPresentation=symbol=>heldSymbols.has(String(symbol||'').toUpperCase())?c1PositionPresentation({decision:decision.accountMismatch?null:decision,
  position:decision.positions?.find(position=>position.symbol===symbol),symbol,
  stock:positionRows.find(row=>(row.symbol||row.ticker)===symbol)||screenRows.find(row=>(row.symbol||row.ticker)===symbol),
  executionDecision,openingPlan,manualRecommendations,checkedAddOrders:rawBuys,now:readTime()}):null;
 // Display independently verified ratings even when the account cannot buy.
 // The separately checked order list remains the sole source of quantities.
 const ratedTiles=evidence.verified?presentation.tiles:[];
 const actionableTiles=ratedTiles.filter(tile=>{
  const held=holdingPresentation(tile.symbol);
  return ready&&Boolean(tile.order)&&(!held||held.canAdd);
 });
 const actionableBuys=buys.filter(order=>actionableTiles.some(tile=>tile.symbol===order.symbol));
 const blockedTiles=presentation.tiles.filter(tile=>!ratedTiles.includes(tile)).map(tile=>({
  ...tile,
  screenReview:{why:tile.detail||'No purchase currently authorized.',next:tile.next}
 }));
 const watch=[...blockedTiles,...presentation.watch];
 const currentWatch=watch;
 const currentWatchView=c1WatchPresentation({rows:currentWatch,plan:openingPlan,ready,waitingReason});
 const actionTone=(held,canPurchase)=>held?.action==='Sell'?'red':held?.urgent?'orange':held?'yellow':canPurchase?'green':'gray';
 const plainReason=(symbol,action,reason,presentation)=>c1PlainDecisionReason({action,reason,presentation,symbol,purchaseDiagnostics:ready?purchaseDiagnostics:null,openingPlan,decision,position:decision.positions?.find(position=>position.symbol===symbol),opportunity:ratedRows.find(row=>row.symbol===symbol),sourceCandidate:decision.stockScreen?.candidates?.find(row=>row.symbol===symbol),evidence:decision.positions?.find(row=>row.symbol===symbol)?.momentumEvidence});
 let nextWatchPriority=ratedTiles.length;
 const watchView={
  shared:null,
  rows:[
   ...currentWatchView.rows.map((row,index)=>{
    const held=heldSymbols.has(String(row.symbol||'').toUpperCase());
    const holding=held?holdingPresentation(row.symbol):null;
    return {...row,holding,priority:held?'Held':++nextWatchPriority,review:holding?{why:holding.reason,next:row.review.next}:evidence.pending?{why:evidence.reason,next:'Fresh capital is paused.'}:row.review};
   }),
  ]
 };
 // Group existing presentations for display only; never calculate an action or quantity.
 const heldActions=[...heldSymbols].map(symbol=>{
  const position=decision.positions?.find(row=>row.symbol===symbol);
  return {symbol,holding:holdingPresentation(symbol),sellInstruction:c1RecordedSellInstruction(position,holdingPresentation(symbol)),stops:[...new Set((position?.stops||[]).map(stop=>stop.price).filter(price=>Number.isFinite(price)&&price>0))]};
 }).filter(row=>row.holding);
 const sellActions=heldActions.filter(row=>row.holding.action==='Sell');
 const verifyActions=heldActions.filter(row=>row.holding.urgent);
 if(portfolioOnly&&!sellActions.length&&!verifyActions.length&&!actionableBuys.length)return null;
 return {portfolioOnly,evidence,openingError,manualRecommendations,ready,decision,presentation,sellActions,plainReason,positionOrders,actionableBuys,holdingPresentation,verifyActions,exits,orders,ratedTiles,waitingReason,actionTone,buys,watch,watchView,ratedRows};
}
