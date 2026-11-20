// Display-only regression using public classifications and fictional ownership.
// Actual label helper and extracted production PortfolioRow JSX; no API or writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),{portfolioSectorLabel}=loader.load('lib/portfolioSectorLabel.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const date='2026-11-19',dated=(symbol,sector,sourceSessionDate=date)=>({sourceSessionDate:date,stockScreen:{sourceSessionDate,candidates:[{symbol,sector}]}});
const plan=(symbol,sector,extra={})=>({providerVerified:true,sourceSessionDate:date,accountExposure:{holdings:[{symbol,sector}]},...extra});
const cases=[
 ['Core MSTR without a Swing account decision',{stock:{symbol:'MSTR',role:'Core'}},'Technology · Theme: Bitcoin / Digital Assets'],
 ['MTD without metadata',{stock:{symbol:'MTD',role:'Swing'}},'Healthcare'],
 ['MTD unknown metadata cannot mask its verified display profile',{stock:{symbol:'MTD',sector:'Other'},decision:dated('MTD','Unknown')},'Healthcare'],
 ['known dated candidate wins live/profile and held sources',{stock:{symbol:'MTD',sector:'Industrials'},decision:dated('MTD','Accepted source sector'),position:{entryContext:{sector:'Held source sector'}},openingPlan:plan('MTD','Opening source sector')},'Accepted source sector'],
 ['unknown candidate falls back to held metadata',{stock:{symbol:'ZZQA',sector:'Live source sector'},decision:dated('ZZQA','Other'),position:{entryContext:{sector:'Held source sector'}}},'Held source sector'],
 ['candidate from another source date is ignored',{stock:{symbol:'ZZQA',sector:'Live source sector'},decision:dated('ZZQA','Wrong-date sector','2026-11-18')},'Live source sector'],
 ['candidate for another symbol is ignored',{stock:{symbol:'ZZQA',sector:'Live source sector'},decision:dated('ZZQB','Wrong-symbol sector')},'Live source sector'],
 ['verified same-source opening exposure supplies absent holding metadata',{stock:{symbol:'ZZQA'},decision:{sourceSessionDate:date},openingPlan:plan('ZZQA','Opening source sector')},'Opening source sector'],
 ['unverified opening exposure is ignored',{stock:{symbol:'ZZQA'},decision:{sourceSessionDate:date},openingPlan:plan('ZZQA','Unverified sector',{providerVerified:false})},'Sector unavailable'],
 ['wrong-date opening exposure is ignored',{stock:{symbol:'ZZQA'},decision:{sourceSessionDate:date},openingPlan:plan('ZZQA','Wrong-date sector',{sourceSessionDate:'2026-11-18'})},'Sector unavailable'],
 ['opening exposure for another symbol is ignored',{stock:{symbol:'ZZQA'},decision:{sourceSessionDate:date},openingPlan:plan('ZZQB','Wrong-symbol sector')},'Sector unavailable'],
 ['opening exposure without a dated account source is ignored',{stock:{symbol:'ZZQA'},openingPlan:plan('ZZQA','Unbound sector')},'Sector unavailable'],
 ['stock sector remains available without account metadata',{stock:{symbol:'ZZQA',sector:'  Industrials  '}},'Industrials'],
 ['MSTR theme stays separately labelled when a known sector is available',{stock:{symbol:'MSTR',sector:'Technology'},decision:dated('MSTR','Technology')},'Technology · Theme: Bitcoin / Digital Assets'],
 ['unknown unrelated holding stays unknown',{stock:{symbol:'ZZQA',primaryTheme:'Interesting theme',sector:'Unknown'},decision:dated('ZZQA','Unclassified')},'Sector unavailable'],
 ['normalization supports lowercase/ticker display data',{stock:{ticker:' mtd ',sector:'N/A'}},'Healthcare'],
];
for(const [name,input,expected] of cases){
 const before=JSON.stringify(input);freeze(input);
 assert.equal(portfolioSectorLabel(input),expected,name);
 assert.equal(JSON.stringify(input),before,name+': classification cannot mutate account, holding or exposure evidence');
}
for(const missing of ['Other','UNKNOWN','Unclassified','Unavailable','Sector unavailable','N/A','NA','None','null','undefined','—','-','']){
 const input=freeze({stock:{symbol:'ZZQA',sector:missing},decision:dated('ZZQA',missing),position:{entryContext:{sector:missing}},openingPlan:plan('ZZQA',missing)});
 assert.equal(portfolioSectorLabel(input),'Sector unavailable','Missing labels do not become classification evidence: '+missing);
}

