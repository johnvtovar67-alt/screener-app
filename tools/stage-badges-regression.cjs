const assert=require('node:assert/strict');
const fs=require('node:fs');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const modules=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const page=fs.readFileSync('pages/index.js','utf8');
const {c1PositionPresentation}=modules.load('lib/c1PositionPresentation.js');
const {c1PlainDecisionReason,c1CompactMomentumEvidence,c1HoldingTiming}=modules.load('lib/c1DecisionCopy.js');
assert.ok(page.includes('<th>Why / Evidence</th>')&&!page.includes('<th>Evidence</th><th>Why</th>'),'Portfolio combines the existing reason and evidence into one column');
assert.doesNotMatch(page,/momentumEvidenceRows|momentumEvidenceBox|momentumEvidenceCompact|momentumEvidenceItem|Momentum Evidence/,'The redundant momentum summary strip must be absent');
assert.ok(page.includes('specialSituationBadge'),'Special-situation presentation must remain available');
assert.doesNotMatch(page,/stageTone\(|stageBadge|time\.stage|timeReviewRows/,'Duration stages must not appear as portfolio evidence');

// Render the production desktop and mobile row with controlled account evidence.
// Classification logic is tested independently; this boundary fixture verifies
// concise evidence preserves source reasons and current holding actions.
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
function render({evidence=unavailable,action='Hold',source='c1-actual-account',mobile=false,row=holding,accountMatches=true,accountHoldingMismatch=false,resolver,current=true,date='2026-09-11',positionData={}}={}){
 const calls=[],resolved=[],position={symbol:row.symbol,momentumEvidence:evidence,action,reason:why,
  exits:['Exit candidate','Sell'].includes(action)?[{reason:'rank-deterioration'}]:[],...positionData},accountView={decision:{contract:'c1-account-decision-v1',positions:[position],current,sourceSessionDate:date}},record={exports:{}};
 const bindings={...modules.load('lib/c1HoldPill.js'),accountView,accountMatches,accountHoldingMismatch,CASH:['CASH'],displayedPortfolioValue:10000,
  c1PositionPresentation,c1PlainDecisionReason,c1CompactMomentumEvidence,c1HoldingTiming,stocks:[row],portfolio:[row],
  c1PortfolioMomentumEvidence:args=>{calls.push(args);const result=resolver?resolver(args):args.position?.momentumEvidence||unavailable;resolved.push(result);return result;},
  pd:()=>({action,source,reason:why,openedAt:row.openedAt}),swingTimeReview:()=>({held:500,stage:'Long Swing Review'}),holdingReason:(s,d)=>d.reason,
  sym:s=>s.symbol,price:s=>s.price,cls:a=>a==='Hold'?'yellow':'red',factorFor:()=> 'Technology',portfolioDateDisplay:()=> 'Sep 11, 2026',
  specialSituation:s=>s.symbol==='IRDM'?{label:'Acquisition Pending'}:null,money:n=>'$'+Number(n).toFixed(2),pct:n=>Number(n).toFixed(2)+'%'};
 new Function('require','module','exports',...Object.keys(bindings),code)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports,...Object.values(bindings));
 const html=renderToStaticMarkup(React.createElement(record.exports.PortfolioRow,{s:row,mobile}));
 return {html,calls,accountView,resolved};
}
for(const [classification,tone] of classifications){
 const evidence={classification,status:'available',label:classification,tone,explanation:'Rank improved from 5 to 2; completed closes gained 3.1%.',sourceSessionDate:'2026-09-11',limitations:[]};
 for(const mobile of [false,true])for(const [action,displayAction] of [['Hold','HOLD'],['Add candidate','HOLD'],['Exit candidate','SELL — MOMENTUM EXIT'],['Buy','HOLD'],['Sell','SELL — MOMENTUM EXIT']]){
  const {html,calls,accountView}=render({evidence,action,mobile});
  assert.match(html,new RegExp(`class="momentumBadge ${tone}"[^>]*>${classification}<`),'The original badge renders the validated classification');
  assert.ok(html.includes(c1CompactMomentumEvidence(evidence)),'The original evidence field carries a concise supported explanation');
  assert.match(html,/As of 2026-09-11/,'The evidence field retains its accepted source date');
  assert.doesNotMatch(html,/Rank improved from 5 to 2|completed closes gained|7 of 30 trading sessions/,'Raw technical and confirmation narratives stay out of the restored slots');
  assert.ok(html.includes(`>${displayAction}</b>`),`${classification} must preserve ${action}`);
  assert.equal(accountView.decision.positions[0].reason,why,'Presentation preserves the independent decision explanation and trading-session restriction');
  assert.equal(accountView.decision.positions[0].momentumEvidence,evidence,'Hiding evidence does not rewrite the supplied assessment');
  const plain=c1PlainDecisionReason({action:displayAction,reason:c1PositionPresentation({decision:accountView.decision,position:accountView.decision.positions[0],symbol:holding.symbol,stock:holding}).reason,position:accountView.decision.positions[0],evidence});
  assert.equal(html.split(plain).length-1,1,'Each desktop/mobile holding renders exactly one plain-English reason');
  assert.doesNotMatch(html,/<details\b/,'The historical row has no rebuilt technical disclosure');
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
  assert.match(html,/Evidence unavailable/,'Unmatched holdings cannot inherit a supported evidence badge');
  assert.doesNotMatch(html,/Momentum Intact/,'Unavailable evidence cannot retain the prior classification');
  assert.equal(calls[0].position,undefined,'Unmatched Swing rows cannot inherit C1 evidence');
  assert.equal(calls[0].decision,null);
  assert.match(html,/Current momentum evidence is unavailable; additions are paused\./,'Unavailable account evidence retains the current no-add restriction');
  assert.equal(render({...patch,evidence,mobile}).accountView.decision.positions[0].reason,why,'Unavailable evidence cannot replace the source action reason');
 }
 const stale={...unavailable,status:'stale',label:'Evidence stale',explanation:'Accepted momentum evidence is from an earlier completed session.',sourceSessionDate:'2026-09-10'};
 const staleRender=render({evidence:stale,mobile});
 assert.equal(staleRender.resolved[0].status,'stale');
 assert.match(staleRender.resolved[0].explanation,/earlier completed session/,'The original stale-evidence limitation remains intact internally');
 assert.match(staleRender.html,/Evidence stale/,'Stale evidence retains its original status badge');
 assert.ok(staleRender.html.includes(c1CompactMomentumEvidence(stale)),'Stale evidence has an informative concise explanation');
 assert.doesNotMatch(staleRender.html,/earlier completed session/,'The full technical narrative is not reintroduced');
 assert.equal(render({evidence,mobile,row:{...holding,openedAt:null}}).resolved[0],evidence,'Missing holding date cannot change verified momentum evidence');
 assert.equal(render({evidence,mobile,row:{...holding,openedAt:'2025-01-09'}}).resolved[0],evidence,'Holding age cannot change the underlying evidence');
 const special=render({evidence,mobile,row:{...holding,symbol:'IRDM'}});
 assert.match(special.html,/Acquisition Pending/,'The original Swing badge retains special-situation context');
 assert.equal(special.accountView.decision.positions[0].symbol,'IRDM','Compact presentation does not reclassify a special-situation holding');
 const coreSpecial=render({evidence,mobile,source:'legacy-core',row:{...holding,symbol:'IRDM',role:'Core'}});
 assert.match(coreSpecial.html,/Acquisition Pending/,'The original Core badge retains special-situation context');
 assert.equal(coreSpecial.calls.length,0,'Core event context cannot request Swing momentum evidence');
 assert.doesNotMatch(render({evidence,mobile,row:{...holding,symbol:'CASH'}}).html,/momentumBadge|momentumEvidenceText|Rank improved/,'Cash has no momentum evidence classification');
}
for(const symbol of ['MRNA','MSTR'])for(const mobile of [false,true])for(const action of ['Hold','Buy','Sell']){
 for(const evidence of [unavailable,{classification:'Momentum Accelerating',status:'available',label:'Momentum Accelerating',tone:'accelerating',explanation:'Injected C1 rank improved from 5 to 2.',sourceSessionDate:'2026-09-11',limitations:[]}]){
  const {html,calls}=render({evidence,action,source:'legacy-core',mobile,row:{...holding,symbol,role:'Core'}});
  assert.equal(calls.length,0,`${symbol} Core must not request Swing momentum evidence`);
  assert.doesNotMatch(html,/momentumBadge|momentumEvidenceText|Evidence unavailable|Evidence stale|Momentum Accelerating|Momentum Intact|Momentum Weakening|Exit Risk|Injected C1 rank|As of \d{4}-\d{2}-\d{2}|<small>Evidence<\/small>/,'Core rows must have no momentum evidence presentation');
  assert.ok(html.includes(`>${action==='Hold'?'HOLD':action}</b>`),`Core ${symbol} must retain its ${action} action`);
  assert.equal(render({evidence,action,source:'legacy-core',mobile,row:{...holding,symbol,role:'Core'}}).accountView.decision.positions[0].reason,why,'Core source reason must remain unchanged');
  assert.ok(html.includes(c1PlainDecisionReason({action,reason:why})),'Core displays its plain reason without changing the underlying action');
  assert.match(html,/\$105\.00/,'Core price must remain unchanged');
  assert.match(html,/\$50\.00 \/ 5\.00%/,'Core gain/loss must remain unchanged');
  if(!mobile){
   const cells=[...html.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)];
   assert.equal(cells.length,6,'Core shares the six-column financial layout');
   assert.equal(cells[3][1],c1PlainDecisionReason({action,reason:why}),'Core combined cell contains only its unchanged reason');
  }
 }
}
const {c1PortfolioMomentumEvidence:resolver,c1MomentumRiskBasis}=modules.load('lib/c1MomentumEvidence.js');
const date=modules.load('lib/marketSession.js').latestCompletedMarketSessionDay(new Date());
for(const mobile of [false,true]){
 const evidence={contract:'c1-momentum-evidence-v1',classification:'Momentum Intact',status:'partial',label:'Momentum Intact',tone:'intact',explanation:'Rank 4 remains inside the top six. Rank trajectory unavailable.',sourceSessionDate:date,riskBasis:c1MomentumRiskBasis({symbol:holding.symbol}),limitations:['Rank trajectory unavailable.']};
 const activeRender=render({evidence,mobile,resolver,date}),active=activeRender.html;
 assert.equal(activeRender.resolved[0].classification,'Momentum Intact','Hiding evidence preserves the supported classification internally');
 assert.ok(activeRender.resolved[0].limitations.includes('Rank trajectory unavailable.'),'Partial evidence limitations remain unchanged at the existing evidence boundary');
 assert.match(active,/Momentum Intact/,'The validated supported classification is visible in the original badge');
 assert.ok(active.includes(c1CompactMomentumEvidence(activeRender.resolved[0])),'The validated evidence supplies the concise display explanation');
 assert.match(active,new RegExp(`As of ${date}`),'The original source date remains visible');
 assert.doesNotMatch(active,/Rank trajectory unavailable/,'The full technical limitation narrative is not repeated');
 const staleRender=render({evidence,mobile,resolver,date,current:false}),stale=staleRender.html;
 assert.equal(staleRender.resolved[0].status,'stale','Stale account state cannot establish supported momentum evidence');
 assert.match(stale,/Evidence stale/,'Stale evidence is visibly distinguished from supported evidence');
 assert.doesNotMatch(stale,/Momentum Intact/,'Stale account state cannot display a supported classification');
 const changedRender=render({evidence:{...evidence,riskBasis:'prior-position-risk'},mobile,resolver,date}),changed=changedRender.html;
 assert.equal(changedRender.resolved[0].label,'Evidence unavailable','Changed position risk cannot retain the prior momentum classification');
 assert.match(changedRender.resolved[0].explanation,/Position risk evidence changed/,'The evidence signature restriction remains intact internally');
 assert.doesNotMatch(changed,/Momentum Intact/);
 assert.ok(changed.includes('>HOLD</b>'),'Invalid evidence signature cannot change the holding status');
 assert.equal(render({evidence:{...evidence,riskBasis:'prior-position-risk'},mobile,resolver,date}).accountView.decision.positions[0].reason,why,'Invalid evidence signature cannot remove the original source explanation');
 const missing=render({evidence:{},mobile,resolver,date});
 assert.equal(missing.resolved[0].label,'Evidence unavailable','An older server without serialized evidence cannot manufacture a classification');
 assert.match(missing.html,/Evidence unavailable/,'Missing evidence is visibly unavailable');
 assert.doesNotMatch(missing.html,/Momentum Intact/,'Missing evidence cannot manufacture a supported classification');
}
console.log('MOMENTUM EVIDENCE UI PASS: original evidence slots show validated badges and concise explanations; internal freshness/risk trust, current actions, Core separation, price and gain/loss remain intact.');

