import {useEffect,useState} from "react";
import "../styles/card-layout.css";

const CANONICAL_HOST="screener-app-cq5t.vercel.app";
const LEGACY_PREFIXES=["screener-app.vercel.app","screener-app-hp1w","screener-app-us7z"];
const CAPITAL_NOTE="Capital actions reflect portfolio fit, not raw opportunity rank. A higher-ranked Buy can be skipped when concentration, correlation, position-size, or risk-budget constraints make another qualified target the better incremental use of capital.";

export default function App({ Component, pageProps }) {
  const [version,setVersion]=useState(null);

  useEffect(()=>{
    const host=window.location.hostname;
    const legacy=LEGACY_PREFIXES.some(x=>host===x||host.startsWith(`${x}-`));
    if(legacy){
      window.location.replace(`https://${CANONICAL_HOST}${window.location.pathname}${window.location.search}${window.location.hash}`);
      return;
    }
    fetch("/api/version",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(setVersion).catch(()=>{});
  },[]);

  useEffect(()=>{
    const explainCapitalSelection=()=>{
      for(const box of document.querySelectorAll('.rotationBox')){
        if(box.querySelector('[data-capital-fit-note]'))continue;
        const note=document.createElement('p');
        note.dataset.capitalFitNote='true';
        note.textContent=CAPITAL_NOTE;
        note.style.margin='8px 0 10px';
        note.style.fontSize='0.9em';
        note.style.color='#52647f';
        note.style.lineHeight='1.35';
        const heading=box.querySelector('b');
        if(heading)heading.insertAdjacentElement('afterend',note);else box.prepend(note);
      }
    };
    explainCapitalSelection();
    const observer=new MutationObserver(explainCapitalSelection);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);

  return <>
    <Component {...pageProps} />
    <div style={{position:"fixed",right:8,bottom:6,zIndex:9999,fontSize:10,padding:"4px 7px",borderRadius:6,background:"rgba(15,23,42,.82)",color:"#e2e8f0",fontFamily:"ui-monospace,SFMono-Regular,Menlo,monospace",pointerEvents:"none"}}>
      {version?`Production • ${version.commit} • ${version.project} • ${version.release}`:"Production • version loading…"}
    </div>
  </>;
}
