const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('cashDryPowder')){console.log('Cash dry-powder display already applied.');process.exit(0);}

const openOld='openDate=s.role==="Swing"&&s.openedAt?new Date(s.openedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"';
if(!s.includes(openOld))throw new Error('cash display: open-date marker missing');
s=s.replace(openOld,'openDate=s.role==="Swing"&&!CASH.includes(sym(s))&&s.openedAt?new Date(s.openedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—",cashDryPowder=CASH.includes(sym(s))');

const mobileOld='<div><small>Price</small><b>{money(price(s))}</b></div><div><small>Gain / Loss</small>';
if(!s.includes(mobileOld))throw new Error('cash display: mobile price marker missing');
s=s.replace(mobileOld,'<div><small>{cashDryPowder?"Dry Powder":"Price"}</small><b>{cashDryPowder?money(s.value):money(price(s))}</b>{cashDryPowder&&<span className="cashUnit">$1.00/share</span>}</div><div><small>Gain / Loss</small>');

const desktopOld='<td>{money(price(s))}</td><td className={s.gainLoss>=0?"pos":"neg"}>';
if(!s.includes(desktopOld))throw new Error('cash display: desktop price marker missing');
s=s.replace(desktopOld,'<td>{cashDryPowder?<div className="cashValue"><b>{money(s.value)}</b><small>$1.00/share</small></div>:money(price(s))}</td><td className={s.gainLoss>=0?"pos":"neg"}>');

const cssMarker='.openDateCell{white-space:nowrap;color:#53657f;font-weight:700}';
if(!s.includes(cssMarker))throw new Error('cash display: css marker missing');
s=s.replace(cssMarker,'.cashValue{display:flex;flex-direction:column;gap:2px}.cashValue small,.cashUnit{font-size:11px;color:#64748b;font-weight:700}'+cssMarker);

fs.writeFileSync(path,s);
console.log('Applied cash dry-powder display and removed cash open dates.');
