const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('<th>Open Date</th>')){console.log('Open-date table display already applied.');process.exit(0);}

const rowOld='function PortfolioRow({s,mobile=false}){const d=pd(s),time=swingTimeReview(s),label=`${s.role} · ${(+s.weightPct||0).toFixed(1)}% of portfolio · ${factorFor(s)}${time.held!==null?` · ${time.stage}`:""}`;if(mobile)return <article className="portfolioItem"><div className="portfolioHead"><div><h3>{sym(s)}</h3><span>{label}</span></div><b className={`pill ${cls(d.action)}`}>{d.action}</b></div><div className="mobileField"><small>Why</small><p>{d.reason}</p></div><div className="mobileField"><small>Next Move</small><p>{next(s,d)}</p></div><div className="mobileNumbers"><div><small>Price</small><b>{money(price(s))}</b></div><div><small>Gain / Loss</small><b className={s.gainLoss>=0?"pos":"neg"}>{money(s.gainLoss)} / {pct(s.gainLossPct)}</b></div></div></article>;return <tr><td><b>{sym(s)}</b><div>{label}</div></td><td><b className={`pill ${cls(d.action)}`}>{d.action}</b></td><td>{d.reason}</td><td>{next(s,d)}</td><td>{money(price(s))}</td><td className={s.gainLoss>=0?"pos":"neg"}>{money(s.gainLoss)} / {pct(s.gainLossPct)}</td></tr>;}'
const rowNew='function PortfolioRow({s,mobile=false}){const d=pd(s),time=swingTimeReview(s),label=`${s.role} · ${(+s.weightPct||0).toFixed(1)}% of portfolio · ${factorFor(s)}${time.held!==null?` · ${time.stage}`:""}`,openDate=s.role==="Swing"&&s.openedAt?new Date(s.openedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";if(mobile)return <article className="portfolioItem"><div className="portfolioHead"><div><h3>{sym(s)}</h3><span>{label}</span></div><b className={`pill ${cls(d.action)}`}>{d.action}</b></div>{openDate!=="—"&&<div className="mobileField"><small>Open Date</small><p>{openDate}</p></div>}<div className="mobileField"><small>Why</small><p>{d.reason}</p></div><div className="mobileField"><small>Next Move</small><p>{next(s,d)}</p></div><div className="mobileNumbers"><div><small>Price</small><b>{money(price(s))}</b></div><div><small>Gain / Loss</small><b className={s.gainLoss>=0?"pos":"neg"}>{money(s.gainLoss)} / {pct(s.gainLossPct)}</b></div></div></article>;return <tr><td><b>{sym(s)}</b><div>{label}</div></td><td className="openDateCell">{openDate}</td><td><b className={`pill ${cls(d.action)}`}>{d.action}</b></td><td>{d.reason}</td><td>{next(s,d)}</td><td>{money(price(s))}</td><td className={s.gainLoss>=0?"pos":"neg"}>{money(s.gainLoss)} / {pct(s.gainLossPct)}</td></tr>;}'
if(!s.includes(rowOld))throw new Error('open-date display: PortfolioRow marker missing');
s=s.replace(rowOld,rowNew);

const headOld='<thead><tr><th>Position</th><th>Decision</th><th>Why</th><th>Next Move</th><th>Price</th><th>Gain/Loss</th></tr></thead>';
const headNew='<thead><tr><th>Position</th><th>Open Date</th><th>Decision</th><th>Why</th><th>Next Move</th><th>Price</th><th>Gain/Loss</th></tr></thead>';
if(!s.includes(headOld))throw new Error('open-date display: portfolio table header marker missing');
s=s.replace(headOld,headNew);

const cssMarker='.mobilePortfolio{display:none}';
if(!s.includes(cssMarker))throw new Error('open-date display: css marker missing');
s=s.replace(cssMarker,'.openDateCell{white-space:nowrap;color:#53657f;font-weight:700}'+cssMarker);

fs.writeFileSync(path,s);
console.log('Moved Swing open dates into Portfolio Intelligence.');
