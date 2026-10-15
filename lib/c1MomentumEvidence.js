import {latestCompletedMarketSessionDay,marketSessionDistance} from './marketSession';
import {C1_ACCOUNT_MOMENTUM_EXIT_POLICY} from './c1FrozenOptions';
import {c1RecentMomentumNeedsReview,c1RecentMomentumExplanation} from './c1RecentMomentumLivePolicy';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const tones={'Momentum Accelerating':'accelerating','Momentum Intact':'intact','Momentum Weakening':'weakening','Exit Risk':'exit-risk'};
const percent=value=>`${value>=0?'+':''}${value.toFixed(1)}%`;
const alphaText=(value,window)=>`${window}-session return versus SPY ${value>=0?'+':''}${value.toFixed(1)} percentage points`;

function evidence({classification=null,status,sourceSessionDate,parts=[],limitations=[],riskBasis=null}){
 const missing=[...new Set(limitations)];
 return {contract:'c1-momentum-evidence-v1',classification,
  status:status||(classification?(missing.length?'partial':'available'):'unavailable'),
  label:classification||(status==='stale'?'Evidence stale':'Evidence unavailable'),
  tone:tones[classification]||'unknown',sourceSessionDate:sourceSessionDate||null,riskBasis,
  explanation:[...new Set(parts),...missing].join(' '),limitations:missing};
}
function validTiming(observation){
 const timing=observation?.timing;
 return timing?.available===true&&!timing.staleFallback&&!timing.staleVerification&&
  (!timing.asOf||timing.asOf===observation.date)?timing:null;
}
function validRank(rank){
 return rank?.source==='authoritative-opportunities'&&rank.verified!==false&&
  typeof rank.eligible==='boolean'&&Number.isSafeInteger(rank.eligibleCount)&&rank.eligibleCount>=0&&
  (!rank.eligible||(Number.isSafeInteger(rank.rank)&&rank.rank>0&&rank.rank<=rank.eligibleCount));
}
export function c1MomentumRiskBasis(position={}){
 return JSON.stringify({shares:position.shares,avgCost:position.avgCost,
  stops:position.stops||[],exits:position.exits||[],reviewRules:position.reviewRules||[],recentMomentumReviews:position.recentMomentumReviews||[]});
}

