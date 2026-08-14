// Expert decision layer shared by Opportunities and Portfolio Intelligence.
// Internal scores do the analysis; the UI surfaces only the resulting decision.

const n=(v,fallback=0)=>{const x=Number(String(v??'').replace(/[%,$,]/g,''));return Number.isFinite(x)?x:fallback};
const clamp=(v,lo=0,hi=100)=>Math.max(lo,Math.min(hi,v));
const price=s=>n(s?.price??s?.currentPrice??s?.lastPrice??s?.close);
const ma50=s=>n(s?.fiftyDayAverage??s?.priceAvg50??s?.sma50??s?.ma50);
const ma200=s=>n(s?.twoHundredDayAverage??s?.priceAvg200??s?.sma200??s?.ma200);
const volume=s=>n(s?.volume);
const avgVolume=s=>n(s?.avgVolume??s?.averageVolume??s?.avgVolume30Day);
const dayPct=s=>n(s?.dayChangePct??s?.changesPercentage??s?.changePercentage,NaN);

export function expertGates(stock={},recommendation={}){
  const p=price(stock),m50=ma50(stock),m200=ma200(stock);
  const vs50=p>0&&m50>0?((p-m50)/m50)*100:null;
  const rv=volume(stock)>0&&avgVolume(stock)>0?volume(stock)/avgVolume(stock):null;
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
  const fullBuyPass=trendPass&&volumePass&&participationPass&&rrPass&&!chase&&technical>=66&&leadership>=68&&momentum>=56&&entry>=58&&risk<=75&&raw>=74&&trade>=78&&capitalScore>=72;
  const strongBuyPass=fullBuyPass&&trade>=85&&thesis>=75&&capitalScore>=80&&risk<=65;
  const partialBuyPass=!below200&&!chase&&volumePass&&raw>=64&&technical>=52&&leadership>=56&&entry>=46&&risk<=82&&trade>=68&&trendPass&&participationPass;
  const buyPass=fullBuyPass||partialBuyPass;
  const failures=[];
  if(below200)failures.push('Below the 200-day trend.'); else if(below50)failures.push('Below the 50-day trend; reclaim is not confirmed.'); else if(weakReclaim)failures.push('Reclaim needs more confirmation.');
  if(!volumePass)failures.push('Volume is too weak for new capital.'); else if(!participationPass)failures.push('Price action lacks participation confirmation.');
  if(!rrPass)failures.push('Reward-to-risk is below the deployment standard.'); if(chase)failures.push('Entry is extended; do not chase.');
  if(leadership<56)failures.push('Relative strength is below the minimum deployment standard.'); if(technical<52)failures.push('Technical confirmation is below the minimum deployment standard.');
  let action='Avoid'; if(strongBuyPass)action='Strong Buy'; else if(buyPass)action='Buy'; else if(raw>=52||leadership>=58||technical>=55||capitalScore>=60)action='Watch';
  const timing=(action==='Strong Buy'||action==='Buy')?'Now':action==='Watch'?'Wait for Trigger':'Wait';
  const size=action==='Strong Buy'?'Full':action==='Buy'?'Partial':'None';
  let decisionWhy='No new capital until the setup improves.';
  if(action==='Strong Buy')decisionWhy='Highest-conviction fresh-capital setup: thesis and execution both support full size now.';
  else if(action==='Buy'&&fullBuyPass)decisionWhy='Fresh capital is justified now; establish a partial position while preserving room to add.';
  else if(action==='Buy')decisionWhy='The setup has earned capital, but confirmation is not strong enough for full size. Establish a partial position.';
  else if(action==='Watch')decisionWhy=failures[0]||'Interesting, but it has not earned capital yet.';
  return{action,timing,size,decisionWhy,buyPass,strongBuyPass,partialBuyPass,fullBuyPass,failures,expertOverride:raw>=74&&!buyPass,expertOverrideReason:raw>=74&&!buyPass?(failures[0]||'A hard deployment gate blocks the raw Buy signal.'):'',trendStatus:trendPass?'Confirmed':'Not Confirmed',volumeStatus:participationPass?'Confirmed':'Not Confirmed',rewardRiskStatus:rrPass?'Pass':'Fail',capitalView:action==='Strong Buy'||action==='Buy'?'Deploy':action==='Watch'?'Wait':'Redeploy Elsewhere',thesisScore:thesis,tradeSetupScore:trade,capitalScore,metrics:{vs50,relativeVolume:rv,rawScore:raw,technical,leadership,momentum,entry,risk,extension,payoffRatio:rr,below50,below200}};
}
export function applyExpertDecision(stock={},recommendation={}){const expert=expertGates(stock,recommendation);return{...recommendation,label:expert.action,displayLabel:expert.action,recommendation:expert.action,tradeAction:expert.action,decisionTiming:expert.timing,positionSize:expert.size,decisionWhy:expert.decisionWhy,expertDecision:expert,expertOverride:expert.expertOverride,expertOverrideReason:expert.expertOverrideReason,thesisScore:expert.thesisScore,tradeSetupScore:expert.tradeSetupScore,capitalScore:expert.capitalScore,capitalView:expert.capitalView};}

