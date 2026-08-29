// Historical entry-timing engine. Stock quality and entry timing are deliberately separate.
// Fresh capital must pass this layer after quality qualification; quality never overrides a bad entry.

import {latestCompletedMarketSessionDay} from './marketSession';

const CACHE_KEY='__entryTimingCacheV3',INFLIGHT_KEY='__entryTimingInflightV2',COOLDOWN_KEY='__entryTimingCooldownUntilV1',TTL_MS=4*60*60*1000,STALE_MS=2*24*60*60*1000,LIQUIDITY_LOOKBACK_SESSIONS=20,MIN_LIQUIDITY_SESSIONS=15,MIN_AVG_DOLLAR_VOLUME=10_000_000;
const n=(v,f=null)=>{const x=Number(v);return Number.isFinite(x)?x:f};
const norm=s=>String(s||'').replace('-','.').toUpperCase().trim();
const fmp=s=>String(s||'').replace('.','-').toUpperCase().trim();
const pct=(a,b)=>a>0&&b>0?(a/b-1)*100:null;
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function cache(){if(!globalThis[CACHE_KEY])globalThis[CACHE_KEY]=new Map();return globalThis[CACHE_KEY];}
function inflight(){if(!globalThis[INFLIGHT_KEY])globalThis[INFLIGHT_KEY]=new Map();return globalThis[INFLIGHT_KEY];}
function cooldownUntil(){return Number(globalThis[COOLDOWN_KEY]||0);}
function setCooldown(ms){globalThis[COOLDOWN_KEY]=Math.max(cooldownUntil(),Date.now()+ms);}
function iso(d){return d.toISOString().slice(0,10);}
function ema(values,period){if(!values.length)return[];const k=2/(period+1),out=[values[0]];for(let i=1;i<values.length;i++)out.push(values[i]*k+out[i-1]*(1-k));return out;}
function rsi(values,period=14){if(values.length<=period)return null;let gains=0,losses=0;for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gains+=d;else losses-=d;}let ag=gains/period,al=losses/period;for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1],g=Math.max(0,d),l=Math.max(0,-d);ag=(ag*(period-1)+g)/period;al=(al*(period-1)+l)/period;}if(al===0)return 100;return 100-(100/(1+ag/al));}
function parseRows(data){const rows=Array.isArray(data)?data:Array.isArray(data?.historical)?data.historical:[];return rows.map(x=>({date:String(x.date||'').slice(0,10),open:n(x.open),high:n(x.high),low:n(x.low),close:n(x.close??x.price),volume:n(x.volume,0)})).filter(x=>x.date&&x.close>0).sort((a,b)=>a.date.localeCompare(b.date));}

async function fetchJson(url){
  if(Date.now()<cooldownUntil()){const e=new Error('history feed cooldown');e.status=429;throw e;}
  let last=null;
  for(let attempt=0;attempt<2;attempt++){
    const c=new AbortController(),t=setTimeout(()=>c.abort(),6500);
    try{
      const r=await fetch(url,{signal:c.signal});
      if(r.ok)return await r.json();
      const e=new Error(`history ${r.status}`);e.status=r.status;
      if(r.status===429){const retryAfter=Number(r.headers.get('retry-after'));setCooldown(Number.isFinite(retryAfter)&&retryAfter>0?Math.max(30000,retryAfter*1000):60000);throw e;}
      if(r.status===402||r.status===403){setCooldown(5*60*1000);throw e;}
      if(r.status<500)throw e;
      last=e;
    }catch(e){last=e;if([402,403,429].includes(e?.status))throw e;if(attempt===0)await sleep(400);}finally{clearTimeout(t);}
  }
  throw last||new Error('history request failed');
}