// Read-only thesis evidence. These descriptions never supply a portfolio action,
// change an exit threshold, or reset a completed-session confirmation streak.
export function classifyC1MomentumEvidence({position={},input,current=true,sourceSessionDate}={}){
 const result=args=>evidence({...args,riskBasis:c1MomentumRiskBasis(position)});
 const date=sourceSessionDate||input?.sourceSessionDate||null;
 if(!date)return result({parts:['A dated C1 momentum review is unavailable.']});
 if(!current||(input?.sourceSessionDate&&input.sourceSessionDate!==date))return result({status:'stale',sourceSessionDate:date,
  parts:[`Momentum evidence is stale${date?` as of ${date}`:''}; refresh the completed-session review.`,...(position.exits?.length?['A previously queued exit remains in the position decision.']:[])]});
 const inputLimitations=input?.limitations||[];
 const limitations=inputLimitations.filter(item=>!/^\d{4}-\d{2}-\d{2}:/.test(item)||item.startsWith(date+':')),parts=[];
 if(inputLimitations.some(item=>/^\d{4}-\d{2}-\d{2}:/.test(item)&&!item.startsWith(date+':')))
  limitations.push('Some prior accepted observations are incomplete; only verified comparisons are used.');
 const supplied=input?.contract==='c1-momentum-evidence-input-v1'&&input.sourceSessionDate===date?input.observations||[]:[];
 if(supplied.length&&supplied.at(-1)?.date!==date)return result({status:'stale',sourceSessionDate:date,
  parts:[`Latest momentum observation is dated ${supplied.at(-1)?.date||'unknown'}, rather than ${date}; refresh the completed-session review.`,...(position.exits?.length?['A previously queued exit remains in the position decision.']:[])]});
 const observations=[];
 // Use only a consecutive suffix ending on the accepted account session.
 for(let index=supplied.length-1;index>=0&&observations.length<6;index--){
  const row=supplied[index];
  if(!row?.date||(observations.length===0?row.date!==date:marketSessionDistance(row.date,observations[0].date)!==1))break;
  observations.unshift(row);
 }
 const latest=observations.at(-1),previous=observations.length>1?observations[0]:null;
 const rules=position.reviewRules||[],sleeves=[...new Set(rules.map(rule=>rule.sleeve).filter(Boolean))];
 const rankRows=sleeves.map(sleeve=>({sleeve,rank:latest?.ranks?.[sleeve],rule:rules.find(rule=>rule.sleeve===sleeve)}));
 const rankAvailable=rankRows.length>0&&rankRows.every(row=>validRank(row.rank));
 const ranks=rankAvailable?rankRows:[];
 if(!rankAvailable)limitations.push('Verified momentum rank is unavailable.');
 else for(const {rank,rule} of ranks){
  const text=rank.eligible?`Momentum rank ${rank.rank} of ${rank.eligibleCount}`:'Outside the eligible C1 opportunity pool';
  const range=Number.isSafeInteger(rule.exitBuffer)?`; holding range top ${rule.exitBuffer}`:'';
  parts.push(`${text}${range}.`);
 }
 let rankImproving=false,rankWeakening=false,rankCompared=false;
 if(rankAvailable&&previous){
  const comparisons=ranks.map(({sleeve,rank})=>({rank,prior:previous.ranks?.[sleeve]}));
  if(comparisons.every(({rank,prior})=>validRank(prior)&&prior.eligibleCount===rank.eligibleCount)){
   rankCompared=true;
   rankImproving=comparisons.some(({rank,prior})=>rank.eligible&&(!prior.eligible||rank.rank<prior.rank));
   rankWeakening=comparisons.some(({rank,prior})=>prior.eligible&&(!rank.eligible||rank.rank>prior.rank));
   const changes=[...new Set(comparisons.map(({rank,prior})=>`${prior.eligible?`#${prior.rank}`:'outside pool'} to ${rank.eligible?`#${rank.rank}`:'outside pool'}`))];
   parts.push(`Rank trajectory ${previous.date} to ${date}: ${changes.join('; ')}.`);
  }else limitations.push('Rank trajectory is unavailable across missing ranks or a changed eligible pool size.');
 }else limitations.push('Rank trajectory is unavailable without a prior consecutive accepted session.');
 const timing=validTiming(latest),priorTiming=validTiming(previous);
 const technicalAvailable=timing&&finite(timing.ret5)&&finite(timing.sma20Slope);
 if(technicalAvailable){
  parts.push(`Price return over 5 sessions ${percent(timing.ret5)}; 20-session average slope ${percent(timing.sma20Slope)}${typeof timing.macdImproving==='boolean'?`; MACD ${timing.macdImproving?'improving':'not improving'}`:''}.`);
 }else limitations.push(latest?.timing?.staleFallback||latest?.timing?.staleVerification||latest?.timing?.asOf&&latest.timing.asOf!==date?
  'Technical price evidence is stale or dated to a different session.':'Technical price trend evidence is unavailable.');
 const relativeValues=timing?.relativeStrengthVerified===true?[['20',timing.alpha20VsSpy],['60',timing.alpha60VsSpy]].filter(([,value])=>finite(value)):[];
 const relativeAvailable=relativeValues.length>0;
 if(relativeAvailable)parts.push(relativeValues.map(([window,value])=>alphaText(value,window)).join('; ')+'.');
 else limitations.push('Verified relative strength versus SPY is unavailable.');
 if(relativeAvailable&&relativeValues.length<2)limitations.push('Only one relative-strength horizon is available.');
 const relativeImproving=timing?.relativeStrengthVerified===true&&priorTiming?.relativeStrengthVerified===true&&
  finite(timing.alpha20VsSpy)&&finite(priorTiming.alpha20VsSpy)&&timing.alpha20VsSpy>priorTiming.alpha20VsSpy&&timing.alpha20VsSpy>0;
 if(relativeImproving)parts.push(`20-session relative strength improved from ${priorTiming.alpha20VsSpy.toFixed(1)} to ${timing.alpha20VsSpy.toFixed(1)} percentage points since ${previous.date}.`);
 else if(!priorTiming||priorTiming.relativeStrengthVerified!==true||!finite(priorTiming.alpha20VsSpy)||!finite(timing?.alpha20VsSpy))limitations.push('Relative-strength trajectory is unavailable.');

 const close=positive(latest?.close)?latest.close:null;
 const stops=(position.stops||[]).map(stop=>stop.price).filter(positive);
 const nearStop=close!==null&&stops.some(stop=>(close-stop)/close*100<=3);
 const risk=[];
 if(position.exits?.length)risk.push(`An existing exit is queued (${[...new Set(position.exits.map(exit=>exit.reason||'recorded exit condition'))].join(', ')}).`);
 if(nearStop){
  const stop=Math.max(...stops),distance=(close-stop)/close*100;
  risk.push(distance<=0?`Accepted close $${close.toFixed(2)} is at or below the recorded $${stop.toFixed(2)} stop.`:
   `Accepted close $${close.toFixed(2)} has ${distance.toFixed(1)}% downside to the recorded $${stop.toFixed(2)} stop (within the 3% evidence warning band).`);
 }
 for(const rule of rules){
  if(rule.rankVerified===false)continue;
  const rank=latest?.ranks?.[rule.sleeve];
  const outside=threshold=>validRank(rank)&&(!rank.eligible||rank.rank>threshold);
  const earlyStart=finite(rule.earlyStart)?rule.earlyStart:C1_ACCOUNT_MOMENTUM_EXIT_POLICY.earlyRankExitStartSessions;
  const earlyEnd=finite(rule.earlyEnd)?rule.earlyEnd:C1_ACCOUNT_MOMENTUM_EXIT_POLICY.earlyRankExitEndSessions;
  if(finite(rule.heldSessions)&&rule.heldSessions>=earlyStart&&rule.heldSessions<earlyEnd){
   if(finite(rule.earlyThreshold)&&outside(rule.earlyThreshold)&&Number.isSafeInteger(rule.earlyConfirmations)&&rule.earlyConfirmations>0&&rule.earlyStreak>0&&rule.earlyStreak>=rule.earlyConfirmations-1)
    risk.push(`Early momentum exit confirmation: ${rule.earlyStreak} of ${rule.earlyConfirmations} completed sessions outside the top ${rule.earlyThreshold}.`);
   if(rule.profitProtectionArmed===true&&finite(rule.profitThreshold)&&outside(rule.profitThreshold)&&Number.isSafeInteger(rule.profitConfirmations)&&rule.profitConfirmations>0&&rule.profitStreak>0&&rule.profitStreak>=rule.profitConfirmations-1)
    risk.push(`Existing profit protection is armed; ${rule.profitStreak} of ${rule.profitConfirmations} completed sessions outside the top ${rule.profitThreshold}.`);
  }
  if(validRank(rank)&&finite(rule.heldSessions)&&finite(rule.minimumHold)&&rule.heldSessions>=rule.minimumHold&&finite(rule.exitBuffer)&&(!rank.eligible||rank.rank>rule.exitBuffer))
   risk.push(`The existing ${rule.minimumHold}-session minimum has elapsed and momentum rank is outside the top ${rule.exitBuffer} exit range.`);
 }
 if(close===null)limitations.push('Accepted closing price is unavailable.');
 if(!stops.length)limitations.push('No recorded stop level is available.');
 if(risk.length)return result({classification:'Exit Risk',sourceSessionDate:date,parts:[...new Set(risk),...parts],limitations});

 if((position.recentMomentumReviews||[]).some(review=>review.available!==true))return result({sourceSessionDate:date,
  parts:[c1RecentMomentumExplanation(position),...parts],limitations:[...limitations,'Recent-momentum decision evidence is unavailable; missing data is not observed deterioration.']});
 if(c1RecentMomentumNeedsReview(position))return result({classification:'Momentum Weakening',sourceSessionDate:date,
  parts:[c1RecentMomentumExplanation(position),...parts],limitations});

 const outsideRange=ranks.some(({rank,rule})=>!rank.eligible||(finite(rule.exitBuffer)&&rank.rank>rule.exitBuffer));
 const priceWeakening=timing?.fallingKnife===true||(technicalAvailable&&timing.ret5<0&&timing.sma20Slope<0);
 const relativeWeakening=relativeValues.some(([,value])=>value<0);
 if(rankWeakening||outsideRange||priceWeakening||relativeWeakening)return result({classification:'Momentum Weakening',sourceSessionDate:date,
  parts:[...(priceWeakening?['Price action shows weakening technical momentum.']:[]),...parts],limitations});
 const priceSupport=technicalAvailable&&timing.ret5>=0&&timing.sma20Slope>=0;
 const relativeSupport=relativeAvailable&&relativeValues.every(([,value])=>value>=0);
 if(rankCompared&&rankImproving&&priceSupport&&timing.ret5>0&&timing.sma20Slope>0&&timing.macdImproving===true&&relativeSupport&&relativeImproving)
  return result({classification:'Momentum Accelerating',sourceSessionDate:date,parts,limitations});
 if(rankAvailable&&!outsideRange&&priceSupport&&relativeSupport)
  return result({classification:'Momentum Intact',sourceSessionDate:date,parts,limitations});
 return result({sourceSessionDate:date,parts:['Available evidence does not establish a supported momentum classification.',...parts],limitations});
}

// Validate serialized evidence again at display time; a retained account view
// must never become a fresh thesis assessment merely because the page rerenders.
export function c1PortfolioMomentumEvidence({position,decision,now=new Date()}={}){
 if(!position)return evidence({parts:['A verified C1 momentum review is unavailable for this holding.']});
 const saved=position.momentumEvidence,date=decision?.sourceSessionDate;
 if(decision?.current!==true||date!==latestCompletedMarketSessionDay(now)||saved?.sourceSessionDate&&saved.sourceSessionDate!==date)
  return evidence({status:'stale',sourceSessionDate:date,parts:[`Momentum evidence is stale${date?` as of ${date}`:''}; refresh the completed-session review.`]});
 if(saved?.contract!=='c1-momentum-evidence-v1')return evidence({sourceSessionDate:date,parts:['A verified C1 momentum review is unavailable for this holding.']});
 if(saved.riskBasis!==c1MomentumRiskBasis(position))return evidence({sourceSessionDate:date,
  classification:position.exits?.length?'Exit Risk':null,
  parts:position.exits?.length?[`An existing exit is queued (${[...new Set(position.exits.map(exit=>exit.reason||'recorded exit condition'))].join(', ')}).`]:[],
  limitations:['Position risk evidence changed after the completed-session assessment; a momentum classification for the updated position awaits its completed-session review.']});
 if(position.exits?.length&&saved.classification!=='Exit Risk')return evidence({classification:'Exit Risk',sourceSessionDate:date,
  parts:[`An existing exit is queued (${[...new Set(position.exits.map(exit=>exit.reason||'recorded exit condition'))].join(', ')}).`,saved.explanation],limitations:saved.limitations});
 return saved;
}