// Portfolio roles are intentionally simple: Swing is the trading-account default; Core is an explicit long-term exception.
// Trim is deliberately rare because normal trade sizes are better managed with Add / Hold / Exit.
export function portfolioDecision({stock={},recommendation={},position={}}={}){
  const expert=expertGates(stock,recommendation);
  const role=String(position.role||stock.positionRole||'Swing').toLowerCase()==='core'?'Core':'Swing';
  const pnlPct=n(position.pnlPct??position.gainLossPct??stock.pnlPct,0),weightPct=n(position.weightPct??stock.weightPct,0);
  const trade=expert.tradeSetupScore,thesis=expert.thesisScore,below200=Boolean(expert.metrics.below200),below50=Boolean(expert.metrics.below50);
  const deployable=expert.action==='Strong Buy'||expert.action==='Buy';
  let action='Hold',reason='The position still earns a place, but is not a priority for fresh money.';
  if(role==='Core'){
    if(deployable&&weightPct<30){action='Add';reason=expert.decisionWhy;}
    else if(weightPct>=60&&pnlPct>40&&(below50||trade<55)){action='Trim';reason='Exceptional concentration plus a large gain and weakening setup justify a meaningful risk reduction.';}
    else if(below200&&thesis<40&&trade<40){action='Exit';reason='Both the long-term thesis and price structure are materially broken.';}
    else if(below200){reason='Core holding is technically weak, but the long-term thesis has not deteriorated enough to justify an exit.';}
    else if(weightPct>=45){reason='Core concentration is elevated, but concentration alone is not a sell signal while the thesis remains intact.';}
    else reason='Core thesis and structure remain acceptable; hold unless either materially deteriorates.';
  }else{
    if(deployable&&weightPct<15){action='Add';reason=expert.decisionWhy;}
    else if(weightPct>=30&&pnlPct>50&&trade<55){action='Trim';reason='This swing has become exceptionally large after a major gain; a meaningful reduction protects capital without forcing a full exit.';}
    else if(below200&&trade<45&&thesis<55){action='Exit';reason='The swing trade is invalidated: long-term trend and trade quality have both materially deteriorated.';}
    else if(expert.action==='Avoid'&&trade<38){action='Exit';reason='Trade quality has collapsed enough that the original swing setup no longer earns capital.';}
    else if(below200){reason='The swing is below the long-term trend, but deterioration is not yet severe enough to force an exit.';}
    else if(below50){reason='Swing momentum is soft; hold but do not add until the trend improves.';}
    else if(expert.action==='Watch'){reason='The holding remains viable, but it has not earned additional capital.';}
    else reason='The swing setup remains intact; continue holding and let the position work.';
  }
  const capitalPriority=action==='Add'?'New capital justified':action==='Exit'?'Redeploy':action==='Trim'?'Exceptional risk reduction':'No new capital';
  return{action,role,capitalPriority,expertDecision:expert,reason};
}
