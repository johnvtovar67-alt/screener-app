// Expert decision layer shared by Opportunities and Portfolio Intelligence.
// Internal scores do the analysis; the UI surfaces only the resulting decision.

import { pacedRelativeVolume, marketSessionProgress } from './marketSession';

const n=(v,fallback=0)=>{const x=Number(String(v??'').replace(/[%,$,]/g,''));return Number.isFinite(x)?x:fallback};
const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const price=s=>n(s?.price??s?.currentPrice??s?.lastPrice??s?.close);
const ma50=s=>n(s?.fiftyDayAverage??s?.priceAvg50??s?.sma50??s?.ma50);
const ma200=s=>n(s?.twoHundredDayAverage??s?.priceAvg200??s?.sma200??s?.ma200);
const volume=s=>n(s?.volume);
const avgVolume=s=>n(s?.avgVolume??s?.averageVolume??s?.avgVolume30Day);
const dayPct=s=>n(s?.dayChangePct??s?.changesPercentage??s?.changePercentage,NaN);

function quoteFreshness(stock={},now=new Date()){
  const progress=marketSessionProgress(now),marketOpen=progress!==null&&progress<1;
  if(!marketOpen)return{pass:true,marketOpen:false,ageMinutes:null,status:'Outside regular session'};
  const raw=Number(stock?.timestamp);
  if(!Number.isFinite(raw)||raw<=0)return{pass:false,marketOpen:true,ageMinutes:null,status:'Missing live quote timestamp'};
  const quoteMs=raw>1e12?raw:raw*1000,ageMinutes=Math.max(0,(now.getTime()-quoteMs)/60000);
  return{pass:ageMinutes<=15,marketOpen:true,ageMinutes,status:ageMinutes<=15?'Fresh':'Stale'};
}

