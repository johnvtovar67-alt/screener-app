import {useEffect,useState} from "react";
import "../styles/card-layout.css";

const CANONICAL_HOST="screener-app-cq5t.vercel.app";
const LEGACY_HOSTS=new Set([
  "screener-app-nu.vercel.app",
  "screener-app-johnvtovar67-7543s-projects.vercel.app",
  "screener-app-git-main-johnvtovar67-7543s-projects.vercel.app",
  "screener-app-us7z.vercel.app",
  "screener-app-us7z-johnvtovar67-7543s-projects.vercel.app",
  "screener-app-us7z-git-main-johnvtovar67-7543s-projects.vercel.app",
  "screener-app-hp1w.vercel.app",
  "screener-app-hp1w-johnvtovar67-7543s-projects.vercel.app",
  "screener-app-hp1w-git-main-johnvtovar67-7543s-projects.vercel.app"
]);
const CAPITAL_NOTE="Capital actions reflect portfolio fit, not raw opportunity rank. A higher-ranked Buy can be skipped when concentration, correlation, position-size, timing, or risk-budget constraints make cash or another qualified target the better incremental use of capital.";
const API_TIMEOUT_MS=10000;
const API_RETRIES=0;
const TOP5_FRESH_MS=2*60*1000;
const TOP5_STALE_MS=30*60*1000;
const TOP5_CACHE_PREFIX="screener_top5_response_v2:";

function emitFeedNotice(message=""){try{window.dispatchEvent(new CustomEvent("screener-feed-notice",{detail:message}));}catch{}}
function readTop5Cache(key){try{const raw=window.localStorage.getItem(TOP5_CACHE_PREFIX+key);const x=raw?JSON.parse(raw):null;return x&&typeof x.body==="string"?x:null;}catch{return null;}}
function writeTop5Cache(key,body){try{window.localStorage.setItem(TOP5_CACHE_PREFIX+key,JSON.stringify({ts:Date.now(),body}));}catch{}}
function cachedResponse(hit,stale=false){return new Response(hit.body,{status:200,headers:{"content-type":"application/json; charset=utf-8","x-screener-cache":stale?"stale":"fresh"}});}

function installResilientApiFetch(){
  if(typeof window==="undefined"||window.__screenerResilientFetchInstalled)return;
  const nativeFetch=window.fetch.bind(window),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const inflight=new Map();
  window.fetch=async function resilientFetch(input,init={}){
    let url;try{url=new URL(typeof input==="string"?input:input?.url,window.location.href);}catch{return nativeFetch(input,init);}
    const method=String(init?.method||(typeof input!=="string"&&input?.method)||"GET").toUpperCase(),sameOrigin=url.origin===window.location.origin,resilient=sameOrigin&&url.pathname.startsWith("/api/")&&method==="GET";
    if(!resilient)return nativeFetch(input,init);

    const isTop5=url.pathname==="/api/top5",cacheKey=isTop5?`${url.pathname}${url.search}`:"",hit=isTop5?readTop5Cache(cacheKey):null,age=hit?Date.now()-Number(hit.ts||0):Infinity;
    if(hit&&age<TOP5_FRESH_MS){emitFeedNotice("");return cachedResponse(hit,false);}
    if(isTop5&&inflight.has(cacheKey)){const r=await inflight.get(cacheKey);return r.clone();}

    const run=async()=>{
      let lastError=null,lastResponse=null;
      for(let attempt=0;attempt<=API_RETRIES;attempt++){
        const controller=new AbortController(),parentSignal=init?.signal,onAbort=()=>controller.abort(parentSignal?.reason);
        if(parentSignal){if(parentSignal.aborted)controller.abort(parentSignal.reason);else parentSignal.addEventListener("abort",onAbort,{once:true});}
        const timer=setTimeout(()=>controller.abort(new DOMException("API request timed out","TimeoutError")),API_TIMEOUT_MS);
        try{
          const response=await nativeFetch(input,{...init,signal:controller.signal});lastResponse=response;
          clearTimeout(timer);if(parentSignal)parentSignal.removeEventListener("abort",onAbort);
          if(response.ok){
            if(isTop5){const body=await response.text();writeTop5Cache(cacheKey,body);emitFeedNotice("");return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});}
            return response;
          }
          if([402,403,429].includes(response.status))break;
          if(attempt<API_RETRIES&&response.status>=500){await wait(500);continue;}
          return response;
        }catch(error){
          clearTimeout(timer);if(parentSignal)parentSignal.removeEventListener("abort",onAbort);if(parentSignal?.aborted)throw error;lastError=error;if(attempt<API_RETRIES){await wait(450);continue;}
        }
      }
      if(isTop5&&hit&&age<TOP5_STALE_MS){emitFeedNotice("Live FMP refresh is delayed; showing the last verified screener snapshot while the feed recovers.");return cachedResponse(hit,true);}
      if(lastResponse)return lastResponse;
      const timeout=lastError?.name==="AbortError"||lastError?.name==="TimeoutError";
      throw new Error(timeout?"Live refresh timed out. The app stopped the request instead of hanging; use Portfolio, Themes, or Single while the provider recovers.":`Live refresh failed${lastError?.message?`: ${lastError.message}`:"."}`);
    };

    if(isTop5){const p=run().finally(()=>inflight.delete(cacheKey));inflight.set(cacheKey,p);const r=await p;return r.clone();}
    return run();
  };
  window.__screenerResilientFetchInstalled=true;
}

