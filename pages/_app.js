import {useEffect,useState} from "react";
import {factorWeightsFor} from "../lib/portfolioGovernor";
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
const CAPITAL_NOTE="Capital actions reflect portfolio fit, not raw opportunity rank. A higher-ranked Buy can be skipped when concentration, correlation, position-size, or risk-budget constraints make another qualified target the better incremental use of capital.";
const actionOf=s=>String(s?.finalDecision?.action||s?.recommendation?.displayLabel||s?.recommendation?.label||"");
const symbolOf=s=>String(s?.symbol||s?.ticker||"").toUpperCase();

export default function App({ Component, pageProps }) {
  const [version,setVersion]=useState(null);

  useEffect(()=>{
    const host=window.location.hostname;
    if(LEGACY_HOSTS.has(host)){
      window.location.replace(`https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`);
      return;
    }
    fetch("/api/version",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setVersion).catch(()=>{});
  },[]);

  useEffect(()=>{
    let ideas=[];
    let stopped=false;
    const refreshIdeas=async()=>{
      try{
        const r=await fetch('/api/top5?theme=opportunities',{cache:'no-store'}),d=await r.json();
        if(r.ok&&Array.isArray(d.stocks)){ideas=d.stocks;explainCapitalSelection();}
      }catch{}
    };
    const specificCapitalNote=box=>{
      const governor=document.querySelector('.governorBox')?.textContent||'';
      const concentration=governor.match(/([^:]+):\s*(\d+)% of Swing capital/i);
      const funded=(box.textContent||'').match(/→\s*([A-Z][A-Z0-9.-]{0,9})\b/);
      if(!concentration||!funded||!ideas.length)return CAPITAL_NOTE;
      const factor=concentration[1].replace(/^⚠\s*Portfolio Governor\s*/i,'').trim(),factorPct=Number(concentration[2]),target=funded[1].toUpperCase();
      const targetIndex=ideas.findIndex(s=>symbolOf(s)===target);
      if(targetIndex<0)return CAPITAL_NOTE;
      const skipped=ideas.slice(0,targetIndex).find(s=>["Strong Buy","Buy"].includes(actionOf(s))&&Number(factorWeightsFor(s)?.[factor]||0)>=.20);
      if(!skipped)return `${target} is the best risk-budgeted use of capital among the currently fundable qualified opportunities. ${CAPITAL_NOTE}`;
      const weight=Number(factorWeightsFor(skipped)?.[factor]||0);
      return `${target} is funded because it clears the fresh-capital standard without adding to the constrained ${factor} exposure. ${symbolOf(skipped)} ranks higher on standalone opportunity quality but carries about ${Math.round(weight*100)}% ${factor} exposure, so with that factor already at ${factorPct}% of Swing capital it is not funded today.`;
    };
    const explainCapitalSelection=()=>{
      if(stopped)return;
      for(const box of document.querySelectorAll('.rotationBox')){
        let note=box.querySelector('[data-capital-fit-note]');
        if(!note){
          note=document.createElement('p');
          note.dataset.capitalFitNote='true';
          note.style.margin='8px 0 10px';
          note.style.fontSize='0.9em';
          note.style.color='#52647f';
          note.style.lineHeight='1.35';
          const heading=box.querySelector('b');
          if(heading)heading.insertAdjacentElement('afterend',note);else box.prepend(note);
        }
        const text=specificCapitalNote(box);
        if(note.textContent!==text)note.textContent=text;
      }
    };
    explainCapitalSelection();
    void refreshIdeas();
    const observer=new MutationObserver(explainCapitalSelection);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{stopped=true;observer.disconnect();};
  },[]);

  return <>
    <Component {...pageProps} />
    <div style={{position:"fixed",right:8,bottom:6,zIndex:9999,fontSize:10,padding:"4px 7px",borderRadius:6,background:"rgba(15,23,42,.82)",color:"#e2e8f0",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",pointerEvents:"none"}}>
      {version?`Production • ${version.commit} • ${version.project} • ${version.release}`:"Production • version loading…"}
    </div>
  </>;
}