export function expertGates(stock={},recommendation={}){
  const p=price(stock),m50=ma50(stock),m200=ma200(stock);
  const vs50=p>0&&m50>0?((p-m50)/m50)*100:null;
  const rawRv=volume(stock)>0&&avgVolume(stock)>0?volume(stock)/avgVolume(stock):null;
  const rv=pacedRelativeVolume(stock);
  const day=dayPct(stock);
  const momentum=n(recommendation.momentumScore??stock.momentumScore,50);
  const technical=n(recommendation.technicalScore??stock.technicalScore,50);
  const leadership=n(recommendation.leadershipScore??recommendation.relativeStrengthScore??stock.relativeStrengthScore??stock.leadershipScore,50);
  const entry=n(recommendation.entryQualityScore??stock.entryQualityScore,50);
  const risk=n(recommendation.riskScore??stock.riskScore,50);
  const extension=n(recommendation.extensionRisk??stock.extensionRisk,50);
  const raw=n(recommendation.score??stock.score??stock.compositeScore,50);
  const rr=n(recommendation?.riskPlan?.payoffRatio??stock?.riskPlan?.payoffRatio,0);
  const thesis=Math.round(clamp(n(recommendation.businessQualityScore??recommendation.fundamentalScore??stock.fundamentalScore,raw)));
  const trade=Math.round(clamp(technical*.28+momentum*.18+leadership*.18+entry*.20+(100-risk)*.08+(100-extension)*.08));
  const capitalScore=Math.round(clamp(thesis*.40+trade*.60));
  const below50=m50>0&&p<m50,below200=m200>0&&p<m200;
  const weakReclaim=m50>0&&vs50!==null&&vs50>=0&&vs50<2&&((!Number.isNaN(day)&&day<0)||momentum<58);
  const trendPass=!below50&&!below200&&!weakReclaim;
  const volumePass=rv===null||rv>=.4,participationPass=rv===null||rv>=.7||(!Number.isNaN(day)&&day>0);
  const rrPass=rr===0||rr>=1.75,chase=extension>=65||(vs50!==null&&vs50>20)||(!Number.isNaN(day)&&day>8);
  const quote=quoteFreshness(stock);
  const fundamentalStatus=String(stock?.fundamentalDataStatus||'legacy').toLowerCase();
  const fundamentalsPass=!['partial','unavailable','error'].includes(fundamentalStatus);
  const fullBuyPass=fundamentalsPass&&quote.pass&&trendPass&&volumePass&&participationPass&&rrPass&&!chase&&technical>=66&&leadership>=68&&momentum>=56&&entry>=58&&risk<=75&&raw>=74&&trade>=78&&capitalScore>=72;

  // Strong Buy is deliberately not just "Buy + one more binary threshold". It must have
  // a broad cushion across thesis, setup, capital quality, technical confirmation and risk.
  // Reward/risk contributes continuously instead of acting as a 1.75 cliff for this top tier.
  // This makes Strong Buy harder to earn while reducing sensitivity to one noisy intraday input.
  const strongRewardRiskQuality=rr>0?clamp(50+((rr-1.5)/1.0)*50,0,100):0;
  const strongQualityScore=Math.round(clamp(
    trade*.30+thesis*.20+capitalScore*.20+technical*.10+leadership*.10+strongRewardRiskQuality*.10
  ));
  const strongSafetyPass=fundamentalsPass&&quote.pass&&trendPass&&volumePass&&participationPass&&!chase&&rr>=1.50;
  const strongQualityFloors=thesis>=78&&trade>=82&&capitalScore>=82&&technical>=72&&leadership>=70&&raw>=78&&risk<=60;
  const strongBuyPass=strongSafetyPass&&strongQualityFloors&&strongQualityScore>=84;

  const partialBuyPass=fundamentalsPass&&quote.pass&&trendPass&&volumePass&&participationPass&&rrPass&&!chase&&raw>=70&&technical>=58&&leadership>=62&&momentum>=54&&entry>=52&&risk<=78&&trade>=74&&capitalScore>=70;
  const buyPass=strongBuyPass||fullBuyPass||partialBuyPass;
  const failures=[];
  if(!fundamentalsPass)failures.push('Fundamental data verification is incomplete; do not deploy new capital until the FMP fundamental feed is complete.');
  if(!quote.pass)failures.push(quote.ageMinutes===null?'Live quote timestamp is unavailable; do not deploy new capital during market hours.':`Live quote is ${Math.round(quote.ageMinutes)} minutes old; refresh market data before deploying capital.`);
  if(below200)failures.push('Below the 200-day trend.'); else if(below50)failures.push('Below the 50-day trend; reclaim is not confirmed.'); else if(weakReclaim)failures.push('Reclaim needs more confirmation.');
  if(!volumePass)failures.push('Volume pace is too weak for new capital.'); else if(!participationPass)failures.push('Price action lacks participation confirmation.');
  if(!rrPass)failures.push('Reward-to-risk is below the normal Buy deployment standard.'); if(chase)failures.push('Entry is extended; do not chase.');
  if(leadership<62)failures.push('Relative strength is below the Buy standard.'); if(technical<58)failures.push('Technical confirmation is below the Buy standard.');
  if(trade<74)failures.push('Trade setup quality is below the Buy standard.'); if(capitalScore<70)failures.push('Overall capital-allocation quality is below the Buy standard.');
  let action='Avoid'; if(strongBuyPass)action='Strong Buy'; else if(buyPass)action='Buy'; else if(raw>=52||leadership>=58||technical>=55||capitalScore>=60)action='Watch';
  const timing=(action==='Strong Buy'||action==='Buy')?'Now':action==='Watch'?'Wait for Trigger':'Wait';
  const size=action==='Strong Buy'?'Full':action==='Buy'?'Partial':'None';
  let decisionWhy='No new capital until the setup improves.';
  if(action==='Strong Buy')decisionWhy='Highest-conviction fresh-capital setup: broad quality and execution strength support full size with a meaningful cushion above ordinary Buy quality.';
  else if(action==='Buy'&&fullBuyPass)decisionWhy='Fresh capital is justified now; establish a partial position while preserving room to add.';
  else if(action==='Buy')decisionWhy='The setup has earned capital today, but not enough confirmation for full size. Establish a partial position.';
  else if(action==='Watch')decisionWhy=failures[0]||'Interesting, but it has not earned capital yet.';
  return{action,timing,size,decisionWhy,buyPass,strongBuyPass,partialBuyPass,fullBuyPass,failures,expertOverride:raw>=74&&!buyPass,expertOverrideReason:raw>=74&&!buyPass?(failures[0]||'A hard deployment gate blocks the raw Buy signal.'):'',trendStatus:trendPass?'Confirmed':'Not Confirmed',volumeStatus:participationPass?'Confirmed':'Not Confirmed',rewardRiskStatus:rrPass?'Pass':'Fail',capitalView:action==='Strong Buy'||action==='Buy'?'Deploy':action==='Watch'?'Wait':'Redeploy Elsewhere',thesisScore:thesis,tradeSetupScore:trade,capitalScore,strongQualityScore,metrics:{vs50,rawRelativeVolume:rawRv,relativeVolume:rv,marketSessionProgress:marketSessionProgress(),technical,leadership,momentum,entry,risk,extension,payoffRatio:rr,strongRewardRiskQuality,below50,below200,day,quoteFreshnessPass:quote.pass,quoteAgeMinutes:quote.ageMinutes,quoteFreshnessStatus:quote.status,fundamentalsPass,fundamentalDataStatus:fundamentalStatus}};
}

