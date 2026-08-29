import {marketObservationSessionDay,marketSessionDistance} from './marketSession';

export const PERFORMANCE_HORIZONS=[1,2,3,5,10,20,40,60];
export const PERFORMANCE_SESSION_BASIS='us-equity-session-v1';
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null;};
const timestampMs=r=>{const raw=r?.timestamp||r?.lastMarkAt||r?.day;if(!raw)return 0;const ts=new Date(raw).getTime();return Number.isFinite(ts)?ts:0;};
const sessionFor=r=>{
  const raw=r?.timestamp||r?.lastMarkAt,ts=raw?new Date(raw).getTime():NaN;
  // The timestamp is authoritative. This repairs legacy rows whose sessionDay
  // was derived from UTC midnight instead of the U.S. market session. A
  // date-only legacy row has no time-zone evidence, so preserve its recorded
  // session rather than interpreting midnight UTC as the prior ET day.
  return Number.isFinite(ts)?marketObservationSessionDay(ts):(r?.sessionDay||r?.day||null);
};

function recordKey(r={}){
  if(r.id)return String(r.id);
  return [r.recordType||'signal',r.symbol||'',r.action||'',sessionFor(r)||'',r.timestamp||''].join(':');
}

function mergeRecord(a={},b={}){
  const newer=timestampMs(b)>=timestampMs(a)?b:a,older=newer===b?a:b;
  const mae=[n(a.pathMaePct),n(b.pathMaePct)].filter(Number.isFinite),mfe=[n(a.pathMfePct),n(b.pathMfePct)].filter(Number.isFinite);
  const merged={...older,...newer,forward:{...(older.forward||{}),...(newer.forward||{})}};
  if(mae.length)merged.pathMaePct=Math.min(...mae);
  if(mfe.length)merged.pathMfePct=Math.max(...mfe);
  return merged;
}

export function mergeLedgerRecords(...groups){
  const byKey=new Map();
  for(const r of groups.flat().filter(Boolean)){const key=recordKey(r);byKey.set(key,byKey.has(key)?mergeRecord(byKey.get(key),r):{...r,forward:r.forward?{...r.forward}:r.forward});}
  return[...byKey.values()].sort((a,b)=>timestampMs(a)-timestampMs(b));
}

export function normalizeLedgerRecords(records=[],asOfValue=new Date()){
  const asOfSession=marketObservationSessionDay(asOfValue);
  return mergeLedgerRecords(records).map(raw=>{
    const r={...raw,forward:raw.forward?{...raw.forward}:{}};
    const session=sessionFor(r);if(session){r.day=session;if(r.recordType==='state')r.sessionDay=session;}
    if(r.recordType!=='state'&&['Buy','Strong Buy'].includes(r.action)&&session&&asOfSession){
      const age=marketSessionDistance(session,asOfSession);
      if(Number.isFinite(age)){
        for(const key of Object.keys(r.forward||{}))if(Number(key)>age)delete r.forward[key];
        r.daysObserved=age;
      }
    }
    return r;
  });
}