// Existing row renderer: saved counter copy on desktop/mobile, never Core.
const timingPosition={stops:[{price:86}],reviewRules:[{sleeve:'base',heldSessions:12,minimumHold:30,close:105,rankVerified:true,profitProtectionArmed:true,earlyStreak:2,earlyConfirmations:3,profitStreak:1,profitConfirmations:2}],recentMomentumReviews:[{sleeve:'base',available:true,state:{streak:1,profitGivebackStreak:1,profitProtectionArmed:true},metrics:{confirmations:2}}]};
const timingEvidence={status:'available',label:'Momentum Weakening',tone:'weakening',sourceSessionDate:'2026-09-11'};
for(const mobile of [false,true]){
 const original=JSON.stringify(timingPosition),result=render({mobile,positionData:timingPosition,evidence:timingEvidence});
 for(const text of ['Holding period: 12/30 sessions · 18 remaining','Stop: not triggered at last C1 close','Profit protection: armed, not triggered','Rank momentum: 2/3 · 1 remaining','Profit rank: 1/2 · 1 remaining','Momentum: 1/2 · 1 remaining','Profit giveback: 1/2 · 1 remaining'])assert(result.html.includes(text),text);
 assert.equal(JSON.stringify(timingPosition),original);assert.equal(result.accountView.decision.positions[0].action,'Hold');
 const core=render({mobile,row:{...holding,symbol:'MSTR',role:'Core'},positionData:timingPosition,evidence:timingEvidence,source:'legacy-core'});assert.doesNotMatch(core.html,/Holding period:|Rank momentum:|Profit rank:/);
 const stale=render({mobile,positionData:timingPosition,evidence:{...timingEvidence,status:'stale'}});assert.doesNotMatch(stale.html,/12\/30|2\/3/);
}

