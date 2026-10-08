const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const modules=createResearchModuleLoader(process.cwd());
function component(relative){
 const file=path.resolve(relative),record={exports:{}};
 const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',code)(name=>name.startsWith('../lib/')?modules.load(name,file):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 return record.exports.default;
}
const RealDate=Date;
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-14T14:00:00Z']));}static now(){return RealDate.parse('2026-09-14T14:00:00Z');}};
try{
 const Cash=component('components/C1BrokerageCash.js'),Opportunities=component('components/C1AccountOpportunities.js');
 const holding={symbol:'AAA',role:'Swing',shares:10,avgCost:100,price:99,openedAt:'2026-09-11',action:'Hold',stops:[{price:86}],exits:[],reviewRules:[],reason:'C1 hold'};
 const candidate=(symbol,rank)=>({symbol,sector:rank===1?'Technology':'Health',issuer:'name:'+symbol,sourcePrice:100,researchRank:rank,momentumPercentile:100-rank,sourceTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}});
 const decision={contract:'c1-account-decision-v1',decisionId:'synthetic-cash',revision:2,current:true,sourceSessionDate:'2026-09-11',positions:[holding],strategyCash:3037.90,actualCash:3037.90,brokerageCash:363.36,executableCash:363.36,brokerageCashCurrent:true,brokerageCashObservedAt:new Date().toISOString(),stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:'2026-09-11',candidates:[candidate('BBB',1),candidate('CCC',2)]}};
 const row=(symbol,pass=true)=>({symbol,price:100,eventRisk:{status:'Clear'},entryTiming:{available:true,liquidityPass:pass,averageDollarVolume20:pass?500000000:100000000},recommendation:{expertDecision:{strongBuyPass:false,metrics:{quoteFreshnessPass:true}}}});
 const screenRows=[row('BBB'),row('CCC',false)];
 const openingPlan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,quoteValidUntil:'2026-09-14T14:02:00Z',sourceSessionDate:decision.sourceSessionDate,date:'2026-09-14',observedAt:new Date().toISOString(),sourceReceipt:{observedAt:new Date().toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},orders:[{id:'exit',symbol:'AAA',side:'sell',shares:10,estimatedPrice:99,phase:1}],entryReviews:[{symbol:'BBB',reason:'brokerage-cash-insufficient'}]};
 const {buildC1ManualRecommendations}=modules.load('lib/c1ManualRecommendations.js');
 const renderCash=patch=>renderToStaticMarkup(React.createElement(Cash,{decision:{...decision,...patch},onSave:()=>{}}));
 const cash=renderCash({});
 assert.match(cash,/Brokerage cash: \$363\.36/);assert.match(cash,/C1 strategy cash: \$3,037\.90/);assert.match(cash,/Available to deploy: \$363\.36/);
 assert.match(cash,/aria-label="Actual brokerage cash"/);assert.match(cash,/Update Brokerage Cash/);
 const missing=renderToStaticMarkup(React.createElement(Cash,{onSave:()=>{}}));
 assert.match(missing,/Connect and load the saved C1 account/);assert.match(missing,/<input[^>]*disabled/);assert.match(missing,/<button[^>]*disabled/);
 assert.match(renderCash({brokerageCashCurrent:false,brokerageCashReason:'Brokerage cash is from an earlier Eastern date.'}),/Brokerage cash is from an earlier Eastern date/);
 for(const balance of [363.36,0]){
  const current={...decision,brokerageCash:balance,executableCash:balance};
  const review=buildC1ManualRecommendations({decision:current,openingPlan});
  assert.equal(review.status,'ready');
  const props={decision:current,openingPlan,manualRecommendations:review,screenRows,screenCurrent:true};
  const opportunities=renderToStaticMarkup(React.createElement(Opportunities,props));
  assert.match(opportunities,/C1 strategy cash: \$3,037\.90/);
  assert.match(opportunities,new RegExp('Brokerage cash: \\$'+balance.toFixed(2).replace('.','\\.')));
  assert.match(opportunities,/<h3[^>]*>BBB<\/h3><b[^>]*>Buy<\/b>/,'A cash cap cannot downgrade the Buy signal');
  assert.match(opportunities,/C1 qualifies this stock, but available brokerage cash is insufficient for a new purchase/);
  assert.match(opportunities,/aria-label="Watch opportunities"/);assert.match(opportunities,/<b[^>]*>CCC<\/b>/,'Existing Watch analysis remains visible');
  assert.doesNotMatch(opportunities,/currently ineligible|Buy \d+ shares/);
  const exits=renderToStaticMarkup(React.createElement(Opportunities,{...props,view:'portfolio'}));
  assert.match(exits,/sell 10 shares/,'Zero brokerage cash must preserve checked exits');
  assert.doesNotMatch(exits,/C1 recommendation/);
 }
 const oldAccount={...decision,brokerageCash:null,executableCash:0,brokerageCashCurrent:false,brokerageCashReason:'Enter current brokerage cash.'};
 const oldHtml=renderToStaticMarkup(React.createElement(Opportunities,{decision:oldAccount,screenRows,screenCurrent:true}));
 assert.match(oldHtml,/Brokerage cash: Not entered/);assert.match(oldHtml,/<h3[^>]*>BBB<\/h3><b[^>]*>Buy<\/b>/);assert.match(oldHtml,/Watch opportunities/);assert.match(oldHtml,/Enter current brokerage cash/);
 console.log('PASS: real React cash editor renders separate balances; low, zero and missing broker cash retain Buy/Watch analysis and checked exits without authorizing purchases.');
}finally{global.Date=RealDate;}
