const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('function stageTone(stage)')){console.log('Stage badges already applied.');process.exit(0);}

const clsMarker='const cls=a=>["Strong Buy","Buy","Add"].includes(a)?"green":["Trim","Rotate","Reduce"].includes(a)?"orange":["Watch","Hold","Review"].includes(a)?"yellow":a==="Cash"?"gray":"red";';
if(!s.includes(clsMarker))throw new Error('stage badges: class marker missing');
s=s.replace(clsMarker,clsMarker+'\nfunction stageTone(stage){return({"Setup":"setup","Proof":"proof","Re-underwrite":"reunderwrite","Opportunity Cost":"opportunity","Long Swing Review":"long"})[stage]||"unknown";}');

const labelOld='label=`${s.role} · ${(+s.weightPct||0).toFixed(1)}% of portfolio · ${factorFor(s)}${time.held!==null?` · ${time.stage}`:""}`';
if(!s.includes(labelOld))throw new Error('stage badges: portfolio label marker missing');
s=s.replace(labelOld,'label=`${s.role} · ${(+s.weightPct||0).toFixed(1)}% of portfolio · ${factorFor(s)}`');

const mobileOld='<div><h3>{sym(s)}</h3><span>{label}</span></div><b className={`pill ${cls(d.action)}`}>{d.action}</b>';
if(!s.includes(mobileOld))throw new Error('stage badges: mobile portfolio marker missing');
s=s.replace(mobileOld,'<div><h3>{sym(s)}</h3><span>{label}</span><div className="positionBadges">{time.held!==null&&<span className={`stageBadge ${stageTone(time.stage)}`}>{time.stage}</span>}{specialSituation(s)&&<span className="specialSituationBadge">{specialSituation(s).label}</span>}</div></div><b className={`pill ${cls(d.action)}`}>{d.action}</b>');

const desktopOld='<td><b>{sym(s)}</b><div>{label}</div></td><td className="openDateCell">';
if(!s.includes(desktopOld))throw new Error('stage badges: desktop portfolio marker missing');
s=s.replace(desktopOld,'<td><b>{sym(s)}</b><div>{label}</div><div className="positionBadges">{time.held!==null&&<span className={`stageBadge ${stageTone(time.stage)}`}>{time.stage}</span>}{specialSituation(s)&&<span className="specialSituationBadge">{specialSituation(s).label}</span>}</div></td><td className="openDateCell">');

const reviewOld='<td>{time.stage}</td><td className={s.gainLossPct>=0?"pos":"neg"}>';
if(!s.includes(reviewOld))throw new Error('stage badges: time review stage marker missing');
s=s.replace(reviewOld,'<td><span className={`stageBadge ${stageTone(time.stage)}`}>{time.stage}</span></td><td className={s.gainLossPct>=0?"pos":"neg"}>');

const cssMarker='.openDateCell{white-space:nowrap;color:#53657f;font-weight:700}';
if(!s.includes(cssMarker))throw new Error('stage badges: css marker missing');
const css='.positionBadges{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-top:5px}.stageBadge,.specialSituationBadge{display:inline-block;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:900;line-height:1.2;border:1px solid transparent}.stageBadge.setup{background:#dbeafe;color:#1e40af;border-color:#93c5fd}.stageBadge.proof{background:#dcfce7;color:#166534;border-color:#86efac}.stageBadge.reunderwrite{background:#fef9c3;color:#854d0e;border-color:#fde047}.stageBadge.opportunity{background:#ffedd5;color:#9a3412;border-color:#fdba74}.stageBadge.long{background:#fee2e2;color:#991b1b;border-color:#fca5a5}.stageBadge.unknown{background:#e5e7eb;color:#374151;border-color:#cbd5e1}.specialSituationBadge{background:#ede9fe;color:#5b21b6;border-color:#c4b5fd}';
s=s.replace(cssMarker,css+cssMarker);

fs.writeFileSync(path,s);
console.log('Applied color-coded time-in-trade stage badges.');
