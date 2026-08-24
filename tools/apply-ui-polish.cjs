const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');

// Remove the redundant label above the date picker while keeping the accessible title.
s=s.replace('<label className="openedInput"><small>Opened</small><input type="date" value={openedDate} onChange={e=>setOpenedDate(e.target.value)}/></label>', '<label className="openedInput" title="Position opened date"><input aria-label="Position opened date" type="date" value={openedDate} onChange={e=>setOpenedDate(e.target.value)}/></label>');

if(!s.includes('const[marketRadar,setMarketRadar]')){
  const marker='  const[portfolio,setPortfolio]=useState([]),[results,setResults]=useState([]),[buyQueue,setBuyQueue]=useState([]);';
  if(!s.includes(marker))throw new Error('ui polish: state marker missing');
  s=s.replace(marker, marker+'\n  const[marketRadar,setMarketRadar]=useState([]);');
}

// Capture the broad market-cycle radar (preferred) with theme-leadership fallback.
const loadOld='if(t==="opportunities"){setStocks(d.stocks||[]);}else setThemeStocks(d.stocks||[]);setLastUpdated(new Date());';
const loadNew='if(t==="opportunities"){setStocks(d.stocks||[]);setMarketRadar((d.meta?.marketCycleRadar?.length?d.meta.marketCycleRadar:(d.themeLeadership||[])).slice(0,6));}else setThemeStocks(d.stocks||[]);setLastUpdated(new Date());';
if(s.includes(loadOld))s=s.replace(loadOld,loadNew);else if(!s.includes('setMarketRadar((d.meta?.marketCycleRadar'))throw new Error('ui polish: load marker missing');

const analyzeOld='if(sr.ok&&Array.isArray(sd.stocks))snapshot=sd.stocks;if(pr.ok&&Array.isArray(pd.records))performance=pd.records;';
const analyzeNew='if(sr.ok&&Array.isArray(sd.stocks)){snapshot=sd.stocks;setMarketRadar((sd.meta?.marketCycleRadar?.length?sd.meta.marketCycleRadar:(sd.themeLeadership||[])).slice(0,6));}if(pr.ok&&Array.isArray(pd.records))performance=pd.records;';
if(s.includes(analyzeOld))s=s.replace(analyzeOld,analyzeNew);else if(!s.includes('sd.meta?.marketCycleRadar'))throw new Error('ui polish: analyze marker missing');

if(!s.includes('className="marketRadarBar"')){
  const nav='    <nav>{["opportunities","portfolio","themes","single"].map(x=><button className={tab==x?"active":""} onClick={()=>setTab(x)} key={x}>{x==="portfolio"?"My Portfolio":x[0].toUpperCase()+x.slice(1)}</button>)}</nav>';
  if(!s.includes(nav))throw new Error('ui polish: nav marker missing');
  const bar='\n    {marketRadar.length>0&&<div className="marketRadarBar"><b>MARKET LEADERSHIP</b><div className="marketRadarItems">{marketRadar.map((r,i)=>{const nm=r.name||r.theme||"Theme",st=r.state||r.status||"",sc=Number(r.score);return <span key={`${nm}-${i}`}><strong>{nm}</strong>{st&&<em>{st}</em>}{Number.isFinite(sc)&&<small>{Math.round(sc)}</small>}</span>;})}</div></div>}';
  s=s.replace(nav,nav+bar);
}

const cssAnchor='.card{background:white;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin:14px 0}';
if(!s.includes('.marketRadarBar{')){
  if(!s.includes(cssAnchor))throw new Error('ui polish: css anchor missing');
  const css='.marketRadarBar{display:flex;align-items:center;gap:14px;background:#111827;color:white;border-radius:12px;padding:10px 14px;margin:10px 0 14px;overflow:auto}.marketRadarBar>b{font-size:12px;letter-spacing:.08em;white-space:nowrap}.marketRadarItems{display:flex;gap:8px;min-width:max-content}.marketRadarItems span{display:flex;align-items:center;gap:6px;border:1px solid #374151;background:#1f2937;border-radius:999px;padding:5px 9px;white-space:nowrap}.marketRadarItems strong{font-size:13px}.marketRadarItems em{font-size:11px;font-style:normal;color:#cbd5e1}.marketRadarItems small{font-size:11px;color:#93c5fd;font-weight:800}';
  s=s.replace(cssAnchor,css+cssAnchor);
}

fs.writeFileSync(path,s);
console.log('Restored market leadership bar and cleaned portfolio date control.');