function sentenceCase(text=""){const t=String(text||"").trim();return t?t[0].toUpperCase()+t.slice(1):t;}
function cleanDashboardText(){
  for(const table of document.querySelectorAll("table")){
    const headers=[...table.querySelectorAll("thead th")].map(x=>x.textContent?.trim());
    if(headers.includes("Why Wait")&&headers.includes("Next Trigger")){
      for(const row of table.querySelectorAll("tbody tr")){
        const cells=row.querySelectorAll("td");if(cells.length<5)continue;const why=String(cells[3].textContent||"").trim(),lower=why.toLowerCase();
        if(lower.includes("already too extended")||lower.includes("too impulsive")||lower.includes("chase"))cells[4].textContent="Wait for a controlled pullback or consolidation; then require timing reconfirmation.";
        else if(lower.includes("macd")||lower.includes("short-term price structure")||lower.includes("timing"))cells[4].textContent="Wait for short-term timing confirmation; do not buy merely because price moves higher.";
        else if(lower.includes("starter size only")||lower.includes("starter/partial"))cells[4].textContent="Starter only after timing confirms; full size requires Buy-level confirmation.";
        else if(lower.includes("base entry gate does not currently permit fresh capital"))cells[4].textContent="Wait for the entry gate to clear; a higher price alone is not confirmation.";
      }
    }
    if(headers.includes("Decision")&&headers.includes("Why")){
      const whyIndex=headers.indexOf("Why");
      for(const row of table.querySelectorAll("tbody tr")){
        const cells=row.querySelectorAll("td");if(whyIndex<0||cells.length<=whyIndex)continue;const cell=cells[whyIndex],text=String(cell.textContent||"").trim();if(!text)continue;
        if(/^thesis,\s*setup,\s*technicals remain supportive/i.test(text))cell.textContent="Thesis and setup remain supportive. Short-term technical/timing confirmation is required before any add.";
        else if(/^[a-z]/.test(text))cell.textContent=sentenceCase(text);
      }
    }
  }
  for(const field of document.querySelectorAll(".mobileField")){
    const label=field.querySelector("small")?.textContent?.trim();if(label!=="Why")continue;const p=field.querySelector("p");if(!p)continue;const text=String(p.textContent||"").trim();if(/^thesis,\s*setup,\s*technicals remain supportive/i.test(text))p.textContent="Thesis and setup remain supportive. Short-term technical/timing confirmation is required before any add.";else if(/^[a-z]/.test(text))p.textContent=sentenceCase(text);
  }
  for(const box of document.querySelectorAll('.rotationBox')){
    let note=box.querySelector('[data-capital-fit-note]');if(!note){note=document.createElement('p');note.dataset.capitalFitNote='true';note.style.margin='8px 0 10px';note.style.fontSize='0.9em';note.style.color='#52647f';note.style.lineHeight='1.35';const heading=box.querySelector('b');if(heading)heading.insertAdjacentElement('afterend',note);else box.prepend(note);}if(note.textContent!==CAPITAL_NOTE)note.textContent=CAPITAL_NOTE;
  }
}

if(typeof window!=="undefined")installResilientApiFetch();

export default function App({ Component, pageProps }) {
  const [version,setVersion]=useState(null),[feedNotice,setFeedNotice]=useState("");
  useEffect(()=>{
    installResilientApiFetch();
    const onNotice=e=>setFeedNotice(String(e?.detail||""));window.addEventListener("screener-feed-notice",onNotice);
    const host=window.location.hostname;if(LEGACY_HOSTS.has(host)){window.location.replace(`https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`);return()=>window.removeEventListener("screener-feed-notice",onNotice);}
    fetch("/api/version",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setVersion).catch(()=>{});
    return()=>window.removeEventListener("screener-feed-notice",onNotice);
  },[]);
  return <>
    {feedNotice&&<div style={{position:"sticky",top:0,zIndex:10000,padding:"9px 14px",background:"#fff7ed",borderBottom:"1px solid #fb923c",color:"#9a3412",fontWeight:800,fontSize:13}}>{feedNotice}</div>}
    <Component {...pageProps} />
    <div style={{position:"fixed",right:8,bottom:6,zIndex:9999,fontSize:10,padding:"4px 7px",borderRadius:6,background:"rgba(15,23,42,.82)",color:"#e2e8f0",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",pointerEvents:"none"}}>{version?`Production • ${version.commit} • ${version.project} • ${version.release}`:"Production • version loading…"}</div>
  </>;
}
