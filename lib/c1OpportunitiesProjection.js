import {c1MomentumWatchReview} from './c1MarketMomentumIssues';
import {c1WatchPresentation,c1OpportunityPresentation} from './c1EntryReview';
import {c1OrderDisplayGroups} from './c1OrderDisplay';
import {c1ManualReviewCurrent,c1ManualOrdersForView} from './c1ManualRecommendations';
import {c1PositionPresentation,c1RecordedSellInstruction} from './c1PositionPresentation';
import {c1PlainDecisionReason} from './c1DecisionCopy';
import {c1AccountPolicyActive} from './c1AccountActions';
import {selectC1CurrentWatch} from './c1CurrentWatchSelection';

// Presentation only. Inputs keep their independently observed evidence; checked
// orders remain server authority. A supplied clock makes replay deterministic.
export function projectC1Opportunities({decision,executionDecision=decision,openingPlan,openingError,manualRecommendations,purchaseDiagnostics,screenRows=[],positionRows=[],portfolio=[],view="opportunities",evidence},{readTime=()=>new Date()}={}){
 const unified=c1AccountPolicyActive(executionDecision?.accountPolicy);
 const aligned=!unified||decision?.current===true&&!decision.accountMismatch&&executionDecision?.revision===decision.revision&&executionDecision?.sourceSessionDate===decision.sourceSessionDate;
 if(unified&&aligned)decision=executionDecision;
 const coherent=!unified||aligned&&evidence.decisionId===(decision.actionVersion||decision.decisionId);
 const selectionEvidence=unified?(decision.selectionEvidence||openingPlan?.additionalSwingCapacity?.scan):null;
 const ready=coherent&&!evidence.pending&&Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision,readTime());
 const portfolioOnly=view==='portfolio';
 const forbidden=new Set([...(decision.activeExitSymbols||[]),...(decision.accountPolicy?.blockedSymbols||[])]);
 const ratedRows=unified&&!coherent?[]:unified?evidence.ratings.map(row=>forbidden.has(row.symbol)?{...row,rating:'Watch',eligible:false,
  accountAction:decision.accountActions?.find(action=>action.symbol===row.symbol),decisionId:decision.actionVersion||decision.decisionId,
  screenReview:{why:decision.activeExitSymbols?.includes(row.symbol)?'An active account Sell blocks purchases through every allocation.':'The stock is in an account-wide loss cooldown.',next:'Review the authoritative account action.'}}:row):evidence.ratings;
 const currentBuySymbols=new Set(coherent?evidence.buySymbols.filter(symbol=>!unified||!forbidden.has(symbol)):[]);
 const orders=c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view,now:readTime()});
 const rawBuys=orders.filter(order=>order.side==='buy'&&!order.condition&&currentBuySymbols.has(order.symbol));
 const buys=c1OrderDisplayGroups(portfolioOnly?rawBuys.filter(order=>currentBuySymbols.has(order.symbol)):rawBuys);
 const rawPositionOrders=c1ManualOrdersForView({review:manualRecommendations,decision:executionDecision,openingPlan,view:'opportunities',now:readTime()}).filter(order=>order.side==='sell'&&!order.condition);
 const positionOrders=unified?(decision.accountActions||[]).filter(action=>action.side==='sell'&&action.shares>0&&rawPositionOrders.some(order=>order.symbol===action.symbol))
  .map(action=>({...action,id:'account-sell:'+action.symbol,estimatedPrice:action.estimatedPrice??rawPositionOrders.find(order=>order.symbol===action.symbol)?.estimatedPrice})):c1OrderDisplayGroups(rawPositionOrders);
 const exits=positionOrders;
 const waitingReason=unified&&!coherent?'The screen and account action versions differ. Refresh the complete current decision.':decision.accountMismatch?'Resolve the differences in Account settings.':evidence.pending?evidence.reason:openingError?'Opening checks unavailable: '+openingError:manualRecommendations?.status==='ready'?'Refresh to recheck the account and opening prices.':manualRecommendations?.reason||'Refresh for the current account review.';
 const ratedDecision={...decision,opportunities:ratedRows};
 const presentation=c1OpportunityPresentation({decision:ratedDecision,buys,plan:openingPlan,ready,waitingReason});
 const heldSymbols=new Set([
  ...(decision.positions||[]).map(position=>String(position?.symbol||'').toUpperCase()),
  ...(portfolio||[]).filter(position=>position?.role==='Swing'&&Number(position?.shares)>0).map(position=>String(position?.symbol||'').toUpperCase())
 ]);
 const holdingPresentation=symbol=>heldSymbols.has(String(symbol||'').toUpperCase())?c1PositionPresentation({requireOpeningReview:true,decision:decision.accountMismatch?null:decision,
  position:decision.positions?.find(position=>position.symbol===symbol),symbol,
  stock:positionRows.find(row=>(row.symbol||row.ticker)===symbol)||screenRows.find(row=>(row.symbol||row.ticker)===symbol),
  executionDecision,openingPlan,manualRecommendations,checkedAddOrders:rawBuys,now:readTime()}):null;
 // Display independently verified ratings even when the account cannot buy.
 // The separately checked order list remains the sole source of quantities.
 const ratedTiles=coherent&&evidence.verified?presentation.tiles:[];
 const actionableTiles=ratedTiles.filter(tile=>{
  const held=holdingPresentation(tile.symbol);
  return ready&&Boolean(tile.order)&&(!held||held.canAdd);
 });
 const actionableBuys=buys.filter(order=>actionableTiles.some(tile=>tile.symbol===order.symbol));
 const blockedTiles=presentation.tiles.filter(tile=>!ratedTiles.includes(tile)).map(tile=>({
  ...tile,
  screenReview:{why:tile.detail||'No purchase currently authorized.',next:tile.next}
 }));
 const watchSelection=unified?selectC1CurrentWatch({rows:[...blockedTiles,...presentation.watch],decision,screenRows,heldSymbols,selectionEvidence,
  current:coherent&&evidence.verified&&!evidence.pending,now:readTime()}):null;
 const watch=unified?watchSelection.rows:[...blockedTiles,...presentation.watch];
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
    return {...row,holding,priority:unified?decision.stockScreen.candidates.find(candidate=>candidate.symbol===row.symbol)?.researchRank:held?'Held':++nextWatchPriority,review:holding?{why:holding.reason,next:row.review.next}:evidence.pending?{why:evidence.reason,next:'Fresh capital is paused.'}:
     c1MomentumWatchReview(row.review,decision.stockScreen?.candidates?.find(c=>c.symbol===row.symbol),decision.sourceSessionDate)};
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
 return {portfolioOnly,evidence,openingError,manualRecommendations,ready,decision,presentation,sellActions,plainReason,positionOrders,actionableBuys,holdingPresentation,verifyActions,exits,orders,ratedTiles,waitingReason,actionTone,buys,watch,watchView,ratedRows,
  ...(unified?{decisionId:decision.actionVersion||decision.decisionId,accountActions:decision.accountActions,watchSelection,...(selectionEvidence?{selectionEvidence}:{})}:{} )};
}