async function fetchOne(symbol,key){
  const now=new Date(),from=new Date(now);from.setUTCDate(from.getUTCDate()-220);const clean=fmp(symbol);
  // Stable endpoint only. Retired v3 fallbacks created request storms and 403s.
  const url=`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(clean)}&from=${iso(from)}&to=${iso(now)}&apikey=${key}`;
  const rows=parseRows(await fetchJson(url));
  if(rows.length<30)return{data:{symbol:norm(symbol),available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Daily price history is unavailable; fresh capital is paused rather than guessed.'},rows};
  return{data:analyze(symbol,rows),rows};
}

export function analyzeEntryTiming(symbol,rows=[]){return analyze(symbol,rows);}
function trailingReturn(rows,sessions){
  if(!Array.isArray(rows)||rows.length<=sessions)return null;
  const last=n(rows.at(-1)?.close),prior=n(rows.at(-(sessions+1))?.close);
  return last>0&&prior>0?(last/prior-1)*100:null;
}
function movingAverage(rows,sessions){return mean((rows||[]).slice(-sessions).map(x=>n(x?.close)).filter(x=>x>0));}
export function attachRelativeStrengthContext(timing={},stockRows=[],spyRows=[],qqqRows=[]){
  const stockReturn20=trailingReturn(stockRows,20),stockReturn60=trailingReturn(stockRows,60),stockReturn120=trailingReturn(stockRows,120);
  const spyReturn20=trailingReturn(spyRows,20),spyReturn60=trailingReturn(spyRows,60),spyReturn120=trailingReturn(spyRows,120);
  const qqqReturn20=trailingReturn(qqqRows,20),qqqReturn60=trailingReturn(qqqRows,60),qqqReturn120=trailingReturn(qqqRows,120);
  const alpha=(stock,benchmark)=>Number.isFinite(stock)&&Number.isFinite(benchmark)?stock-benchmark:null;
  const spyClose=n(spyRows.at(-1)?.close),spySma50=movingAverage(spyRows,50),spySma200=movingAverage(spyRows,200);
  const benchmarkRegime=spyClose>0&&spySma50>0&&spySma200>0
    ?spyClose>=spySma50&&spySma50>=spySma200?'bullish'
      :spyClose<spySma200&&spySma50<spySma200?'defensive':'mixed'
    :'unknown';
  return{...timing,stockReturn20,stockReturn60,stockReturn120,spyReturn20,spyReturn60,spyReturn120,qqqReturn20,qqqReturn60,qqqReturn120,alpha20VsSpy:alpha(stockReturn20,spyReturn20),alpha60VsSpy:alpha(stockReturn60,spyReturn60),alpha120VsSpy:alpha(stockReturn120,spyReturn120),alpha20VsQqq:alpha(stockReturn20,qqqReturn20),alpha60VsQqq:alpha(stockReturn60,qqqReturn60),alpha120VsQqq:alpha(stockReturn120,qqqReturn120),benchmarkRegime,spyClose,spySma50,spySma200,relativeStrengthVerified:Number.isFinite(stockReturn60)&&Number.isFinite(spyReturn60)&&Number.isFinite(qqqReturn60)};
}
function analyze(symbol,rows){
  const c=rows.map(x=>x.close),last=c[c.length-1],prev=i=>c[c.length-1-i]||null,ret3=pct(last,prev(3)),ret5=pct(last,prev(5)),ret10=pct(last,prev(10));
  const sma20=mean(c.slice(-20)),sma20Prev=mean(c.slice(-25,-5)),sma20Slope=sma20&&sma20Prev?pct(sma20,sma20Prev):null;
  const e12=ema(c,12),e26=ema(c,26),macd=e12.map((v,i)=>v-(e26[i]??v)),sig=ema(macd,9),hist=macd.map((v,i)=>v-(sig[i]??v)),macdHist=hist.at(-1),macdHistPrev=hist.at(-2),macdImproving=macdHistPrev!==undefined&&macdHist>macdHistPrev;
  const rsi14=rsi(c,14),low10=Math.min(...rows.slice(-10).map(x=>x.low||x.close)),high20=Math.max(...rows.slice(-20).map(x=>x.high||x.close)),prevHigh20=Math.max(...rows.slice(-21,-1).map(x=>x.high||x.close)),rebound10=pct(last,low10),belowHigh20=high20>0?(last/high20-1)*100:null;
  const priorVolumeRows=rows.slice(-21,-1).filter(x=>x.volume>0),avgVol20=mean(priorVolumeRows.map(x=>x.volume)),lastVol=rows.at(-1)?.volume||0,volumeBreakout=last>prevHigh20&&avgVol20>0&&lastVol>=avgVol20*1.2;
  const liquidityRows=rows.slice(-LIQUIDITY_LOOKBACK_SESSIONS).filter(x=>x.close>0&&x.volume>0),liquiditySessions=liquidityRows.length,averageVolume20=mean(liquidityRows.map(x=>x.volume)),averageDollarVolume20=mean(liquidityRows.map(x=>x.close*x.volume)),liquidityVerified=liquiditySessions>=MIN_LIQUIDITY_SESSIONS&&Number.isFinite(averageDollarVolume20),liquidityPass=liquidityVerified&&averageDollarVolume20>=MIN_AVG_DOLLAR_VOLUME;
  const chase=(ret3!==null&&ret3>=5.5)||(ret5!==null&&ret5>=6.5)||(ret10!==null&&ret10>=11)||(rebound10!==null&&rebound10>=9&&ret5!==null&&ret5>=4.5);
  const fallingKnife=(ret5!==null&&ret5<=-7)||(last<sma20&&macdHist<0&&!macdImproving&&rsi14!==null&&rsi14<42);
  const lateBounce=!volumeBreakout&&rebound10!==null&&rebound10>=7&&macdHist<0;
  const momentumConflict=macdHist<0&&!macdImproving&&rsi14!==null&&rsi14<55;
  const pass=!chase&&!fallingKnife&&!lateBounce&&!momentumConflict;
  const strongPass=pass&&(volumeBreakout||(macdHist>=0&&macdImproving))&&rsi14!==null&&rsi14>=48&&rsi14<=72&&last>=sma20&&(ret5===null||ret5<=5.0)&&(sma20Slope===null||sma20Slope>=-1);
  let status=strongPass?'Confirmed Entry':pass?'Starter / Partial Only':'Wait for Reset',reason='';
  if(chase)reason=`Recent price path is already too extended for fresh capital (${ret3?.toFixed(1)??'—'}% 3-day, ${ret5?.toFixed(1)??'—'}% 5-day).`;
  else if(lateBounce)reason=`Price has rebounded ${rebound10.toFixed(1)}% from the 10-day low while MACD remains below signal; wait for consolidation or confirmation.`;
  else if(fallingKnife)reason='Short-term price structure is still deteriorating; do not buy simply because the longer-term trend remains intact.';
  else if(momentumConflict)reason='MACD/RSI confirmation is not yet strong enough for fresh capital.';
  else if(!strongPass)reason='Entry timing is improving, but it has not earned full-size deployment; starter/partial size only.';
  else reason=volumeBreakout?'Fresh breakout is confirmed by price and volume.':'Short-term trend, MACD and RSI are aligned without a chase condition.';
  const shortTermTechnicalScore=Math.max(0,Math.min(100,Math.round((pass?60:30)+(strongPass?25:0)+(macdImproving?8:-5)+(last>=sma20?5:-5)+(rsi14>=48&&rsi14<=70?5:-3))));
  return{symbol:norm(symbol),available:true,pass,strongPass,status,reason,ret3,ret5,ret10,sma20,sma20Slope,macdHist,macdImproving,rsi14,rebound10,belowHigh20,volumeBreakout,chase,fallingKnife,lateBounce,momentumConflict,shortTermTechnicalScore,liquidityLookbackSessions:LIQUIDITY_LOOKBACK_SESSIONS,liquiditySessions,averageVolume20,averageDollarVolume20,liquidityThreshold:MIN_AVG_DOLLAR_VOLUME,liquidityVerified,liquidityPass,asOf:rows.at(-1)?.date||null};
}

async function getOneResilient(symbol,key,store,now){
  const pending=inflight();if(pending.has(symbol))return pending.get(symbol);const stale=store.get(symbol);
  const p=(async()=>{try{
    if(Date.now()<cooldownUntil()){if(stale&&now-stale.ts<STALE_MS)return{...stale.data,staleFallback:true};return{symbol,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Market-data provider is temporarily rate-limited; fresh capital is paused.'};}
    const fetched=await fetchOne(symbol,key),data=fetched?.data||fetched;if(data?.available)store.set(symbol,{ts:Date.now(),data,rows:fetched?.rows||[]});else if(stale&&now-stale.ts<STALE_MS)return{...stale.data,staleFallback:true};return data;
  }catch(e){if(stale&&now-stale.ts<STALE_MS)return{...stale.data,staleFallback:true};return{symbol,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Daily price history could not be verified; fresh capital is paused.'};}finally{pending.delete(symbol);}})();pending.set(symbol,p);return p;
}
export async function fetchEntryTimingMap(symbols=[]){
  const key=process.env.FMP_API_KEY,out=new Map(),store=cache(),requested=[...new Set(symbols.map(norm).filter(Boolean))],unique=[...new Set([...requested,'SPY','QQQ'])],now=Date.now();
  if(!key){for(const s of requested)out.set(s,{symbol:s,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Market-data key unavailable; fresh capital is paused.'});return out;}
  const missing=[];for(const s of unique){const hit=store.get(s);if(hit&&now-hit.ts<TTL_MS)out.set(s,hit.data);else missing.push(s);}
  let i=0;async function worker(){for(;;){const idx=i++;if(idx>=missing.length)return;const s=missing[idx],data=await getOneResilient(s,key,store,now);out.set(s,data);}}
  await Promise.all(Array.from({length:Math.min(1,missing.length)},()=>worker()));
  const spyRows=store.get('SPY')?.rows||[],qqqRows=store.get('QQQ')?.rows||[];
  const result=new Map();for(const s of requested){const timing=out.get(s),rows=store.get(s)?.rows||[];result.set(s,timing?.available?attachRelativeStrengthContext(timing,rows,spyRows,qqqRows):timing);}return result;
}

export function applyEntryTimingGate(stock={},timing=null,now=new Date()){
  const supplied=timing||stock.entryTiming;if(!supplied)return stock;
  const requiredAsOf=latestCompletedMarketSessionDay(now),staleAsOf=Boolean(supplied.available&&supplied.asOf&&requiredAsOf&&supplied.asOf<requiredAsOf),baseTiming=staleAsOf?{...supplied,available:false,pass:false,strongPass:false,status:'Historical timing verification stale',reason:`Daily timing is only verified through ${supplied.asOf}; the latest completed U.S. market session is ${requiredAsOf}. Fresh capital is paused until history catches up.`,staleVerification:true,requiredAsOf}:supplied;
  const liquiditySessions=Number(baseTiming.liquiditySessions)||0,averageDollarVolume20=Number(baseTiming.averageDollarVolume20),liquidityVerified=Boolean(baseTiming.available&&liquiditySessions>=MIN_LIQUIDITY_SESSIONS&&Number.isFinite(averageDollarVolume20)),liquidityPass=Boolean(liquidityVerified&&averageDollarVolume20>=MIN_AVG_DOLLAR_VOLUME);
  const money=(value)=>Number.isFinite(value)?`$${(value/1_000_000).toFixed(1)}M`:'unavailable',liquidityReason=!liquidityVerified?'Trailing 20-session dollar-liquidity verification is incomplete; fresh capital is paused.':!liquidityPass?`Trailing ${liquiditySessions}-session average dollar volume is ${money(averageDollarVolume20)}, below the ${money(MIN_AVG_DOLLAR_VOLUME)} fresh-capital floor.`:'';
  const t={...baseTiming,liquiditySessions,averageDollarVolume20:Number.isFinite(averageDollarVolume20)?averageDollarVolume20:null,liquidityThreshold:MIN_AVG_DOLLAR_VOLUME,liquidityVerified,liquidityPass};
  const rec=stock.recommendation&&typeof stock.recommendation==='object'?stock.recommendation:{},current=String(rec.displayLabel||rec.label||stock.action||'Avoid');let action=current;
  const relativeOverheated=Boolean(t.relativeStrengthVerified&&Number.isFinite(Number(t.alpha20VsSpy))&&Number(t.alpha20VsSpy)>4),relativeReason=relativeOverheated?`The stock has outpaced SPY by ${Number(t.alpha20VsSpy).toFixed(1)} percentage points over 20 sessions; wait for a controlled pullback or consolidation rather than chase relative extension.`:'';
  const timingBlocked=!t.available||!t.pass||relativeOverheated,blocked=timingBlocked||!liquidityPass,blockReason=relativeOverheated?relativeReason:timingBlocked?t.reason:liquidityReason;
  if(['Strong Buy','Buy'].includes(current)){if(blocked)action='Watch';else if(current==='Strong Buy'&&!t.strongPass)action='Buy';}
  const downgraded=action!==current,partialTiming=!blocked&&t.available&&t.pass&&!t.strongPass,suppressHigherTrigger=blocked||partialTiming,why=blocked?blockReason:partialTiming?t.reason:(rec.decisionWhy||rec.actionSummary||t.reason),e=rec.expertDecision&&typeof rec.expertDecision==='object'?rec.expertDecision:null,failures=e&&blocked?[why,...(Array.isArray(e.failures)?e.failures:[])]:e?.failures;
  const expertDecision=e&&blocked?{...e,action:'Watch',timing:timingBlocked?'Wait for Reset':'Wait',size:'None',decisionWhy:why,buyPass:false,strongBuyPass:false,partialBuyPass:false,fullBuyPass:false,failures,trendStatus:timingBlocked?'Not Confirmed':e.trendStatus,capitalView:'Wait',historicalTimingPass:Boolean(t.available&&t.pass),historicalTimingStrongPass:false,liquidityPass:false}:e&&partialTiming?{...e,action:'Buy',timing:'Now',size:'Partial',decisionWhy:why,strongBuyPass:false,fullBuyPass:false,historicalTimingPass:true,historicalTimingStrongPass:false,liquidityPass:true}:e?{...e,historicalTimingPass:Boolean(t.pass),historicalTimingStrongPass:Boolean(t.strongPass),liquidityPass:true}:e;
  const oldPlan=stock.riskPlan??rec.riskPlan??null;
  // A timing rejection or only-partial timing confirmation must never leave a mechanical "buy higher" trigger behind.
  const updatedPlan=suppressHigherTrigger&&oldPlan?{...oldPlan,addAbovePrice:null,summary:blocked?`No fresh entry. ${why}`:'Partial-size entry only until short-term timing fully confirms.'}:oldPlan;
  const entryNote=blocked?`Do not initiate here. ${why}`:partialTiming?'Timing supports only a partial entry. Do not add merely because price moves higher; require full short-term confirmation first.':rec.entryNote;
  const triggerNeeded=blocked?(timingBlocked?((t.chase||relativeOverheated)?'Wait for a controlled pullback or consolidation, then require the timing gate to reconfirm.':'Wait for the short-term timing gate to reset and reconfirm before deploying capital.'):'Reassess only after trailing dollar liquidity clears the fresh-capital floor.'):partialTiming?'Require full short-term timing confirmation before increasing size; a higher price alone is not a trigger.':rec.triggerNeeded;
  const recommendation={...rec,label:action,displayLabel:action,recommendation:action,tradeAction:action,decisionTiming:action==='Strong Buy'||action==='Buy'?'Now':'Wait for Reset',positionSize:action==='Strong Buy'?'Full':action==='Buy'?'Partial':'None',decisionWhy:why,actionSummary:why,reason:downgraded?why:rec.reason,entryNote,triggerNeeded,blockedBuyNow:blocked?true:rec.blockedBuyNow,blockedReason:blocked?why:rec.blockedReason,capitalView:blocked?'Wait':rec.capitalView,entryTiming:t,expertDecision,riskPlan:updatedPlan};
  return{...stock,entryTiming:t,action,recommendation,expertDecision:expertDecision||stock.expertDecision,riskPlan:updatedPlan||stock.riskPlan};
}