// An actual newly recorded synthetic fill has no completed holding review.
// Pending text cannot manufacture momentum, replace missing old evidence,
// change current holding actions, or mutate any recorded/account bytes.
async function newHoldingCopy(){
 const f=require('./fixtures/c1-trading-workflow.cjs').createWorkflowFixture('buy');f.setCash(5000);
 const view=await f.prepare(),symbol=view.openingPlan.orders.find(o=>o.side==='buy').symbol;
 const shares=view.openingPlan.orders.filter(o=>o.side==='buy'&&o.symbol===symbol).reduce((n,o)=>n+o.shares,0);
 const posted=await f.prepare({id:'synthetic-wording-fill',symbol,side:'buy',shares:Math.max(1,Math.floor(shares/2)),price:100,fee:0,executedAt:f.now.toISOString()});
 const position=posted.decision.positions.find(p=>p.symbol===symbol);
 assert(position);assert.equal(position.momentumEvidence,undefined);
 const original=JSON.stringify(posted),decision=posted.decision;
 const pending=resolver({position,decision,now:f.now});
 assert.equal(pending.status,'pending');assert.equal(pending.classification,null);
 assert.equal(pending.label,'New holding — review pending');
 assert.equal(c1CompactMomentumEvidence(pending),'Awaiting first completed-session holding review.');
 for(const mobile of [false,true]){
  const rendered=render({mobile,row:{...holding,symbol,openedAt:position.openedAt},date:decision.sourceSessionDate,
   positionData:{...position,momentumEvidence:undefined},resolver:args=>resolver({...args,now:f.now})});
  assert.match(rendered.html,/New holding — review pending/);
  assert.match(rendered.html,/Awaiting first completed-session holding review/);
  assert.match(rendered.html,/>HOLD<\/b>/);assert.doesNotMatch(rendered.html,/Evidence unavailable|Momentum Intact/);
  const armed=render({mobile,positionData:{...timingPosition,recentMomentumReviews:[]},evidence:{...timingEvidence,classification:'Momentum Intact',label:'Momentum Intact'}});
  assert.equal((armed.html.match(/armed, not triggered/g)||[]).length,1);
 }
 for(const patch of [{shares:0},{openedAt:'2026-10-14'},{openedAt:'2026-10-16'},{exits:[{reason:'initial-stop'}]},
  {reviewRules:[{sleeve:'base'}]},{recentMomentumReviews:[{available:false}]},{momentumEvidence:{} }]){
  assert.notEqual(resolver({position:{...position,...patch},decision,now:f.now}).status,'pending');
 }
 assert.equal(resolver({position,decision:{...decision,current:false},now:f.now}).status,'stale');
 assert.equal(JSON.stringify(posted),original);assert.equal(f.writes,0);
 console.log('PASS: actual new-fill display, desktop/mobile pending review, no invented momentum, old/malformed/stale evidence retained, single armed status and zero writes');
}
newHoldingCopy().catch(error=>{console.error(error);process.exitCode=1;});