export function applyPerformanceObservation(records=[],rows=[],nowValue=new Date()){
  const candidate=nowValue instanceof Date?nowValue:new Date(nowValue),now=Number.isFinite(candidate.getTime())?candidate:new Date(),nowIso=now.toISOString(),today=marketObservationSessionDay(now);
  let next=normalizeLedgerRecords(records,now);
  for(const s of rows||[]){
    const symbol=String(s?.symbol||s?.ticker||'').toUpperCase(),action=s?.finalDecision?.action||s?.recommendation?.displayLabel||s?.action,price=n(s?.price??s?.currentPrice);if(!symbol||!price||!today)continue;
    const metrics=s.expertDecision?.metrics||s.recommendation?.expertDecision?.metrics||{},fundamentalStatus=String(s.fundamentalDataStatus||s.recommendation?.fundamentalDataStatus||'').toLowerCase(),eventRisk=s.eventRisk||s.preTradeCheck||s.recommendation?.eventRisk||{},entryTiming=s.entryTiming||s.recommendation?.entryTiming||{},verificationPaused=Boolean(s.dataFeedSnapshotStale||['deferred','unavailable','partial','unverified'].includes(fundamentalStatus)||metrics.fundamentalsPass===false||metrics.quoteFreshnessPass===false||entryTiming.available===false||(eventRisk.manualCheckRequired===true&&eventRisk.checkComplete===false));
    for(const r of next.filter(x=>x.symbol===symbol&&x.recordType!=='state'&&['Buy','Strong Buy'].includes(x.action))){
      const age=marketSessionDistance(r.day,today);if(!Number.isFinite(age))continue;
      const mark=(price/r.price-1)*100;r.forward=r.forward||{};
      for(const d of PERFORMANCE_HORIZONS)if(age>=d&&r.forward[d]==null)r.forward[d]=mark;
      r.pathMaePct=Number.isFinite(r.pathMaePct)?Math.min(r.pathMaePct,mark):Math.min(0,mark);
      r.pathMfePct=Number.isFinite(r.pathMfePct)?Math.max(r.pathMfePct,mark):Math.max(0,mark);
      r.lastMarkPct=mark;r.lastMarkAt=nowIso;r.daysObserved=age;
    }
    if(!verificationPaused&&['Buy','Strong Buy'].includes(action)&&!next.some(r=>r.recordType!=='state'&&r.symbol===symbol&&r.day===today&&r.action===action))next.push({id:`${today}:${symbol}:${action}`,recordType:'signal',sessionBasis:PERFORMANCE_SESSION_BASIS,day:today,timestamp:nowIso,symbol,action,price,theme:s.primaryTheme||s.theme||'Other',source:s.signalSource||s.tradeSource||'screener',capitalScore:n(s.finalDecision?.relativeCapitalScore??s.capitalScore),tradeSetupScore:n(s.tradeSetupScore),entryQuality:s.recommendation?.entryQualityLabel||s.technicalSnapshot?.entryQualityLabel||null,dayChangePct:n(s.dayChangePct),vs50:n(s.expertDecision?.metrics?.vs50??s.recommendation?.expertDecision?.metrics?.vs50),extension:n(s.expertDecision?.metrics?.extension??s.recommendation?.expertDecision?.metrics?.extension),pathMaePct:0,pathMfePct:0,lastMarkPct:0,lastMarkAt:nowIso,daysObserved:0,forward:{}});
    const systemPaused=verificationPaused&&['Watch','Buy','Strong Buy'].includes(action),stateAction=systemPaused?'Paused':action;
    const stateRows=next.filter(r=>r.recordType==='state'&&r.signalState===true&&r.symbol===symbol).sort((a,b)=>timestampMs(a)-timestampMs(b)),lastState=stateRows.at(-1),lastSessionDay=lastState?sessionFor(lastState):null,actionable=['Buy','Strong Buy'].includes(stateAction),dailyConfirmation=actionable&&lastSessionDay!==today;
    if(['Strong Buy','Buy','Watch','Avoid','Paused'].includes(stateAction)&&(!lastState||lastState.action!==stateAction||dailyConfirmation))next.push({id:`state:${nowIso}:${symbol}:${stateAction}`,recordType:'state',signalState:true,sessionBasis:PERFORMANCE_SESSION_BASIS,day:today,sessionDay:today,timestamp:nowIso,symbol,action:stateAction,observedAction:action,price,theme:s.primaryTheme||s.theme||'Other',source:'screener-state',pauseReason:systemPaused?'Required market/fundamental data is temporarily incomplete.':null});
  }
  return normalizeLedgerRecords(next,now).slice(-10000);
}

export function summarizePerformance(records=[]){
  // Calendar-day observations created before this basis was introduced cannot
  // be repaired honestly after the fact. Exclude them from reported efficacy
  // instead of presenting contaminated one-/two-day returns as market-session
  // results. They remain in the ledger as an audit trail.
  const allEntries=records.filter(r=>r.recordType!=='state'&&['Buy','Strong Buy'].includes(r.action)&&r.source!=='user'),entries=allEntries.filter(r=>r.sessionBasis===PERFORMANCE_SESSION_BASIS),byAction={};
  for(const action of['Buy','Strong Buy']){
    const a=entries.filter(r=>r.action===action);byAction[action]={signals:a.length};
    for(const d of PERFORMANCE_HORIZONS){const vals=a.map(r=>r.forward?.[d]).filter(Number.isFinite);byAction[action][`d${d}`]={observations:vals.length,avgReturnPct:vals.length?vals.reduce((x,y)=>x+y,0)/vals.length:null,winRatePct:vals.length?vals.filter(x=>x>0).length/vals.length*100:null};}
    const mae=a.map(r=>r.pathMaePct).filter(Number.isFinite),mfe=a.map(r=>r.pathMfePct).filter(Number.isFinite);byAction[action].path={observations:Math.min(mae.length,mfe.length),avgMaePct:mae.length?mae.reduce((x,y)=>x+y,0)/mae.length:null,avgMfePct:mfe.length?mfe.reduce((x,y)=>x+y,0)/mfe.length:null,immediateAdverseRatePct:mae.length?mae.filter(x=>x<=-2).length/mae.length*100:null};
  }
  return{signals:entries.length,excludedLegacySignals:allEntries.length-entries.length,uniqueSymbols:new Set(entries.map(r=>r.symbol)).size,uniqueThemes:new Set(entries.map(r=>r.theme).filter(Boolean)).size,sessionBasis:PERFORMANCE_SESSION_BASIS,byAction};
}