export function applyExpertDecision(stock={},recommendation={}){const expert=expertGates(stock,recommendation);return{...recommendation,label:expert.action,displayLabel:expert.action,recommendation:expert.action,tradeAction:expert.action,decisionTiming:expert.timing,positionSize:expert.size,decisionWhy:expert.decisionWhy,expertDecision:expert,expertOverride:expert.expertOverride,expertOverrideReason:expert.expertOverrideReason,thesisScore:expert.thesisScore,tradeSetupScore:expert.tradeSetupScore,capitalScore:expert.capitalScore,strongQualityScore:expert.strongQualityScore,capitalView:expert.capitalView};}

function mergerEconomics(stock={},eventRisk={}){
  const deal=eventRisk?.mergerEvent||null,p=price(stock),referenceValue=n(deal?.referenceValue,0);
  if(!deal||referenceValue<=0||p<=0)return{active:Boolean(deal),priced:false};
  const remainingUpsidePct=((referenceValue-p)/p)*100;
  const closeDate=deal?.expectedCloseDate?new Date(`${deal.expectedCloseDate}T00:00:00Z`):null;
  const now=new Date(),daysToClose=closeDate&&!Number.isNaN(closeDate.getTime())?Math.max(1,Math.ceil((closeDate.getTime()-now.getTime())/86400000)):null;
  const annualizedReturnPct=daysToClose?((Math.pow(referenceValue/p,365/daysToClose)-1)*100):null;
  // In a trading account, a modest capped spread that needs months to realize is opportunity-cost capital.
  // It should rotate only when there is already a separately-qualified high-confidence destination.
  const opportunityCost=daysToClose!==null&&daysToClose>=120&&remainingUpsidePct<=12&&annualizedReturnPct!==null&&annualizedReturnPct<=18;
  return{active:true,priced:true,referenceValue,currentPrice:p,remainingUpsidePct,daysToClose,annualizedReturnPct,opportunityCost,expectedCloseLabel:deal.expectedCloseLabel||'',acquirer:deal.acquirer||'',acquirerSymbol:deal.acquirerSymbol||'',structure:deal.structure||''};
}

