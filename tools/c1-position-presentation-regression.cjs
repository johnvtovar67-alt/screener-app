// Action-first presentation only: synthetic account rows and existing React /
// Next tooling. No provider, account storage, decision, cash, or order mutation.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const RealDate=Date;
const instant='2026-10-15T15:00:00.000Z';
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return RealDate.parse(instant);}};
let assertions=0;
const ok=(value,message)=>{assertions++;assert.ok(value,message);};
const eq=(actual,expected,message)=>{assertions++;assert.equal(actual,expected,message);};
const same=(actual,expected,message)=>{assertions++;assert.equal(JSON.stringify(actual),JSON.stringify(expected),message);};
const match=(value,pattern,message)=>{assertions++;assert.match(value,pattern,message);};
const absent=(value,pattern,message)=>{assertions++;assert.doesNotMatch(value,pattern,message);};
const copy=value=>JSON.parse(JSON.stringify(value));
const source='2026-10-14';
const technical='Technical detail sentinel: 1/3/5-session returns, MACD histogram, top-six rank and confirmation streaks.';
try{
 const modules=createResearchModuleLoader(process.cwd());
 const helpers=modules.load('lib/c1PositionPresentation.js');
 const {c1PositionPresentation:present}=helpers;
 const {buildC1ManualRecommendations}=modules.load('lib/c1ManualRecommendations.js');
 function holding(symbol='DELL',patch={}){
  return {symbol,shares:10,avgCost:100,openedAt:'2026-10-01',action:'Hold',exits:[],stops:[{sleeve:'base',shares:10,price:86}],
   reviewRules:[{sleeve:'base',heldSessions:9,minimumHold:30,exitBuffer:6,close:symbol==='MPC'?115:90}],reason:technical,...patch};
 }
 function decisionFor(position,patch={}){
  return {contract:'c1-account-decision-v1',decisionId:'synthetic-action-first:1',revision:1,current:true,sourceSessionDate:source,
   positions:[position],opportunities:[],orders:[{id:'unchanged-original',symbol:'KEEP',side:'buy',shares:2}],
   strategyCash:5000,actualCash:5000,brokerageCash:1000,executableCash:1000,brokerageCashCurrent:true,...patch};
 }
 function quote(symbol='DELL',price=85,patch={}){
  return {symbol,role:'Swing',shares:10,avgCost:100,price,value:price*10,weightPct:10,gainLoss:(price-100)*10,gainLossPct:price-100,
   openedAt:'2026-10-01',timestamp:RealDate.parse('2026-10-15T14:59:00Z')/1000,_fmpQuoteCache:'live',...patch};
 }
 function args(position=holding(),stock=quote(),patch={}){
  return {decision:decisionFor(position),position,symbol:position.symbol,stock,now:new Date(),...patch};
 }
 function unchanged(input,message){const before=copy(input);const result=present(input);same(input,before,message);return result;}

 // A fresh verified quote through an existing stop gives an unambiguous action.
 {
  const input=args(),result=unchanged(input,'Presentation preserves source holdings, orders, cash, prices and stop evidence');
  eq(result.label,'SELL — STOP TRIGGERED','DELL stop breach has the exact requested primary label');
  eq(result.action,'Sell','The presentation leads with a Sell action');
  eq(result.stopTriggered,true,'The stop reason is explicit');
  eq(result.quoteVerified,true,'The new stop display is supported by verified current quote evidence');
  eq(result.quoteValidUntil,'2026-10-15T15:14:00.000Z','A current stock quote has an exact fifteen-minute presentation deadline');
  eq(present({...input,now:new Date('2026-10-15T15:14:00.001Z')}).label,'HOLD','The stock quote cannot create a new stop Sell after its exact deadline');
  eq(present({...input,stock:quote('DELL',85,{timestamp:RealDate.parse('2026-10-15T19:59:30Z')/1000}),now:new Date('2026-10-15T19:59:45Z')}).quoteValidUntil,'2026-10-15T20:00:00.000Z','An intraday quote deadline is capped at the regular-session close');
  ok(result.reason.length<=220,'The primary stop explanation remains brief');
  absent(result.reason,/MACD|histogram|top-six|confirmation streak|1\/3\/5/i,'Technical detail does not compete with the primary stop action');
  absent(result.reason,/already sold|sale executed|order submitted|broker confirmed/i,'A Sell recommendation never claims a broker execution');
 }

 // Server-verified intraday evidence may live only on executionDecision. Its
 // expiry/source/revision checks still apply before displaying a new stop Sell.
 {
  const position=holding('DELL',{action:'Review'}),decision=decisionFor(position);
  const advisory={kind:'intraday-advisory',sourceSessionDate:source,observedAt:'2026-10-15T14:59:00.000Z',price:85,
   changeFromCompletedClosePct:(85/90-1)*100,completedConfirmationsUnchanged:true};
  const executionDecision={...decision,positions:[{...position,intradayMomentumAdvisory:advisory}]};
  const input={...args(position,quote('DELL',85,{timestamp:undefined})),decision,executionDecision};
  eq(unchanged(input,'Verified execution observations remain immutable').label,'SELL — STOP TRIGGERED','Execution-only verified current evidence can display an existing stop breach');
  eq(present(input).quoteValidUntil,'2026-10-15T15:01:00.000Z','An execution advisory has an exact two-minute presentation deadline');
  eq(present({...input,now:new Date('2026-10-15T15:01:00.001Z')}).label,'HOLD','The execution advisory cannot create a stop Sell after its exact deadline');
  for(const [name,patch] of Object.entries({expired:{observedAt:'2026-10-15T14:57:59Z'},future:{observedAt:'2026-10-15T15:00:01Z'},wrongSource:{sourceSessionDate:'2026-10-13'},unverified:{completedConfirmationsUnchanged:false}})){
   const candidate={...input,executionDecision:{...executionDecision,positions:[{...position,intradayMomentumAdvisory:{...advisory,...patch}}]}};
   eq(present(candidate).label,'HOLD',`${name}: advisory metadata cannot manufacture a stop Sell`);
  }
  eq(present({...input,executionDecision:{...executionDecision,revision:2}}).label,'HOLD','Another execution revision cannot supply current quote authority');
  eq(present(args(holding('MPC',{action:'Review',momentumEvidence:{status:'available',classification:'Exit Risk',label:'Exit Risk'}}),quote('MPC',115))).label,'HOLD','An informational risk badge alone is not a confirmed Sell');
  eq(present(args(holding('MSTR',{role:'Core'}),quote('MSTR',85,{role:'Core'}))),null,'Core holdings remain outside C1 Swing presentation logic');
 }

 // A display value alone, stale quote or future observation cannot create Sell.
 for(const [name,patch] of Object.entries({
  missingTimestamp:{timestamp:undefined},missingCacheProvenance:{_fmpQuoteCache:undefined},expired:{timestamp:RealDate.parse('2026-10-15T14:44:59Z')/1000},
  previousSession:{timestamp:RealDate.parse('2026-10-14T19:00:00Z')/1000},future:{timestamp:RealDate.parse('2026-10-15T15:00:01Z')/1000},
  stale:{stale:true},fallback:{staleFallback:true},clientFallback:{clientSnapshotFallback:true},feedStale:{dataFeedSnapshotStale:true},
  cachedStale:{_fmpQuoteCache:'stale-fallback'},quoteError:{error:'Quote unavailable'},missingPrice:{price:null},
 })){
  const position=holding('DELL',{action:'Stop review'}),input=args(position,quote('DELL',85,patch));
  const result=unchanged(input,`${name}: the original account evidence remains intact`);
  eq(result.label,'HOLD',`${name}: unverified display information cannot create a new Sell instruction`);
  eq(result.stopTriggered,false,`${name}: no new stop trigger is manufactured`);
  if(name==='missingTimestamp')match(result.reason,/unverified|verify|verification/i,'An unverified apparent stop breach has a plain verification caveat');
 }

 // Existing confirmed exits keep their actual priority; expired live pricing
 // cannot erase a stop already confirmed in accepted account evidence.
 {
  const stopped=holding('DELL',{action:'Exit candidate',exits:[{sleeve:'base',shares:10,reason:'initial-stop'}],stopTriggerEvidence:{date:source,low:84,stop:86}});
  eq(present(args(stopped,quote('DELL',85,{timestamp:undefined}))).label,'SELL — STOP TRIGGERED','An authoritative pending stop survives unavailable live pricing');
  for(const reason of ['recent-momentum-deterioration','recent-momentum-profit-protection','rank-deterioration','early-rank-deterioration','profit-rank-deterioration']){
   const position=holding('MPC',{action:'Exit candidate',exits:[{sleeve:'base',shares:10,reason}]});
   const result=present(args(position,quote('MPC',115)));
   eq(result.label,'SELL',`${reason}: confirmed account exit has a clear Sell presentation`);
   eq(result.stopTriggered,false,`${reason}: a momentum or rank exit is not relabeled as a stop`);
   absent(result.reason,/already sold|sale executed|order submitted|broker confirmed/i,`${reason}: recommendation cannot invent execution`);
  }
 }

 // A profitable holding without an exit gets one short holding explanation,
 // including Review/missing states, with existing Buy/Add proposals separate.
 {
  const position=holding('MPC'),input=args(position,quote('MPC',115));
  const result=present(input);
  eq(result.label,'HOLD','MPC without a confirmed exit presents Hold');
  ok(result.reason.length<=220,'The Hold explanation is a brief primary sentence');
  eq((result.reason.match(/[.!?](?=\s+[A-Z]|$)/g)||[]).length,1,'The primary Hold explanation is one sentence');
  absent(result.reason,/MACD|histogram|top-six|confirmation streak|1\/3\/5/i,'The Hold headline excludes technical calculation detail');
  for(const action of ['Review','Refresh required','Price/stop review','Add candidate'])eq(present(args(holding('MPC',{action}),quote('MPC',115))).label,'HOLD',`${action}: no-exit holding status remains Hold`);
  eq(present({...input,decision:{...input.decision,current:false}}).label,'HOLD','Stale account status cannot manufacture Sell');
  const openingPlan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,sourceSessionDate:source,date:'2026-10-15',observedAt:instant,quoteValidUntil:'2026-10-15T15:10:00Z',
   sourceReceipt:{observedAt:instant,membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},orders:[{id:'checked-add',symbol:'MPC',side:'buy',shares:2,estimatedPrice:115}]};
  const manualRecommendations=buildC1ManualRecommendations({decision:input.decision,openingPlan,now:new Date()});
  eq(manualRecommendations.status,'ready','The Add fixture has existing current checked authority');
  const checked={...input,openingPlan,manualRecommendations,checkedAddOrders:openingPlan.orders};
  const before=copy(checked),added=present(checked);
  eq(added.label,'HOLD','An authorized Add proposal does not replace the held-position Hold status');
  eq(added.canAdd,true,'Existing checked Add authority remains available separately');
  eq(added.reason,result.reason,'The holding explanation does not change when a separate Add proposal exists');
  same(added.addOrders,openingPlan.orders,'The presentation preserves the exact checked Add quantities');
  same(checked,before,'Presenting separate Add authority does not rewrite orders, cash or holdings');
  for(const [name,patch] of Object.entries({unverifiedStop:{stock:quote('MPC',85,{_fmpQuoteCache:undefined})},missingRecent:{position:{...position,recentMomentumReviews:[{available:false}]}}})){
   const candidate={...checked,...patch},snapshot=copy(candidate),blocked=present(candidate);
   eq(blocked.label,'HOLD',`${name}: unconfirmed evidence does not create a Sell`);
   eq(blocked.canAdd,false,`${name}: a do-not-add holding explanation has no visible Add authorization`);
   same(blocked.addOrders,[],`${name}: unsupported capital proposals are hidden`);
   same(candidate,snapshot,`${name}: original checked quantities and account records remain unchanged`);
  }
 }

 const page=fs.readFileSync('pages/index.js','utf8');
 // Exercise the actual Home expiry effect rather than relying on the minute
 // market-state poll. This affects presentation state only.
 {
  const marker='  useEffect(()=>{\n    const decision=accountView?.decision,now=new Date();';
  const start=page.indexOf(marker),end=page.indexOf('\n  useEffect(',start+marker.length);
  ok(start>=0&&end>start,'Home has the presentation-specific quote expiry effect');
  let effect,scheduled,cleared,updates=0;
  const position=holding(),decision=decisionFor(position),stock=quote();
  new Function('useEffect','accountView','results','stocks','marketState','c1PositionPresentation','sym','setTimeout','clearTimeout','setMarketState','marketExecutionState',page.slice(start,end))(
   fn=>{effect=fn;},{decision},[stock],[],null,present,row=>row.symbol,
   (callback,delay)=>{scheduled={callback,delay};return 17;},timer=>{cleared=timer;},()=>{updates++;},()=>({presentationClock:true}));
  const cleanup=effect();
  eq(scheduled.delay,840001,'Home schedules a refresh one millisecond after the exact stock quote deadline');
  scheduled.callback();eq(updates,1,'The expiry refresh updates presentation time without a decision or order mutation');
  cleanup();eq(cleared,17,'Home cancels obsolete presentation expiry timers');
 }
 const start=page.indexOf('  function momentumEvidenceFor(s){'),end=page.indexOf('  const missingOpenDateSymbols=',start);
 ok(start>=0&&end>start,'The actual desktop/mobile portfolio row is available for rendering');
 const rowCode=babel.transformSync('import React from "react";\n'+page.slice(start,end)+'\nmodule.exports={PortfolioRow};',{
  filename:'portfolio-action-first-regression.jsx',babelrc:false,configFile:false,
  presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]
 }).code;
 function portfolioHtml(position,stock,{mobile=false,current=true}={}){
  const decision=decisionFor(position,{current}),record={exports:{}};
  const before=copy({position,stock,decision});
  const evidence={classification:'Momentum Intact',status:'available',label:'Momentum Intact',tone:'intact',explanation:'Technical evidence sentinel: source rank and MACD.',sourceSessionDate:source,limitations:[]};
  const bindings={...helpers,accountView:{decision,executionDecision:decision},accountMatches:true,accountHoldingMismatch:false,CASH:['CASH'],displayedPortfolioValue:10000,
   c1PortfolioMomentumEvidence:()=>evidence,pd:()=>({action:position.action,source:'c1-actual-account',reason:position.reason,openedAt:position.openedAt}),
   swingTimeReview:()=>({}),holdingReason:(s,decision)=>decision.reason,sym:s=>s.symbol,price:s=>s.price,cls:action=>/sell|exit|stop/i.test(action)?'red':'yellow',factorFor:()=> 'Sector',
   portfolioDateDisplay:()=> 'Oct 1, 2026',specialSituation:()=>null,money:n=>'$'+Number(n).toFixed(2),pct:n=>Number(n).toFixed(2)+'%'};
  new Function('require','module','exports',...Object.keys(bindings),rowCode)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports,...Object.values(bindings));
  const html=renderToStaticMarkup(React.createElement(record.exports.PortfolioRow,{s:stock,mobile}));
  same({position,stock,decision},before,'Real Portfolio rendering preserves original holdings, quotes, orders and cash');
  if(!mobile){
   const heading=page.match(/<div className="desktopTable">[\s\S]*?<thead><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1]||'';
   const headers=[...heading.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map(match=>match[1]);
   const cells=[...html.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)].map(match=>match[1]);
   eq(cells.length,headers.length,'Actual desktop position cells align with the visible table headings');
   eq(headers.at(-2),'Price','The displayed price remains in the Price column');
   eq(headers.at(-1),'Gain/Loss','The gain/loss amount remains in the Gain/Loss column');
  }
  return html;
 }
 const visible=html=>html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 for(const mobile of [false,true]){
  const stop=portfolioHtml(holding(),quote(),{mobile});
  match(stop,/SELL — STOP TRIGGERED/,'The real Portfolio row renders the exact stop action');
  match(stop,/<details\b/,'The real Portfolio row retains expandable technical detail');
  absent(stop,/<details\b[^>]*\sopen(?:[=\s>])/,'Technical detail is collapsed by default');
  match(stop,/Technical detail sentinel/,'The full existing explanation remains available on expansion');
  absent(visible(stop),/Technical detail sentinel|Technical evidence sentinel|Momentum Intact|MACD histogram|top-six rank/,'Primary Portfolio content hides technical explanation and evidence labels');
  const hold=portfolioHtml(holding('MPC'),quote('MPC',115),{mobile});
  match(visible(hold),/>HOLD</,'The real profitable Portfolio row presents Hold');
  match(visible(hold),/\$115\.00/,'The current displayed price is preserved');
  match(visible(hold),/\$150\.00/,'The existing gain/loss amount is preserved');
  absent(visible(hold),/Technical detail sentinel|MACD|confirmation streak/,'Profitable holdings have no expanded technical paragraph by default');
  const stale=portfolioHtml(holding('DELL',{action:'Stop review'}),quote('DELL',85,{timestamp:undefined}),{mobile});
  absent(visible(stale),/SELL/,'A stale or unverified displayed price does not render a new Sell');
 }

 // Compile the real Opportunities component with the same shared helper.
 const file=path.resolve('components/C1AccountOpportunities.js'),record={exports:{}};
 const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,
  presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',code)(name=>name.startsWith('../lib/')?modules.load(name,file):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 const Component=record.exports.default;
 const dell=holding('DELL',{action:'Exit candidate',exits:[{sleeve:'base',shares:10,reason:'initial-stop'}]}),mpc=holding('MPC');
 const stocks=[quote('DELL',85),quote('MPC',115)].map(stock=>({...stock,eventRisk:{status:'Clear'},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},recommendation:{expertDecision:{metrics:{quoteFreshnessPass:true}}}}));
 const decision=decisionFor(dell,{positions:[dell,mpc],stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:source,candidates:[dell,mpc].map((position,index)=>({symbol:position.symbol,sector:'Sector '+index,issuer:'issuer:'+position.symbol,sourcePrice:position.symbol==='MPC'?115:90,researchRank:index+1,momentumPercentile:99-index,
  sourceTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},recentMomentumGate:{sourceSessionDate:source,available:true,entryAllowed:position.symbol==='MPC'}}))}});
 const before=copy({decision,stocks});
 const opportunityHtml=renderToStaticMarkup(React.createElement(Component,{decision,executionDecision:decision,screenRows:stocks,screenCurrent:true,portfolio:stocks,view:'opportunities'}));
 match(opportunityHtml,/SELL — STOP TRIGGERED/,'Held Opportunities uses the same stop action as Portfolio');
 match(opportunityHtml,/>HOLD</,'Held Opportunities uses the same no-exit Hold status as Portfolio');
 absent(visible(opportunityHtml),/Technical detail sentinel|Technical evidence sentinel/,'Held Opportunities does not expose the full account paragraph by default');
 same({decision,stocks},before,'Rendering both views preserves orders, cash, ownership and accepted price evidence');
 const ordinaryDell=holding('DELL'),conflictDecision={...decision,positions:[ordinaryDell,mpc]};
 const conflictScreen=stocks.map(stock=>stock.symbol==='DELL'?{...stock,price:90}:stock);
 const heldQuotes=[quote('DELL',85),quote('MPC',115)],conflictBefore=copy({conflictDecision,conflictScreen,heldQuotes});
 const conflictHtml=renderToStaticMarkup(React.createElement(Component,{decision:conflictDecision,executionDecision:conflictDecision,screenRows:conflictScreen,positionRows:heldQuotes,screenCurrent:true,portfolio:heldQuotes,view:'opportunities'}));
 match(conflictHtml,/SELL — STOP TRIGGERED/,'Held Opportunities uses the same verified position quote as Portfolio when the screen quote conflicts');
 same({conflictDecision,conflictScreen,heldQuotes},conflictBefore,'Resolving display quote priority preserves both source quote arrays and the account decision');
 console.log(`PASS: ${assertions} action-first position presentation assertions; shared helper and real desktop/mobile/Opportunities markup.`);
}finally{global.Date=RealDate;}
