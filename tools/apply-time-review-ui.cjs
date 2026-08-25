const fs=require('fs');
const pagePath='pages/index.js';
let src=fs.readFileSync(pagePath,'utf8');
if(src.includes('Swing Time Reviews')){console.log('Swing time review UI already applied.');process.exit(0);}

const stateMarker='  const[ns,setNs]=useState(""),[nsh,setNsh]=useState(""),[nc,setNc]=useState(""),[nr,setNr]=useState("Swing"),[symbol,setSymbol]=useState(""),[snap,setSnap]=useState(null),[lastUpdated,setLastUpdated]=useState(null);';
if(!src.includes(stateMarker))throw new Error('time-review patch: state marker not found');
src=src.replace(stateMarker,stateMarker+'\n  const[openedDate,setOpenedDate]=useState("");');

const addMarker='    const prior=portfolio.find(x=>x.symbol===symbol),now=new Date().toISOString(),changed=!prior||+prior.shares!==shares||+prior.avgCost!==avgCost;';
if(!src.includes(addMarker))throw new Error('time-review patch: add marker not found');
src=src.replace(addMarker,addMarker+'\n    const openedAtInput=openedDate?new Date(`${openedDate}T12:00:00`).toISOString():null;');

const pMarker='    const p={symbol,shares,avgCost,role:nr,winnerHistory,openedAt:prior?.openedAt||now,lastTradeAt:changed?now:(prior?.lastTradeAt||prior?.openedAt||now)};';
if(!src.includes(pMarker))throw new Error('time-review patch: position marker not found');
src=src.replace(pMarker,'    const p={symbol,shares,avgCost,role:nr,winnerHistory,openedAt:openedAtInput||prior?.openedAt||now,lastTradeAt:changed?now:(prior?.lastTradeAt||prior?.openedAt||now)};');

const clearMarker='    save([...portfolio.filter(x=>x.symbol!==p.symbol),p]);setNs("");setNsh("");setNc("");';
if(!src.includes(clearMarker))throw new Error('time-review patch: clear marker not found');
src=src.replace(clearMarker,'    save([...portfolio.filter(x=>x.symbol!==p.symbol),p]);setNs("");setNsh("");setNc("");setOpenedDate("");');

const inputMarker='<input value={nc} onChange={e=>setNc(e.target.value)} placeholder="Avg cost"/><select value={nr}';
if(!src.includes(inputMarker))throw new Error('time-review patch: input marker not found');
src=src.replace(inputMarker,'<input value={nc} onChange={e=>setNc(e.target.value)} placeholder="Avg cost"/><label className="openedInput"><small>Opened</small><input type="date" value={openedDate} onChange={e=>setOpenedDate(e.target.value)}/></label><select value={nr}');

const busyMarker='  const busy=reloading||loading;';
if(!src.includes(busyMarker))throw new Error('time-review patch: busy marker not found');
src=src.replace(busyMarker,'  const timeReviewRows=results.filter(s=>s.role==="Swing"&&!CASH.includes(sym(s))).map(s=>({s,time:swingTimeReview(s),decision:pd(s)})).filter(x=>x.time.held!==null&&x.time.held>=42).sort((a,b)=>(b.time.held||0)-(a.time.held||0));\n\n'+busyMarker);

const tableMarker='<div className="desktopTable">';
if(!src.includes(tableMarker))throw new Error('time-review patch: desktop table marker not found');
const panel='{timeReviewRows.length>0&&<div className="timeReviewBox"><b>⏱ Time Review</b><span>{timeReviewRows.map(({s,time,decision})=>`${sym(s)} ${time.held}d · ${time.stage} · ${decision.action}`).join("   •   ")}</span></div>}';
src=src.replace(tableMarker,panel+tableMarker);

const cssMarker='.governorBox{border:1px solid #f59e0b;background:#fffbeb;border-radius:12px;padding:12px;margin:12px 0}';
if(!src.includes(cssMarker))throw new Error('time-review patch: css marker not found');
src=src.replace(cssMarker,'.timeReviewBox{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid #cbd5e1;background:#f8fafc;border-radius:10px;padding:8px 10px;margin:10px 0}.timeReviewBox>span{color:#53657f;font-weight:700}.openedInput{display:flex;flex-direction:column;gap:2px}.openedInput small{color:#64748b;font-weight:800}.openedInput input{padding:7px 10px}'+cssMarker);

fs.writeFileSync(pagePath,src);
console.log('Applied compact Swing time review UI and editable opened-date tracking.');
