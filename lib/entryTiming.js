// Historical entry-timing engine. Stock quality and entry timing are deliberately separate.
// Fresh capital must pass this layer after quality qualification; quality never overrides a bad entry.

const CACHE_KEY='__entryTimingCacheV3',INFLIGHT_KEY='__entryTimingInflightV2',COOLDOWN_KEY='__entryTimingCooldownUntilV1',TTL_MS=4*60*60*1000,STALE_MS=2*24*60*60*1000;
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
  const now=new Date(),from=new Date(now);from.setUTCDate(from.getUTCDate()-90);const clean=fmp(symbol);
  // Stable endpoint only. Retired v3 fallbacks created request storms and 403s.
  const url=`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${encodeURIComponent(clean)}&from=${iso(from)}&to=${iso(now)}&apikey=${key}`;
  const rows=parseRows(await fetchJson(url));
  if(rows.length<30)return{symbol:norm(symbol),available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Daily price history is unavailable; fresh capital is paused rather than guessed.'};
  return analyze(symbol,rows);
}

export function analyzeEntryTiming(symbol,rows=[]){return analyze(symbol,rows);}
function analyze(symbol,rows){
  const c=rows.map(x=>x.close),last=c[c.length-1],prev=i=>c[c.length-1-i]||null,ret3=pct(last,prev(3)),ret5=pct(last,prev(5)),ret10=pct(last,prev(10));
  const sma20=mean(c.slice(-20)),sma20Prev=mean(c.slice(-25,-5)),sma20Slope=sma20&&sma20Prev?pct(sma20,sma20Prev):null;
  const e12=ema(c,12),e26=ema(c,26),macd=e12.map((v,i)=>v-(e26[i]??v)),sig=ema(macd,9),hist=macd.map((v,i)=>v-(sig[i]??v)),macdHist=hist.at(-1),macdHistPrev=hist.at(-2),macdImproving=macdHistPrev!==undefined&&macdHist>macdHistPrev;
  const rsi14=rsi(c,14),low10=Math.min(...rows.slice(-10).map(x=>x.low||x.close)),high20=Math.max(...rows.slice(-20).map(x=>x.high||x.close)),prevHigh20=Math.max(...rows.slice(-21,-1).map(x=>x.high||x.close)),rebound10=pct(last,low10),belowHigh20=high20>0?(last/high20-1)*100:null;
  const avgVol20=mean(rows.slice(-21,-1).map(x=>x.volume).filter(x=>x>0)),lastVol=rows.at(-1)?.volume||0,volumeBreakout=last>prevHigh20&&avgVol20>0&&lastVol>=avgVol20*1.2;
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
  return{symbol:norm(symbol),available:true,pass,strongPass,status,reason,ret3,ret5,ret10,sma20,sma20Slope,macdHist,macdImproving,rsi14,rebound10,belowHigh20,volumeBreakout,chase,fallingKnife,lateBounce,momentumConflict,shortTermTechnicalScore,asOf:rows.at(-1)?.date||null};
}