export function portfolioDecision({stock={},recommendation={},position={}}={}){
  const expert=expertGates(stock,recommendation);
  const role=String(position.role||stock.positionRole||'Swing').toLowerCase()==='core'?'Core':'Swing';
  const pnlPct=n(position.pnlPct??position.gainLossPct??stock.pnlPct,0),weightPct=n(position.weightPct??stock.weightPct,0);
  const trade=expert.tradeSetupScore,thesis=expert.thesisScore,below200=Boolean(expert.metrics.below200),below50=Boolean(expert.metrics.below50);
  const technical=n(expert.metrics.technical,50),leadership=n(expert.metrics.leadership,50),momentum=n(expert.metrics.momentum,50),entry=n(expert.metrics.entry,50),risk=n(expert.metrics.risk,50),day=n(expert.metrics.day,0),extension=n(expert.metrics.extension,50),vs50=expert.metrics.vs50;
  const eventRisk=stock?.eventRisk||stock?.preTradeCheck||recommendation?.eventRisk||recommendation?.preTradeCheck||{};
  const eventBlocksNewCapital=Boolean(eventRisk?.blockNewCapital)||Boolean(eventRisk?.manualCheckRequired)||['blocked','manual'].includes(String(eventRisk?.status||'').toLowerCase());
  const broadAction=String(stock?.finalDecision?.action||'');
  const authoritativeAction=broadAction||expert.action;
  const quoteBlocksNewCapital=expert.metrics.quoteFreshnessPass===false;
  const fundamentalsBlockNewCapital=expert.metrics.fundamentalsPass===false;
  const deployable=(authoritativeAction==='Strong Buy'||authoritativeAction==='Buy')&&!eventBlocksNewCapital&&!quoteBlocksNewCapital&&!fundamentalsBlockNewCapital;
  const deploymentReason=stock?.finalDecision?.reason||expert.decisionWhy;
  const freshCapitalTargetPct=authoritativeAction==='Strong Buy'?9:authoritativeAction==='Buy'?6:0;
  const marketTechnicalBroken=below200&&(technical<45||momentum<45||leadership<48||trade<42);
  const thesisBroken=thesis<48,riskBroken=risk>84;
  const stabilizationSignals=[momentum>=42,entry>=48,technical>=40,day>=0,leadership>=45].filter(Boolean).length;
  const stabilizationPending=stabilizationSignals>=3&&!riskBroken&&thesis>=48;
  const activeDeterioration=day<=-1.5&&momentum<38&&entry<42;
  const severeTradeBreak=trade<30&&technical<35&&activeDeterioration;
  const swingExitConfirmed=(severeTradeBreak||(marketTechnicalBroken&&(thesisBroken||riskBroken)&&activeDeterioration))&&!stabilizationPending;
  const opportunityGap=n(position.opportunityGap??stock.opportunityGap??recommendation.opportunityGap,0);
  const rotateTarget=String(position.rotateTarget||stock.rotateTarget||recommendation.rotateTarget||'').toUpperCase();
  const rotationTargetEligible=Boolean(position.rotationTargetEligible??stock.rotationTargetEligible??recommendation.rotationTargetEligible);
  const staleSwing=role==='Swing'&&!swingExitConfirmed&&!deployable&&!eventBlocksNewCapital&&trade<55&&technical<55&&momentum<52;
  const extremeFroth=extension>=72||(vs50!==null&&vs50>22)||day>=10;
  const moderateFroth=extension>=62||(vs50!==null&&vs50>16)||day>=6.5;
  const winnerFading=trade<55&&(below50||momentum<48||technical<52);
  const profitProtection=role==='Swing'&&!swingExitConfirmed&&!eventBlocksNewCapital&&!deployable&&((pnlPct>=35&&extremeFroth)||(pnlPct>=60&&moderateFroth)||(pnlPct>=50&&winnerFading));
  // A normal rotation forces a sale, so require both a larger capital edge and a destination with a safety margin above an ordinary Buy.
  const rotationCandidate=staleSwing&&opportunityGap>=30&&Boolean(rotateTarget)&&rotationTargetEligible;
  const merger=mergerEconomics(stock,eventRisk);
  const mergerRotationCandidate=role==='Swing'&&merger.active&&merger.priced&&merger.opportunityCost&&Boolean(rotateTarget)&&rotationTargetEligible;
  let action='Hold',reason='The position still earns a place, but is not a priority for fresh money.';

  // Definitive acquisition targets are no longer evaluated as ordinary standalone holdings.
  // Deal economics and opportunity cost take precedence over technical/fundamental holding signals.
  if(merger.active){
    if(mergerRotationCandidate){
      action='Rotate';
      reason=`This is now a merger-spread position, not a normal standalone trade. About ${merger.remainingUpsidePct.toFixed(1)}% remains to the $${merger.referenceValue.toFixed(2)} reference value with roughly ${merger.daysToClose} days to the estimated close; ${rotateTarget} is already a separately-qualified high-confidence destination, so the capped return no longer justifies tying up trading capital.`;
    }else if(merger.priced){
      reason=`This is now a merger-spread position rather than a normal standalone holding. About ${merger.remainingUpsidePct.toFixed(1)}% remains to the $${merger.referenceValue.toFixed(2)} reference value over roughly ${merger.daysToClose} days. Hold only while that spread is competitive with available high-confidence alternatives; do not add based on standalone metrics.`;
    }else{
      reason='This company is subject to a definitive acquisition agreement. Hold/redeploy decisions should be based on deal economics and closing risk, not standalone technical metrics; do not add new capital.';
    }
  }else if(role==='Core'){
    if((eventBlocksNewCapital||quoteBlocksNewCapital||fundamentalsBlockNewCapital)&&(authoritativeAction==='Strong Buy'||authoritativeAction==='Buy')){reason=fundamentalsBlockNewCapital?'Hold; fundamental data verification is incomplete. Refresh after the FMP fundamental feed is complete before adding.':quoteBlocksNewCapital?'Hold; live quote freshness is insufficient for a new-capital decision. Refresh before adding.':`Hold; no new capital while event risk is unresolved. ${eventRisk.detail||'Wait for the event to clear before adding.'}`;}
    else if(deployable&&weightPct<30){action='Add';reason=deploymentReason;}
    else if(weightPct>=60&&pnlPct>40&&(below50||trade<55)){action='Trim';reason='Exceptional concentration plus a large gain and weakening setup justify a meaningful risk reduction.';}
    else if(below200&&thesis<38&&trade<38&&(riskBroken||technical<35)&&activeDeterioration&&!stabilizationPending){action='Exit';reason='Core exit confirmed by broken long-term structure, severe thesis deterioration and continuing downside deterioration.';}
    else if(stabilizationPending&&(below50||below200)){reason='Weak structure is showing enough stabilization to wait for confirmation rather than exit into a possible turn.';}
    else if(below200){reason='Core holding is technically weak, but the long-term thesis has not deteriorated enough to justify an exit.';}
    else if(weightPct>=45){reason='Core concentration is elevated, but concentration alone is not a sell signal while the thesis remains intact.';}
    else if((expert.action==='Strong Buy'||expert.action==='Buy')&&!deployable){reason='Standalone setup remains Buy-quality, but the authoritative broad capital ranking or pre-trade gate does not justify adding now.';}
    else reason='Core thesis and structure remain acceptable; hold unless either materially deteriorates.';
  }else{
    if((eventBlocksNewCapital||quoteBlocksNewCapital||fundamentalsBlockNewCapital)&&(authoritativeAction==='Strong Buy'||authoritativeAction==='Buy')){reason=fundamentalsBlockNewCapital?'Hold; fundamental data verification is incomplete. Refresh after the FMP fundamental feed is complete before adding.':quoteBlocksNewCapital?'Hold; live quote freshness is insufficient for a new-capital decision. Refresh before adding.':`Hold; no new capital while event risk is unresolved. ${eventRisk.detail||'Wait for the event to clear before adding.'}`;}
    else if(deployable&&weightPct<freshCapitalTargetPct){action='Add';reason=deploymentReason;}
    else if(profitProtection){action='Trim';reason=extremeFroth?'This has been a successful trade and the position is now materially extended. Bank part of the gain while keeping meaningful exposure.':winnerFading?'This has been a successful trade, but momentum/setup quality is fading. Bank part of the gain rather than waiting for a full breakdown.':'This winner is becoming stretched after a large gain. Take partial profits while allowing the remaining position to keep working.';}
    else if(weightPct>=30&&pnlPct>50&&trade<55){action='Trim';reason='This swing has become exceptionally large after a major gain; a meaningful reduction protects capital without forcing a full exit.';}
    else if(swingExitConfirmed){action='Exit';reason=severeTradeBreak?'Exit confirmed by an extreme trade/technical breakdown that is still actively deteriorating.':'Exit confirmed by technical failure plus an independent thesis/risk break and continuing downside deterioration.';}
    else if(rotationCandidate){action='Rotate';reason=`The swing remains viable, but ${rotateTarget} is a high-confidence Buy with a materially stronger forward setup. It clears the higher standard required to force a sale.`;}
    else if(stabilizationPending&&(marketTechnicalBroken||below200||below50)){reason='The swing is weak but showing enough stabilization to wait for reversal confirmation rather than exit prematurely.';}
    else if(marketTechnicalBroken){reason='The swing is technically weak, but that can reflect the broader theme/regime; no independent thesis or risk failure confirms an exit.';}
    else if(below200){reason='The swing is below the long-term trend, but the broader technical family alone does not justify an exit.';}
    else if(below50){reason='Swing momentum is soft; hold but do not add until the trend improves.';}
    else if((expert.action==='Strong Buy'||expert.action==='Buy')&&!deployable){reason='Standalone setup remains Buy-quality, but the authoritative broad capital ranking or pre-trade gate does not justify adding now.';}
    else if(authoritativeAction==='Watch'){reason='The holding remains viable, but the authoritative broad screen does not currently justify additional capital.';}
    else reason='The swing setup remains intact; continue holding and let the position work.';
  }
  const capitalPriority=action==='Add'?'New capital justified':action==='Exit'?'Redeploy':action==='Rotate'?(mergerRotationCandidate?`Rotate capped deal to ${rotateTarget}`:`Rotation candidate vs ${rotateTarget}`):action==='Trim'?(profitProtection?'Bank profits':'Exceptional risk reduction'):merger.active?'Merger spread hold':eventBlocksNewCapital?'Event hold':fundamentalsBlockNewCapital?'Fundamental data hold':quoteBlocksNewCapital?'Stale quote hold':'No new capital';
  return{action,role,capitalPriority,expertDecision:expert,authoritativeAction,freshCapitalTargetPct,reason,eventRisk:{blocked:eventBlocksNewCapital,status:eventRisk?.status||'',label:eventRisk?.label||''},mergerReview:{...merger,rotationCandidate:mergerRotationCandidate,rotateTarget,rotationTargetEligible},profitProtection:{triggered:profitProtection,pnlPct,extremeFroth,moderateFroth,winnerFading,extension,vs50,day},rotationReview:{candidate:rotationCandidate||mergerRotationCandidate,opportunityGap,rotateTarget,staleSwing,rotationTargetEligible,fundingIndependent:true,minimumEdge:mergerRotationCandidate?0:30,mergerDriven:mergerRotationCandidate},exitConfirmation:{confirmed:role==='Swing'?swingExitConfirmed:action==='Exit',marketTechnicalBroken,thesisBroken,riskBroken,severeTradeBreak,activeDeterioration,stabilizationPending,stabilizationSignals}};
}