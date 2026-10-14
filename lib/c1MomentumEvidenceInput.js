import {c1AccountRankEligible} from './c1AccountSimulator';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {isUsMarketSessionDay,marketSessionDistance} from './marketSession';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const symbolOf=row=>String(row?.symbol||row?.ticker||'').toUpperCase().trim();
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&isUsMarketSessionDay(value);
const numericTimingFields=['sma20','sma20Slope','macdHist','ret3','ret5','ret10','rsi14',
 'alpha20VsSpy','alpha20VsQqq','alpha60VsSpy','alpha60VsQqq','alpha120VsSpy','alpha120VsQqq',
 'stockReturn20','stockReturn60','stockReturn120','shortTermTechnicalScore'];
const booleanTimingFields=['macdImproving','relativeStrengthVerified','fallingKnife','momentumConflict',
 'volumeBreakout','chase','lateBounce','pass','strongPass','staleFallback','staleVerification'];

function publishedPool(session){
 // Match entrySignalPool in the account simulator: public signals replace
 // position signals of the same symbol. Private holding reviews are excluded.
 const pool=new Map();
 for(const row of [...(session.positionSignals||[]),...(session.signals||[])]){
  const symbol=symbolOf(row);if(symbol)pool.set(symbol,row);
 }
 return pool;
}

function momentumRankScore(signal){
 // Exact momentum-only ordering, including the simulator's neutral default.
 // A defaulted score is flagged as unverified rather than presented as data.
 const raw=signal?.researchFactors?.momentumPercentile;
 const parsed=raw===null||raw===undefined||raw===''?50:Number(raw);
 const value=Number.isFinite(parsed)?parsed:50;
 return Math.max(0,Math.min(100,value))-50;
}

function acceptedTiming(signal,source,date,limitations){
 const timing=signal?.entryTiming;
 const explicitAsOf=timing?.asOf;
 const misaligned=explicitAsOf!=null&&explicitAsOf!==date;
 const stale=timing?.staleFallback===true||timing?.staleVerification===true||signal?.staleFallback===true||
  signal?.clientSnapshotFallback===true||signal?.dataFeedSnapshotStale===true;
 const available=timing?.available===true&&!misaligned&&!stale;
 if(!available)limitations.push(`${date}: technical and relative-strength timing ${misaligned?'has a mismatched source date':stale?'is stale':'is unavailable'}.`);
 const result={available,asOf:explicitAsOf??date,source,
  status:misaligned?'misaligned':stale?'stale':available?'available':'unavailable'};
 for(const field of numericTimingFields)if(finite(timing?.[field]))result[field]=timing[field];
 for(const field of booleanTimingFields)if(typeof timing?.[field]==='boolean')result[field]=timing[field];
 if(stale)result.staleFallback=true;
 return result;
}

// Disposable display evidence from accepted account sessions. This function
// neither collects data nor changes model inputs, account state, or actions.
export function buildC1MomentumEvidenceInputs({position,sessions=[]}={}){
 sessions=Array.isArray(sessions)?sessions:[];
 const limitations=[],symbol=symbolOf(position);
 const sourceSessionDate=validDate(sessions?.at(-1)?.date)?sessions.at(-1).date:null;
 const output={contract:'c1-momentum-evidence-input-v1',sourceSessionDate,observations:[],limitations};
 if(!symbol||!sourceSessionDate){limitations.push('Accepted holding symbol and source session are unavailable.');return output;}
 const suffix=[];
 for(let index=sessions.length-1;index>=0&&suffix.length<6;index--){
  const session=sessions[index];
  if(!validDate(session?.date)||suffix.length&&marketSessionDistance(session.date,suffix[0].date)!==1){
   limitations.push('Momentum history contains a session gap; only the consecutive accepted suffix is used.');break;
  }
  suffix.unshift(session);
 }
 if(suffix.length<2)limitations.push('Fewer than two consecutive accepted sessions are available; rank trajectory is unavailable.');
 const sleeves=[...new Set((position?.reviewRules||[]).map(rule=>rule.sleeve))];
 if(!sleeves.length)limitations.push('The holding has no completed-session C1 sleeve review; momentum rank is unavailable.');
 output.observations=suffix.map(session=>{
  const pool=publishedPool(session),ranks={};
  for(const sleeve of sleeves){
   const config=Object.hasOwn(C1_FROZEN_OPTIONS,sleeve)?C1_FROZEN_OPTIONS[sleeve]:null;
   if(!config||config.researchRankMode!=='momentum-only'||!pool.size){
    ranks[sleeve]={rank:null,eligible:null,eligibleCount:null,source:'authoritative-opportunities',verified:false};
    limitations.push(`${session.date}: ${sleeve} authoritative momentum rank is unavailable.`);continue;
   }
   const ranked=[...pool.values()].filter(row=>c1AccountRankEligible(row,config)&&
    !config.blockedSymbols.includes(symbolOf(row))).sort((left,right)=>
     momentumRankScore(right)-momentumRankScore(left)||symbolOf(left).localeCompare(symbolOf(right)));
   const index=ranked.findIndex(row=>symbolOf(row)===symbol);
   const verified=ranked.length>0&&ranked.every(row=>finite(row?.researchFactors?.momentumPercentile));
   ranks[sleeve]={rank:index>=0?index+1:ranked.length+1,eligible:index>=0,
    eligibleCount:ranked.length,source:'authoritative-opportunities',verified};
   if(!verified)limitations.push(ranked.length?
    `${session.date}: ${sleeve} opportunity ranks contain an unavailable momentum input; rank trajectory is unverified.`:
    `${session.date}: ${sleeve} eligible opportunity pool is empty; momentum rank is unavailable.`);
  }
  const bars=(session.prices||[]).filter(row=>symbolOf(row)===symbol);
  const bar=bars.length===1?bars[0]:null;
  const close=bar?.adjusted===true&&positive(bar.close)&&(bar.date==null||bar.date===session.date)?bar.close:null;
  if(close===null)limitations.push(`${session.date}: accepted adjusted holding close is unavailable.`);
  const published=pool.get(symbol),holding=(session.accountHoldingSignals||[]).find(row=>symbolOf(row)===symbol),
   legacy=(session.legacyHoldingSignals||[]).find(row=>symbolOf(row)===symbol);
  const signal=published||holding||legacy;
  const signalSource=published?'accepted-published-signal':holding?'accepted-holding-signal':legacy?'accepted-holding-classification':'unavailable';
  const observation={date:session.date,close,ranks,timing:acceptedTiming(signal,signalSource,session.date,limitations)};
  for(const field of ['priceAvg50','priceAvg200'])if(positive(signal?.[field]))observation[field]=signal[field];
  return observation;
 });
 return output;
}
