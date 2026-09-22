const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const page=fs.readFileSync('pages/index.js','utf8');
const source=page.slice(page.indexOf('  function rawPd(s){'),page.indexOf('  const rawDecisions='));
const loader=createResearchModuleLoader(process.cwd());
const actual=loader.load('lib/c1AccountDecision.js');
const holding={symbol:'AAA',role:'Swing',shares:10,avgCost:100,price:99,openedAt:'2026-09-11'};
const cash={symbol:'CASH',role:'Swing',shares:1000,avgCost:1};
const row={...holding,action:'Hold',stops:[{price:86}],exits:[],reviewRules:[],reason:'C1 hold'};
const decision={contract:'c1-account-decision-v1',current:true,sourceSessionDate:'2026-09-11',positions:[row],actualCash:1000};
let legacyCalls=0;
const box={accountView:null,accountHoldingMismatch:false,portfolio:[holding,cash],...actual,CASH:['CASH'],sym:s=>s.symbol,price:s=>s.price,rec:()=>({}),
 portfolioDecision:()=>{legacyCalls++;return {action:'Hold',reason:'Core analysis'};}};
vm.createContext(box);vm.runInContext(source+'\nthis.decide=rawPd;',box);
assert.equal(box.decide(holding).action,'Refresh required');
assert.equal(box.decide(cash).action,'Cash');
box.accountView={decision};assert.equal(box.decide(holding).action,'Hold');
assert.equal(box.decide({...holding,price:85}).action,'Stop review');
box.portfolio=[{...holding,shares:11},cash];box.accountHoldingMismatch=true;assert.equal(box.decide(holding).action,'Review');
box.portfolio=[holding,{...cash,shares:250}];box.accountHoldingMismatch=false;assert.equal(box.decide(holding).action,'Hold','A cash-only difference must not erase valid holding guidance');
box.portfolio=[holding,cash];box.accountView={decision:{...decision,current:false,positions:[{...row,action:'Refresh required'}]}};
assert.equal(box.decide(holding).action,'Refresh required');
assert.equal(legacyCalls,0,'No unavailable, mismatched, stale or valid Swing account may enter the legacy engine');
box.decide({...holding,role:'Core'});assert.equal(legacyCalls,1,'Core analysis is retained');
const fallback=page.slice(page.indexOf('{tab==="opportunities"&&!accountView'),page.indexOf('{tab==="portfolio"&&<>'));
assert.ok(fallback.includes('C1 analysis is unavailable'));
assert.doesNotMatch(fallback,/<Card|<OnDeck|opportunityDecision\(/,'Missing account must not show the superseded screener');
assert.doesNotMatch(page,/over the 35% concentration review level/);
assert.ok(page.includes('Existing holding guidance remains active; new purchases are paused until the cash history is reconciled.'),'Cash-only differences must be explained without suppressing holding decisions');

// Render the real component with Next's compiler and React, using only
// synthetic account data and a fixed regular-session clock.
const RealDate=Date;
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-14T14:00:00Z']));}static now(){return RealDate.parse('2026-09-14T14:00:00Z');}};
try{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const babel=require('next/dist/compiled/babel/core');
 const file=path.resolve('components/C1AccountOpportunities.js');
 const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 const modules=createResearchModuleLoader(process.cwd()),record={exports:{}};
 new Function('require','module','exports',code)(name=>name.startsWith('../lib/')?modules.load(name,file):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 const Component=record.exports.default;
 const current={...decision,decisionId:'synthetic',revision:2};
 const openingPlan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,quoteValidUntil:'2026-09-14T14:02:00Z',sourceSessionDate:current.sourceSessionDate,date:'2026-09-14',observedAt:new Date().toISOString(),sourceReceipt:{observedAt:new Date().toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},orders:[{id:'exit',symbol:'AAA',side:'sell',shares:10,estimatedPrice:99,phase:1},{id:'buy',symbol:'BBB',side:'buy',shares:5,estimatedPrice:100,phase:3}]};
 const {buildC1ManualRecommendations}=modules.load('lib/c1ManualRecommendations.js');
 const review=buildC1ManualRecommendations({decision:current,openingPlan});
 assert.equal(review.status,'ready');
 const props={decision:current,openingPlan,manualRecommendations:review,view:'portfolio'};
 const render=patch=>renderToStaticMarkup(React.createElement(Component,{...props,...patch}));
 const html=render({});
 assert.match(html,/sell 10 shares/);assert.match(html,/5 shares/);
 assert.ok(html.indexOf('Exits to review')<html.indexOf('C1 recommendation'),'Funded replacement buys follow exits');
 for(const patch of [{manualRecommendations:{...review,status:'waiting'}},{decision:{...current,revision:3}},{decision:{...current,current:false}},{manualRecommendations:{...review,validUntil:'2026-09-14T13:59:59Z'}}])assert.equal(render(patch),'','No orange action box without a current checked action');
 const conditional={...review,orders:[{...openingPlan.orders[0],condition:'stop-triggered'}]};
 assert.equal(render({manualRecommendations:conditional}),'' , 'Standing stops alone are not action instructions');
 console.log('PASS: real React action rendering, sell-before-buy sequence, expired/mismatched/conditional suppression, C1-only Swing authority and retained Core analysis.');
}finally{global.Date=RealDate;}