// Reproduce the reported recovering HOLD with conflicting, fully present
// momentum inputs through the real classifier, trust resolver and both rows.
const {classifyC1MomentumEvidence:classify}=modules.load('lib/c1MomentumEvidence.js');
const previousDate=modules.load('lib/marketSession.js').previousMarketSessionDay(date);
const mixedPosition={symbol:'MPC',shares:10,avgCost:100,action:'Hold',exits:[],stops:[{sleeve:'base',shares:10,price:86}],
 reviewRules:[{sleeve:'base',heldSessions:4,minimumHold:30,close:110,exitBuffer:6,verifiedRank:2,rankVerified:true,profitProtectionArmed:false,earlyStreak:0,earlyConfirmations:3}],
 recentMomentumReviews:[{sleeve:'base',available:true,entryAllowed:true,metrics:{recovery:true},state:{streak:0,profitGivebackStreak:0}}]};
const mixedInput={contract:'c1-momentum-evidence-input-v1',sourceSessionDate:date,limitations:[],observations:[previousDate,date].map(day=>({date:day,close:110,
 ranks:{base:{rank:2,eligible:true,eligibleCount:100,source:'authoritative-opportunities',verified:true}},
 timing:{available:true,asOf:day,ret5:-1,sma20Slope:0.7,macdImproving:true,relativeStrengthVerified:true,alpha20VsSpy:5,alpha60VsSpy:8}}))};
