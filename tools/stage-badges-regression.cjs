const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const modules=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const page=fs.readFileSync('pages/index.js','utf8');
const {c1PositionPresentation}=modules.load('lib/c1PositionPresentation.js');

for(const [tone,color] of [['accelerating','#dbeafe'],['intact','#dcfce7'],['weakening','#fef9c3'],['exit-risk','#fee2e2'],['unknown','#e5e7eb']]){
 assert.ok(page.includes(`momentumBadge.${tone}{background:${color}`),`${tone} evidence needs a distinct visual tone`);
}
assert.ok(page.includes('<th>Evidence</th>'),'The original compact Evidence column is restored');
assert.ok(page.includes('<th>Why</th>'),'The compact Portfolio keeps one concise Why column');
assert.doesNotMatch(page,/momentumEvidenceRows|momentumEvidenceBox|momentumEvidenceCompact|momentumEvidenceItem|Momentum Evidence/,'The redundant momentum summary strip must be absent');
assert.ok(page.includes('specialSituationBadge'),'Special-situation presentation must remain available');
assert.doesNotMatch(page,/stageTone\(|stageBadge|time\.stage|timeReviewRows/,'Duration stages must not appear as portfolio evidence');

// Render the production desktop and mobile row with controlled account evidence.
// Classification logic is tested independently; this boundary fixture verifies
// collapsed evidence preserves source reasons and cannot change holding actions.
const start=page.indexOf('  function momentumEvidenceFor(s){'),end=page.indexOf('  const missingOpenDateSymbols=',start);
assert.ok(start>=0&&end>start,'Portfolio evidence helper and row must be present');
const code=babel.transformSync('import React from "react";\n'+page.slice(start,end)+'\nmodule.exports={PortfolioRow};',{
 filename:'portfolio-evidence-row.jsx',babelrc:false,configFile:false,
 presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]
}).code;
const unavailable={classification:null,status:'unavailable',label:'Evidence unavailable',tone:'unknown',explanation:'Verified C1 momentum evidence is unavailable.',sourceSessionDate:null,limitations:[]};
const classifications=[['Momentum Accelerating','accelerating'],['Momentum Intact','intact'],['Momentum Weakening','weakening'],['Exit Risk','exit-risk']];
const why='Original C1 decision explanation; 7 of 30 trading sessions completed.';
const holding={symbol:'AAA',role:'Swing',shares:10,avgCost:100,price:105,value:1050,weightPct:10,gainLoss:50,gainLossPct:5,openedAt:'2026-09-11'};
function render({evidence=unavailable,action='Hold',source='c1-actual-account',mobile=false,row=holding,accountMatches=true,accountHoldingMismatch=false,resolver,current=true,date='2026-09-11'}={}){
 const calls=[],position={symbol:row.symbol,momentumEvidence:evidence,action,reason:why,
  exits:['Exit candidate','Sell'].includes(action)?[{reason:'rank-deterioration'}]:[]},accountView={decision:{contract:'c1-account-decision-v1',positions:[position],current,sourceSessionDate:date}},record={exports:{}};
 const bindings={accountView,accountMatches,accountHoldingMismatch,CASH:['CASH'],displayedPortfolioValue:10000,
  c1PositionPresentation,
  c1PortfolioMomentumEvidence:args=>{calls.push(args);return resolver?resolver(args):args.position?.momentumEvidence||unavailable;},
  pd:()=>({action,source,reason:why,openedAt:row.openedAt}),swingTimeReview:()=>({held:500,stage:'Long Swing Review'}),holdingReason:(s,d)=>d.reason,
  sym:s=>s.symbol,price:s=>s.price,cls:a=>a==='Hold'?'yellow':'red',factorFor:()=> 'Technology',portfolioDateDisplay:()=> 'Sep 11, 2026',
  specialSituation:s=>s.symbol==='IRDM'?{label:'Acquisition Pending'}:null,money:n=>'$'+Number(n).toFixed(2),pct:n=>Number(n).toFixed(2)+'%'};
 new Function('require','module','exports',...Object.keys(bindings),code)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports,...Object.values(bindings));
 const html=renderToStaticMarkup(React.createElement(record.exports.PortfolioRow,{s:row,mobile}));
 return {html,calls,accountView};
}
for(const [classification,tone] of classifications){
 const evidence={classification,status:'available',label:classification,tone,explanation:'Rank improved from 5 to 2; completed closes gained 3.1%.',sourceSessionDate:'2026-09-11',limitations:[]};
 for(const mobile of [false,true])for(const [action,displayAction] of [['Hold','HOLD'],['Add candidate','HOLD'],['Exit candidate','SELL — MOMENTUM'],['Buy','HOLD'],['Sell','SELL — MOMENTUM']]){
  const {html,calls,accountView}=render({evidence,action,mobile});
  assert.match(html,new RegExp(`class="momentumBadge ${tone}"[^>]*>${classification}<`));
  assert.match(html,/Rank improved from 5 to 2; completed closes gained 3\.1%\./);
  assert.match(html,/As of 2026-09-11/);
  assert.ok(html.includes(`>${displayAction}</b>`),`${classification} must preserve ${action}`);
  assert.ok(html.includes(why),'Evidence must preserve the independent decision explanation and trading-session restriction');
  assert.match(html,/<details\b/,'Technical evidence remains available on expansion');
  assert.doesNotMatch(html,/<details\b[^>]*\sopen(?:[=\s>])/,'Technical evidence starts collapsed');
  assert.doesNotMatch(html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,''),/Rank improved from 5 to 2|Original C1 decision explanation/,'Technical evidence and the full original reason stay out of the primary view');
  assert.doesNotMatch(html,/Long Swing Review|Proof|Re-underwrite/);
  assert.equal(calls[0].position,accountView.decision.positions[0]);
  assert.equal(calls[0].decision,accountView.decision);
  assert.ok(calls[0].now instanceof Date,'Evidence freshness is checked at rendering time');
 }
}
for(const mobile of [false,true]){
 const evidence={classification:'Momentum Intact',status:'available',label:'Momentum Intact',tone:'intact',explanation:'Current rank remains within the holding range.',sourceSessionDate:'2026-09-11',limitations:[]};
 for(const patch of [{accountMatches:false},{accountHoldingMismatch:true}]){
  const {html,calls}=render({...patch,evidence,mobile});
  assert.match(html,/Evidence unavailable/);
  assert.equal(calls[0].position,undefined,'Unmatched Swing rows cannot inherit C1 evidence');
  assert.equal(calls[0].decision,null);
  assert.ok(html.includes(why),'Unavailable evidence cannot replace the action reason');
 }
 const stale={...unavailable,status:'stale',label:'Evidence stale',explanation:'Accepted momentum evidence is from an earlier completed session.',sourceSessionDate:'2026-09-10'};
 assert.match(render({evidence:stale,mobile}).html,/Evidence stale/);
 assert.match(render({evidence:stale,mobile}).html,/earlier completed session/);
 assert.match(render({evidence,mobile,row:{...holding,openedAt:null}}).html,/Momentum Intact/,'Missing holding date cannot remove verified momentum evidence');
 assert.match(render({evidence,mobile,row:{...holding,openedAt:'2025-01-09'}}).html,/Momentum Intact/,'Holding age cannot change the evidence badge');
 assert.match(render({evidence,mobile,row:{...holding,symbol:'IRDM'}}).html,/Acquisition Pending/);
 assert.doesNotMatch(render({evidence,mobile,row:{...holding,symbol:'CASH'}}).html,/momentumBadge|momentumEvidenceText|Rank improved/,'Cash has no momentum evidence classification');
}
for(const symbol of ['MRNA','MSTR'])for(const mobile of [false,true])for(const action of ['Hold','Buy','Sell']){
 for(const evidence of [unavailable,{classification:'Momentum Accelerating',status:'available',label:'Momentum Accelerating',tone:'accelerating',explanation:'Injected C1 rank improved from 5 to 2.',sourceSessionDate:'2026-09-11',limitations:[]}]){
  const {html,calls}=render({evidence,action,source:'legacy-core',mobile,row:{...holding,symbol,role:'Core'}});
  assert.equal(calls.length,0,`${symbol} Core must not request Swing momentum evidence`);
  assert.doesNotMatch(html,/momentumBadge|momentumEvidenceText|Evidence unavailable|Evidence stale|Momentum Accelerating|Momentum Intact|Momentum Weakening|Exit Risk|Injected C1 rank|As of \d{4}-\d{2}-\d{2}|<small>Evidence<\/small>/,'Core rows must have no momentum evidence presentation');
  assert.ok(html.includes(`>${action}</b>`),`Core ${symbol} must retain its ${action} action`);
  assert.ok(html.includes(why),'Core Why must remain unchanged');
  assert.match(html,/\$105\.00/,'Core price must remain unchanged');
  assert.match(html,/\$50\.00 \/ 5\.00%/,'Core gain/loss must remain unchanged');
  if(!mobile){
   const cells=[...html.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)];
   assert.equal(cells[3][1],'','Core desktop Evidence cell must stay blank');
  }
 }
}
const {c1PortfolioMomentumEvidence:resolver,c1MomentumRiskBasis}=modules.load('lib/c1MomentumEvidence.js');
const date=modules.load('lib/marketSession.js').latestCompletedMarketSessionDay(new Date());
for(const mobile of [false,true]){
 const evidence={contract:'c1-momentum-evidence-v1',classification:'Momentum Intact',status:'partial',label:'Momentum Intact',tone:'intact',explanation:'Rank 4 remains inside the top six. Rank trajectory unavailable.',sourceSessionDate:date,riskBasis:c1MomentumRiskBasis({symbol:holding.symbol}),limitations:['Rank trajectory unavailable.']};
 const active=render({evidence,mobile,resolver,date}).html;
 assert.match(active,/Momentum Intact/);
 assert.match(active,/Rank trajectory unavailable/,'Partial evidence limitations must remain visible');
 assert.match(active,new RegExp(`As of ${date}`),'Rendered evidence must carry the accepted session date');
 const stale=render({evidence,mobile,resolver,date,current:false}).html;
 assert.match(stale,/Evidence stale/);
 assert.doesNotMatch(stale,/Momentum Intact/,'Stale account state cannot display a supported classification');
 const changed=render({evidence:{...evidence,riskBasis:'prior-position-risk'},mobile,resolver,date}).html;
 assert.match(changed,/Evidence unavailable/,'Changed position risk cannot retain the prior momentum classification');
 assert.match(changed,/Position risk evidence changed/);
 assert.doesNotMatch(changed,/Momentum Intact/);
 assert.ok(changed.includes('>HOLD</b>')&&changed.includes(why),'Invalid evidence signature cannot change the holding status or remove its original explanation');
 assert.match(render({evidence:{},mobile,resolver,date}).html,/Evidence unavailable/,'An older server without serialized evidence cannot manufacture a label');
}
console.log('MOMENTUM EVIDENCE UI PASS: collapsed Swing evidence retains classifications and trust checks; action-first desktop/mobile holding status, original details, Core separation, price and gain/loss remain intact.');
