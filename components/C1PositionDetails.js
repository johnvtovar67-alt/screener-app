import {latestCompletedMarketSessionDay} from '../lib/marketSession';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const percent=value=>finite(value)?`${value>=0?'+':''}${value.toFixed(2)}%`:'Unavailable';
const money=value=>finite(value)&&value>0?`$${value.toFixed(2)}`:'Unavailable';
const flag=value=>value===true?'Armed':value===false?'Not armed':'Unavailable';
const count=(value,target)=>Number.isSafeInteger(value)&&value>=0?`${value}${Number.isSafeInteger(target)&&target>0?` / ${target}`:''}`:'Unavailable';
const timestamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value.replace('T',' ').replace(/\.\d{3}Z$/,' UTC').replace(/Z$/,' UTC'):'Unavailable';
const quoteLabels={
 'verified-regular-session':'Verified regular session','previous-close':'Previous close',premarket:'Premarket','after-hours':'After hours',
 'stale-quote':'Stale quote','fallback-unverified':'Fallback / unverified','future-quote':'Invalid timestamp',unverified:'Unverified'
};

function Values({rows}){
 return <dl>{rows.map(([label,value],index)=><div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function groupedValue(items,valueFor){
 const values=new Map();
 for(const item of items){
  const value=valueFor(item);
  if(!values.has(value))values.set(value,[]);
  values.get(value).push(item.sleeve||'Allocation');
 }
 if(!values.size)return 'Unavailable';
 if(values.size===1)return values.keys().next().value;
 return [...values].map(([value,sleeves])=>`${[...new Set(sleeves)].join(', ')}: ${value}`).join(' · ');
}

// Read-only compact display of supplied decisions and evidence. This component
// does not calculate a rank, a stop breach, a peak, or a confirmation streak.
export default function C1PositionDetails({position,decision,stock,presentation,evidence,eventLabel,children}){
 const suppliedReviews=position?.recentMomentumReviews||[],rules=position?.reviewRules||[];
 const sameSource=row=>row?.available===true&&typeof decision?.sourceSessionDate==='string'&&row.sourceSessionDate===decision.sourceSessionDate;
 const reviews=suppliedReviews.filter(sameSource),review=reviews[0];
 const suppliedGate=evidence?.recentMomentumGate,gate=sameSource(suppliedGate)?suppliedGate:null;
 // Generic stock timing is not evidence for the accepted account/entry gate.
 const metrics=position?review?.metrics:gate?.metrics;
 const recentAvailable=[metrics?.ret1,metrics?.ret3,metrics?.ret5].some(finite)||typeof metrics?.macdImproving==='boolean';
 const recentRows=recentAvailable?[['1 session',percent(metrics?.ret1)],['3 sessions',percent(metrics?.ret3)],['5 sessions',percent(metrics?.ret5)],
  ['MACD',metrics?.macdImproving===true?'Improving':metrics?.macdImproving===false?'Not improving':'Unavailable']]:[['Evidence','Unavailable']];
 if(reviews.length){
  recentRows.push(['Deterioration confirmations',groupedValue(reviews,row=>count(row.state?.streak,row.metrics?.confirmations))]);
  const armed=reviews.filter(row=>row.state?.profitProtectionArmed===true);
  if(armed.length)recentRows.push(['Giveback confirmations',groupedValue(armed,row=>count(row.state?.profitGivebackStreak))]);
 }

 const rankRows=[];
 if(eventLabel)rankRows.push(['Event',eventLabel]);
 if(typeof evidence?.label==='string'&&evidence.label)rankRows.push(['Assessment',evidence.label]);
 const ranks=Object.entries(position?.holdingRank||{}).map(([sleeve,rank])=>({sleeve,rank}));
 rankRows.push(['Momentum rank',groupedValue(ranks,({rank})=>{
  const text=rank?.verified===false?'Unavailable':rank?.eligible===false?'Outside eligible range':rank?.eligible===true&&Number.isSafeInteger(rank.rank)&&rank.rank>0&&Number.isSafeInteger(rank.eligibleCount)&&rank.rank<=rank.eligibleCount?`#${rank.rank} / ${rank.eligibleCount}`:'Unavailable';
  return text;
 })]);
 const score=evidence?.momentumScore??stock?.researchFactors?.momentumPercentile;
 if(!position&&finite(score)&&score>=0&&score<=100)rankRows.push(['Momentum score',`${score.toFixed(1)} / 100`]);
 if(reviews.length){
  rankRows.push(['Profit protection',groupedValue(reviews,row=>flag(row.state?.profitProtectionArmed))]);
  rankRows.push(['Verified peak gain',groupedValue(reviews,row=>row.metrics?.verifiedPeak===true?percent(row.metrics.peakGainPct):'Unavailable')]);
  if(reviews.some(row=>row.metrics?.verifiedPeak===true&&finite(row.metrics.gainGivebackFraction)))rankRows.push(['Peak gain given back',groupedValue(reviews,row=>row.metrics?.verifiedPeak===true&&finite(row.metrics.gainGivebackFraction)?`${(row.metrics.gainGivebackFraction*100).toFixed(1)}%`:'Unavailable')]);
 }
 if(rules.length){
  rankRows.push(['Holding rank range',groupedValue(rules,rule=>Number.isSafeInteger(rule.exitBuffer)&&rule.exitBuffer>0?`Top ${rule.exitBuffer}`:'Unavailable')]);
  rankRows.push(['Early rank confirmations',groupedValue(rules,rule=>count(rule.earlyStreak,rule.earlyConfirmations))]);
  rankRows.push(['Profit rank confirmations',groupedValue(rules,rule=>count(rule.profitStreak,rule.profitConfirmations))]);
 }

 const stops=position?.stops||[];
 const stopRows=[['Recorded stop',groupedValue(stops,stop=>money(stop.price))]];
 if(presentation)stopRows.push(['Verified current price',presentation.quoteVerified===true?money(presentation.quotePrice):'Unavailable']);
 if(presentation)stopRows.push(['Stop decision',presentation.stopTriggered===true?'Triggered':presentation.urgent===true?'Urgent verification':presentation.quoteVerified===true?'No trigger confirmed':'Current verification unavailable']);
 if(position)stopRows.push(['Recorded stop exit',Array.isArray(position.exits)?position.exits.some(exit=>exit.reason==='initial-stop')?'Pending':'None recorded':'Unavailable']);
 const closes=reviews.some(row=>finite(row.metrics?.close))?reviews.map(row=>({sleeve:row.sleeve,close:row.metrics?.close})):rules;
 if(closes.length)stopRows.push(['Last account close',groupedValue(closes,row=>money(row.close))]);
 const quote=presentation?.quoteStatus||stock?.quoteVerification;
 const sourceDates=[...new Set((position?suppliedReviews:suppliedGate?[suppliedGate]:[]).map(row=>row.sourceSessionDate).filter(Boolean))];
 const sourceCurrent=decision?.sourceSessionDate===latestCompletedMarketSessionDay(new Date());
 const accountFreshness=evidence?.status==='stale'||decision?.current===false||(decision?.current===true&&!sourceCurrent)?'Stale':decision?.current===true?'Current':'Unavailable';
 const freshnessRows=[['Account review',accountFreshness],
  ['Source session',decision?.sourceSessionDate||'Unavailable'],
  ['Recent evidence',position?reviews.length&&reviews.length===suppliedReviews.length?'Available':suppliedReviews.length?'Incomplete':'Unavailable':gate?'Available':'Unavailable']];
 if(sourceDates.length&&sourceDates.join(', ')!==decision?.sourceSessionDate)freshnessRows.push(['Momentum source',sourceDates.join(', ')]);
 freshnessRows.push(['Quote',presentation?.quoteVerified===true?'Verified regular session':quoteLabels[quote?.status]||'Unverified']);
 const observedAt=presentation?.quoteAt||quote?.quoteAt,lastVerifiedAt=presentation?.lastVerifiedQuoteAt;
 if(!lastVerifiedAt||observedAt!==lastVerifiedAt)freshnessRows.push(['Quote observation',timestamp(observedAt)]);
 freshnessRows.push(['Last verified quote',timestamp(lastVerifiedAt)],['Quote source',quote?.provider||'Unavailable']);
 if(presentation?.quoteValidUntil)freshnessRows.push(['Quote valid until',timestamp(presentation.quoteValidUntil)]);

 return <details className="c1PositionDetails"><summary>Details</summary><div className="detailGroups">
  <section><h4>Recent momentum</h4><Values rows={recentRows}/></section>
  <section><h4>Rank / protection state</h4><Values rows={rankRows}/></section>
  <section><h4>Stop information</h4><Values rows={stopRows}/></section>
  <section><h4>Data freshness</h4><Values rows={freshnessRows}/>{children}</section>
 </div><style jsx>{`.c1PositionDetails{max-width:520px;min-width:0;font-size:12px;color:#475569}.c1PositionDetails>summary{cursor:pointer;font-weight:700;color:#475569}.detailGroups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding-top:10px}.detailGroups section{min-width:0}.detailGroups h4{font-size:12px;color:#111827;margin:0 0 6px}.detailGroups :global(dl){margin:0}.detailGroups :global(dl>div){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:3px 0}.detailGroups :global(dt){color:#64748b}.detailGroups :global(dd){margin:0;color:#334155;font-weight:600;overflow-wrap:anywhere}@media(max-width:700px){.detailGroups{grid-template-columns:minmax(0,1fr)}.detailGroups :global(dl>div){grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}`}</style></details>;
}
