const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('positionOpenedDate')){console.log('Open-date display already applied.');process.exit(0);}

const marker='<div className="chips">{portfolio.map(p=><span key={p.symbol}><b>{p.symbol}</b> {p.shares} @ {money(p.avgCost)}';
if(!s.includes(marker))throw new Error('open-date display: portfolio chip marker missing');
const replacement='<div className="chips">{portfolio.map(p=><span key={p.symbol}><b>{p.symbol}</b> {p.shares} @ {money(p.avgCost)}{p.role==="Swing"&&p.openedAt&&<small className="positionOpenedDate">{new Date(p.openedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</small>}';
s=s.replace(marker,replacement);

const cssMarker='.syncBox{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc}';
if(!s.includes(cssMarker))throw new Error('open-date display: sync css marker missing');
const css='.positionOpenedDate{display:block;margin-top:2px;color:#64748b;font-size:11px;font-weight:600;line-height:1.2}';
s=s.replace(cssMarker,css+cssMarker);

fs.writeFileSync(path,s);
console.log('Displayed subtle opened dates on Swing portfolio positions.');
