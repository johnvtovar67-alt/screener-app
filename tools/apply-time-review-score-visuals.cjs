const fs=require('fs');
const path='pages/index.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('function capitalScoreVisual(')){console.log('Time-review score visuals already applied.');process.exit(0);}

const helperMarker='function rotationStrength(gap){const g=+gap||0;if(g>=55)return{label:"Exceptional Rotation Edge",tone:"veryStrong"};if(g>=45)return{label:"Strong Rotation Edge",tone:"strong"};return{label:"Below Rotation Hurdle",tone:"meaningful"};}';
if(!s.includes(helperMarker))throw new Error('score visuals: helper marker missing');
s=s.replace(helperMarker,helperMarker+'\nfunction capitalScoreVisual(score){const v=Math.round(+score||0);if(v>=80)return{value:v,label:"Excellent",tone:"excellent"};if(v>=70)return{value:v,label:"Strong",tone:"strong"};if(v>=60)return{value:v,label:"Mixed",tone:"mixed"};return{value:v,label:"Weak",tone:"weak"};}\nfunction replacementEdgeVisual(gap,eligible){const v=Math.round(+gap||0);if(!eligible||v<=0)return{value:null,label:"None qualified",tone:"none"};if(v>=55)return{value:v,label:"Exceptional",tone:"exceptional"};if(v>=45)return{value:v,label:"Strong edge",tone:"strong"};return{value:v,label:"Below hurdle",tone:"below"};}');

const old='<td>{Math.round(capitalScore(s))}</td><td>{Math.round(+s.opportunityGap||0)}</td>';
if(!s.includes(old))throw new Error('score visuals: time-review cells missing');
const repl='<td>{(()=>{const v=capitalScoreVisual(capitalScore(s));return <span className={`scoreVisual ${v.tone}`}><b>{v.value}</b><small>{v.label}</small></span>;})()}</td><td>{(()=>{const v=replacementEdgeVisual(s.opportunityGap,s.rotationTargetEligible);return <span className={`edgeVisual ${v.tone}`}><b>{v.value===null?"—":v.value}</b><small>{v.label}</small></span>;})()}</td>';
s=s.replace(old,repl);

const cssMarker='.timeReviewBox{border:1px solid #94a3b8;background:#f8fafc;border-radius:12px;padding:12px;margin:12px 0}';
if(!s.includes(cssMarker))throw new Error('score visuals: css marker missing');
const css='.scoreVisual,.edgeVisual{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}.scoreVisual b,.edgeVisual b{display:inline-flex;min-width:30px;height:30px;padding:0 7px;align-items:center;justify-content:center;border-radius:999px;border:1px solid currentColor;font-size:13px}.scoreVisual small,.edgeVisual small{font-size:11px;font-weight:800;color:#64748b}.scoreVisual.excellent b{background:#dcfce7;color:#166534}.scoreVisual.strong b{background:#dbeafe;color:#1e40af}.scoreVisual.mixed b{background:#fef9c3;color:#854d0e}.scoreVisual.weak b{background:#fee2e2;color:#991b1b}.edgeVisual.none b{background:#f1f5f9;color:#64748b}.edgeVisual.below b{background:#fef9c3;color:#854d0e}.edgeVisual.strong b{background:#ffedd5;color:#9a3412}.edgeVisual.exceptional b{background:#dcfce7;color:#166534}';
s=s.replace(cssMarker,css+cssMarker);

fs.writeFileSync(path,s);
console.log('Applied simple Capital Score and Replacement Edge visuals.');