const classified=input=>classify({position:mixedPosition,input,current:true,sourceSessionDate:date});
const mixed=classified(mixedInput),originalMixed=JSON.stringify({position:mixedPosition,input:mixedInput});
assert.equal(mixed.label,'Mixed momentum');assert.equal(mixed.classification,null);
const absentRelative=JSON.parse(JSON.stringify(mixedInput));absentRelative.observations.at(-1).timing.relativeStrengthVerified=false;
const missing=classified(absentRelative);assert.equal(missing.label,'Evidence unavailable');
const partialInput=JSON.parse(JSON.stringify(mixedInput));partialInput.observations[0].ranks.base.eligibleCount=99;
const partial=classified(partialInput);assert.equal(partial.label,'Mixed momentum');assert.equal(partial.status,'partial');
for(const mobile of [false,true]){
 for(const [evidence,text] of [[mixed,'Verified momentum signals are mixed.'],[missing,'Momentum evidence incomplete: relative strength.'],[partial,'Momentum signals are mixed; some supporting evidence is incomplete.']]){
  const rendered=render({mobile,evidence,date,resolver,row:{...holding,symbol:'MPC'},positionData:mixedPosition});
  assert.ok(rendered.html.includes(text),'The real desktop/mobile supporting field explains the exact unclassified state');
  assert.ok(rendered.html.includes('>HOLD</b>'));assert.doesNotMatch(rendered.html,/>BUY<|>SELL/);
  assert.ok(rendered.html.includes('Recent momentum is recovering; no sell signal confirmed.'));
  assert.ok(rendered.html.includes('Holding period: 4/30 sessions · 26 remaining'));
  assert.ok(rendered.html.includes(`As of ${date}`));
  assert.equal(rendered.accountView.decision.positions[0].action,'Hold');
 }
 assert.doesNotMatch(render({mobile,evidence:mixed,date,resolver,row:{...holding,symbol:'MPC'},positionData:mixedPosition}).html,/Evidence unavailable/);
 const stale=render({mobile,evidence:mixed,date,resolver,current:false,row:{...holding,symbol:'MPC'},positionData:mixedPosition});
 assert.match(stale.html,/Evidence stale/);assert.doesNotMatch(stale.html,/Mixed momentum|signals are mixed/);
 const changed=render({mobile,evidence:mixed,date,resolver,row:{...holding,symbol:'MPC'},positionData:{...mixedPosition,stops:[{sleeve:'base',shares:10,price:87}]}});
 assert.match(changed.html,/Evidence unavailable/);assert.match(changed.html,/Momentum assessment awaits review of the updated position/);
 assert.doesNotMatch(changed.html,/Mixed momentum|signals are mixed/);
}
assert.equal(JSON.stringify({position:mixedPosition,input:mixedInput}),originalMixed,'Display must preserve all position and source bytes');
for(const [limitation,part] of [
 ['Verified momentum rank is unavailable.','rank'],['Technical price trend evidence is unavailable.','price trend'],
 ['Technical price evidence is stale or dated to a different session.','price trend'],['Accepted closing price is unavailable.','closing price'],
 ['No recorded stop level is available.','stop level'],['Recent-momentum decision evidence is unavailable; missing data is not observed deterioration.','recent-momentum review']]){
 assert.equal(c1CompactMomentumEvidence({...missing,limitations:[limitation]}),`Momentum evidence incomplete: ${part}.`);
}
assert.equal(c1CompactMomentumEvidence({...missing,limitations:['provider-secret-sentinel'],explanation:'untrusted-secret-sentinel'}),'Verified momentum evidence is unavailable.');
console.log('PASS: mixed versus missing evidence through actual desktop/mobile rows; recovering HOLD, counters, freshness, risk signature and input bytes preserved; fixed concise limitation mapping only.');
