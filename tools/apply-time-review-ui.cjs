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

const governorMarker='{riskSnapshot.concentrations.length>0&&<div className="governorBox">';
if(!src.includes(governorMarker))throw new Error('time-review patch: governor marker not found');
const panel='{timeReviewRows.length>0&&<div className="timeReviewBox"><b>⏱ Swing Time Reviews</b><p>Positions enter an explicit opportunity-cost review as they mature. Time alone never forces a sale; the position must re-earn capital versus current alternatives.</p><div className="scroll"><table><thead><tr><th>Position</th><th>Days Held</th><th>Stage</th><th>P/L</th><th>Capital Score</th><th>Opportunity Gap</th><th>Current Review</th></tr></thead><tbody>{timeReviewRows.map(({s,time,decision})=><tr key={`time-${sym(s)}`}><td><b>{sym(s)}</b></td><td>{time.held}</td><td>{time.stage}</td><td className={s.gainLossPct>=0?"pos":"neg"}>{pct(s.gainLossPct)}</td><td>{Math.round(capitalScore(s))}</td><td>{Math.round(+s.opportunityGap||0)}</td><td><b>{decision.action}</b> — {decision.reason}</td></tr>)}</tbody></table></div></div>}';
src=src.replace(governorMarker,panel+governorMarker);

const cssMarker='.governorBox{border:1px solid #f59e0b;background:#fffbeb;border-radius:12px;padding:12px;margin:12px 0}';
if(!src.includes(cssMarker))throw new Error('time-review patch: css marker not found');
src=src.replace(cssMarker,'.timeReviewBox{border:1px solid #94a3b8;background:#f8fafc;border-radius:12px;padding:12px;margin:12px 0}.timeReviewBox>p{color:#53657f;margin:6px 0 10px}.openedInput{display:flex;flex-direction:column;gap:2px}.openedInput small{color:#64748b;font-weight:800}.openedInput input{padding:7px 10px}'+cssMarker);

fs.writeFileSync(pagePath,src);
console.log('Applied first-class Swing time review UI and editable opened-date tracking.');
