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
const API_TIMEOUT_MS=15000;
const TOP5_TIMEOUT_MS=90000;
const TOP5_STALE_MS=30*60*1000;
const TOP5_CACHE_PREFIX="screener_top5_response_v2:";

function emitFeedNotice(message=""){try{window.dispatchEvent(new CustomEvent("screener-feed-notice",{detail:message}));}catch{}}
function readTop5Cache(key){try{const raw=window.localStorage.getItem(TOP5_CACHE_PREFIX+key);const x=raw?JSON.parse(raw):null;return x&&typeof x.body==="string"?x:null;}catch{return null;}}
function writeTop5Cache(key,body){try{window.localStorage.setItem(TOP5_CACHE_PREFIX+key,JSON.stringify({ts:Date.now(),body}));}catch{}}
function cachedResponse(hit){
  let body=hit.body;
  try{const parsed=JSON.parse(body);parsed.meta={...(parsed.meta||{}),clientSnapshotFallback:true,clientSnapshotAgeMs:Math.max(0,Date.now()-Number(hit.ts||0))};body=JSON.stringify(parsed);}catch{}
  return new Response(body,{status:200,headers:{"content-type":"application/json; charset=utf-8","x-screener-cache":"stale-fallback"}});
}
function forceLiveRefresh(){if(typeof window==="undefined")return;emitFeedNotice("");window.dispatchEvent(new CustomEvent("screener-request-live-refresh"));}

function installResilientApiFetch(){
  if(typeof window==="undefined"||window.__screenerResilientFetchInstalled)return;
  const nativeFetch=window.fetch.bind(window);
  const inflight=new Map();
  window.fetch=async function resilientFetch(input,init={}){
    let url;try{url=new URL(typeof input==="string"?input:input?.url,window.location.href);}catch{return nativeFetch(input,init);}
    const method=String(init?.method||(typeof input!=="string"&&input?.method)||"GET").toUpperCase(),sameOrigin=url.origin===window.location.origin,resilient=sameOrigin&&url.pathname.startsWith("/api/")&&method==="GET";
    if(!resilient)return nativeFetch(input,init);

    const cacheParams=new URLSearchParams(url.search);cacheParams.delete("verificationPass");const isTop5=url.pathname==="/api/top5",cacheKey=isTop5?`${url.pathname}?${cacheParams.toString()}`:"",hit=isTop5?readTop5Cache(cacheKey):null,age=hit?Date.now()-Number(hit.ts||0):Infinity;
    if(isTop5&&inflight.has(cacheKey)){
      const r=await inflight.get(cacheKey);return r.clone();
    }

    const run=async()=>{
      const controller=new AbortController(),parentSignal=init?.signal,onAbort=()=>controller.abort(parentSignal?.reason);
      if(parentSignal){if(parentSignal.aborted)controller.abort(parentSignal.reason);else parentSignal.addEventListener("abort",onAbort,{once:true});}
      const timer=setTimeout(()=>controller.abort(new DOMException("API request timed out","TimeoutError")),isTop5?TOP5_TIMEOUT_MS:API_TIMEOUT_MS);
      let response=null,error=null;
      try{
        response=await nativeFetch(input,{...init,signal:controller.signal});
        if(response.ok){
          if(isTop5){const body=await response.text();writeTop5Cache(cacheKey,body);emitFeedNotice("");return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});}
          return response;
        }
      }catch(e){error=e;}finally{clearTimeout(timer);if(parentSignal)parentSignal.removeEventListener("abort",onAbort);}
      if(isTop5&&hit&&age<TOP5_STALE_MS){emitFeedNotice("Live refresh failed. Showing a clearly paused prior snapshot for continuity; no fresh-capital action may use it.");return cachedResponse(hit);}
      if(response)return response;
      const timedOut=error?.name==="AbortError"||error?.name==="TimeoutError";
      throw new Error(timedOut?"Live refresh timed out. The desktop app remains usable; try Reload again later.":`Live refresh failed${error?.message?`: ${error.message}`:"."}`);
    };

    if(isTop5){const p=run().finally(()=>inflight.delete(cacheKey));inflight.set(cacheKey,p);const r=await p;return r.clone();}
    return run();
  };
  window.__screenerResilientFetchInstalled=true;
}

if(typeof window!=="undefined")installResilientApiFetch();

export default function App({ Component, pageProps }) {
  const [version,setVersion]=useState(null),[feedNotice,setFeedNotice]=useState("");
  useEffect(()=>{
    installResilientApiFetch();
    const onNotice=e=>setFeedNotice(String(e?.detail||""));window.addEventListener("screener-feed-notice",onNotice);
    const host=window.location.hostname;if(LEGACY_HOSTS.has(host)){window.location.replace(`https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`);return()=>window.removeEventListener("screener-feed-notice",onNotice);}
    fetch("/api/version",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setVersion).catch(()=>{});
    const onHeaderReload=e=>{const b=e.target?.closest?.('header button');if(!b)return;const text=String(b.textContent||'').trim();if(text==='Reload'||text==='Reloading...')emitFeedNotice("");};
    document.addEventListener('click',onHeaderReload,true);
    return()=>{window.removeEventListener("screener-feed-notice",onNotice);document.removeEventListener('click',onHeaderReload,true);};
  },[]);
  return <>
    {feedNotice&&<div style={{position:"sticky",top:0,zIndex:10000,padding:"9px 14px",background:"#fff7ed",borderBottom:"1px solid #fb923c",color:"#9a3412",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><span>{feedNotice}</span><button type="button" onClick={forceLiveRefresh} style={{border:"1px solid #fb923c",background:"#fff",color:"#9a3412",borderRadius:8,padding:"5px 9px",fontWeight:900,cursor:"pointer",whiteSpace:"nowrap"}}>Force live refresh</button></div>}
    <Component {...pageProps} />
    <div data-version-stamp style={{position:"relative",width:"fit-content",maxWidth:"calc(100% - 20px)",margin:"14px auto 8px",fontSize:10,padding:"4px 7px",borderRadius:6,background:"rgba(15,23,42,.82)",color:"#e2e8f0",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",pointerEvents:"none",textAlign:"center",overflowWrap:"anywhere"}}>{version?`Production • ${version.commit} • ${version.project} • ${version.release}`:"Production • version loading…"}</div>
  </>;
}