async function getOneResilient(symbol,key,store,now){
  const pending=inflight();if(pending.has(symbol))return pending.get(symbol);const stale=store.get(symbol);
  const p=(async()=>{try{
    if(Date.now()<cooldownUntil()){if(stale&&now-stale.ts<STALE_MS)return{...stale.data,staleFallback:true};return{symbol,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Market-data provider is temporarily rate-limited; fresh capital is paused.'};}
    const data=await fetchOne(symbol,key);if(data?.available)store.set(symbol,{ts:Date.now(),data});else if(stale&&now-stale.ts<STALE_MS)return{...stale.data,staleFallback:true};return data;
  }catch(e){if(stale&&now-stale.ts<STALE_MS)return{...stale.data,staleFallback:true};return{symbol,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Daily price history could not be verified; fresh capital is paused.'};}finally{pending.delete(symbol);}})();pending.set(symbol,p);return p;
}
export async function fetchEntryTimingMap(symbols=[]){
  const key=process.env.FMP_API_KEY,out=new Map(),store=cache(),unique=[...new Set(symbols.map(norm).filter(Boolean))],now=Date.now();
  if(!key){for(const s of unique)out.set(s,{symbol:s,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Market-data key unavailable; fresh capital is paused.'});return out;}
  const missing=[];for(const s of unique){const hit=store.get(s);if(hit&&now-hit.ts<TTL_MS)out.set(s,hit.data);else missing.push(s);}
  let i=0;async function worker(){for(;;){const idx=i++;if(idx>=missing.length)return;const s=missing[idx],data=await getOneResilient(s,key,store,now);out.set(s,data);}}
  await Promise.all(Array.from({length:Math.min(1,missing.length)},()=>worker()));return out;
}

export function applyEntryTimingGate(stock={},timing=null){
  const t=timing||stock.entryTiming;if(!t)return stock;const rec=stock.recommendation&&typeof stock.recommendation==='object'?stock.recommendation:{},current=String(rec.displayLabel||rec.label||stock.action||'Avoid');let action=current;
  if(['Strong Buy','Buy'].includes(current)){if(!t.available||!t.pass)action='Watch';else if(current==='Strong Buy'&&!t.strongPass)action='Watch';}
  const downgraded=action!==current,partialTiming=t.available&&t.pass&&!t.strongPass,suppressHigherTrigger=downgraded||partialTiming,why=downgraded?t.reason:(rec.decisionWhy||rec.actionSummary||t.reason),e=rec.expertDecision&&typeof rec.expertDecision==='object'?rec.expertDecision:null,failures=e&&downgraded?[why,...(Array.isArray(e.failures)?e.failures:[])]:e?.failures;
  const expertDecision=e&&downgraded?{...e,action:'Watch',timing:'Wait for Reset',size:'None',decisionWhy:why,buyPass:false,strongBuyPass:false,partialBuyPass:false,fullBuyPass:false,failures,trendStatus:'Not Confirmed',capitalView:'Wait',historicalTimingPass:false,historicalTimingStrongPass:false}:e?{...e,historicalTimingPass:Boolean(t.pass),historicalTimingStrongPass:Boolean(t.strongPass)}:e;
  const oldPlan=stock.riskPlan??rec.riskPlan??null;
  // A timing rejection or only-partial timing confirmation must never leave a mechanical "buy higher" trigger behind.
  const updatedPlan=suppressHigherTrigger&&oldPlan?{...oldPlan,addAbovePrice:null,summary:downgraded?`No fresh entry. ${t.reason}`:'No full-size entry until short-term timing fully confirms.'}:oldPlan;
  const entryNote=downgraded?`Do not initiate here. ${t.reason}`:partialTiming?'Timing is only partially confirmed. Do not add merely because price moves higher; require full short-term confirmation first.':rec.entryNote;
  const triggerNeeded=downgraded?(t.chase?'Wait for a controlled pullback or consolidation, then require the timing gate to reconfirm.':'Wait for the short-term timing gate to reset and reconfirm before deploying capital.'):partialTiming?'Require full short-term timing confirmation; a higher price alone is not a trigger.':rec.triggerNeeded;
  const recommendation={...rec,label:action,displayLabel:action,recommendation:action,tradeAction:action,decisionTiming:action==='Strong Buy'||action==='Buy'?'Now':'Wait for Reset',positionSize:action==='Strong Buy'?'Full':action==='Buy'?'Partial':'None',decisionWhy:why,actionSummary:why,reason:downgraded?why:rec.reason,entryNote,triggerNeeded,blockedBuyNow:downgraded?true:rec.blockedBuyNow,blockedReason:downgraded?why:rec.blockedReason,capitalView:downgraded?'Wait':rec.capitalView,entryTiming:t,expertDecision,riskPlan:updatedPlan};
  return{...stock,entryTiming:t,action,recommendation,expertDecision:expertDecision||stock.expertDecision,riskPlan:updatedPlan||stock.riskPlan};
}