// Render the exact production row function, including both existing branches.
// Only surrounding Home state/formatters are supplied; policy presentation and
// holding-copy functions below are the real modules used by the application.
const page=fs.readFileSync('pages/index.js','utf8');
assert(page.includes("import {portfolioSectorLabel} from '../lib/portfolioSectorLabel';"),'Home imports the real display helper');
const start=page.indexOf('  function PortfolioRow({s,mobile=false}){'),end=page.indexOf('\n  const missingOpenDateSymbols=',start);
assert(start>=0&&end>start,'The actual Home PortfolioRow is available');
const rowSource=page.slice(start,end);
assert.equal(rowSource.split('portfolioSectorLabel({stock:s,decision:accountDecision,position,openingPlan:accountView?.openingPlan})').length,2,'Both layouts share the actual metadata helper call');
const {c1PositionPresentation:present}=loader.load('lib/c1PositionPresentation.js');
const {c1PlainDecisionReason,c1HoldingTiming}=loader.load('lib/c1DecisionCopy.js');
const {c1HoldPillLabel,c1HoldPillStyle}=loader.load('lib/c1HoldPill.js');
class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-11-20T16:00:00Z']));}static now(){return Date.parse('2026-11-20T16:00:00Z');}}
const position=freeze({symbol:'MTD',shares:10,avgCost:100,totalCost:1000,openedAt:'2026-11-10',stops:[{sleeve:'base',shares:10,price:88}],exits:[{sleeve:'base',shares:10,reason:'recent-momentum-deterioration'}],reviewRules:[]});
const accountView=freeze({decision:{contract:'c1-account-decision-v1',sourceSessionDate:date,current:true,revision:1,brokerageCash:600,positions:[position],stockScreen:{sourceSessionDate:date,candidates:[]}}});
const seen={labels:[],presentations:[]};
const scope={React,Date:Clock,accountView,stopOwnershipCurrent:true,accountHoldingMismatch:false,CASH:['CASH'],displayedPortfolioValue:2600,
 sym:s=>String(s.symbol||s.ticker||'').trim().toUpperCase(),pd:s=>({source:'c1-actual-account',action:'Hold',openedAt:s.openedAt,reason:'Fictional existing holding reason.'}),
 portfolioSectorLabel:input=>{seen.labels.push(input);return portfolioSectorLabel(input);},
 c1PositionPresentation:input=>{seen.presentations.push(input);return present(input);},
 stopQuoteRow:s=>s,swingTimeReview:()=>null,momentumEvidenceFor:()=>({tone:'yellow',label:'Fictional momentum evidence',status:'unavailable',sourceSessionDate:date}),
 c1PlainDecisionReason,c1HoldingTiming,c1HoldPillLabel,c1HoldPillStyle,holdingReason:(s,d)=>d.reason,cls:()=> 'yellow',specialSituation:()=>null,
 portfolioDateDisplay:value=>value,money:value=>'$'+Number(value).toFixed(2),pct:value=>Number(value).toFixed(2)+'%',price:s=>Number(s.price),
};
const compiled=babel.transformSync("import React from 'react';\nconst {"+Object.keys(scope).filter(key=>key!=='React').join(',')+'}=scope;\n'+rowSource+'\nmodule.exports=PortfolioRow;',
 {filename:path.resolve('pages/index.js'),babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const record={exports:{}};
new Function('require','module','exports','scope',compiled)(name=>name==='react'?React:require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports,scope);
const PortfolioRow=record.exports;
const rows=[
 freeze({symbol:'MSTR',role:'Core',shares:12,avgCost:100,price:110,value:1320,gainLoss:120,gainLossPct:10,openedAt:'2026-11-10'}),
 freeze({symbol:'MTD',role:'Swing',shares:10,avgCost:100,price:100,value:1000,gainLoss:0,gainLossPct:0,openedAt:'2026-11-10'}),
 freeze({symbol:'ZZQA',role:'Core',shares:2,avgCost:40,price:40,value:80,gainLoss:0,gainLossPct:0}),
 freeze({symbol:'CASH',role:'Core',shares:600,avgCost:1,price:1,value:600,gainLoss:0,gainLossPct:0}),
];
const original=JSON.stringify({rows,accountView});
for(const s of rows)for(const mobile of [true,false]){
 const html=renderToStaticMarkup(React.createElement(PortfolioRow,{s,mobile}));
 assert(html.startsWith(mobile?'<article class="portfolioItem">':'<tr>'),'Actual '+(mobile?'mobile':'desktop')+' layout renders');
 assert(html.includes(s.role+' · '),'Holding role remains visible');
 const label=seen.labels.at(-1);assert.equal(label.stock,s,'The actual row passes its unchanged holding to the label helper');
 if(s.symbol==='MSTR'){
  assert.equal(label.decision,null,'Core metadata does not require or appropriate a Swing decision');
  assert(html.includes('Technology · Theme: Bitcoin / Digital Assets'));assert(html.includes('HOLD'),'Existing Core Hold action remains unchanged');
 }else if(s.symbol==='MTD'){
  assert.equal(label.position,position);assert(html.includes('Healthcare'));
  const input=seen.presentations.at(-1);assert.equal(input.position,position);assert.equal(input.stock,s);assert.equal(input.decision,accountView.decision);
  assert(html.includes(c1HoldPillLabel(present(input).label)),'The real holding presentation retains its existing action');
  assert(html.includes('SELL — MOMENTUM EXIT'),'A sector fallback cannot withdraw or reinterpret the actual pending Sell');
  assert.equal(input.position.shares,10);assert.equal(input.position.avgCost,100);assert.deepEqual(input.position.stops,[{sleeve:'base',shares:10,price:88}]);
 }else if(s.symbol==='ZZQA')assert(html.includes('Sector unavailable'),'The actual layout preserves honest unknown metadata');
 else {assert(html.includes('$600.00')&&html.includes('$1.00/share'),'Existing cash value and cash unit remain unchanged');if(mobile)assert(html.includes('Dry Powder'));}
}
assert.equal(JSON.stringify({rows,accountView}),original,'Actual row rendering cannot modify shares, role, cash, basis, stops, actions or account evidence');
console.log('PASS: display-only sector precedence, unknown/date/verification fallbacks and distinct MSTR theme; actual desktop/mobile PortfolioRow renders known/unknown/Core/Swing/cash rows with unchanged financial inputs and existing Sell/Hold actions.');
