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
async function main(){try{
 const modules=createResearchModuleLoader(process.cwd());
 const helpers=modules.load('lib/c1PositionPresentation.js');
 const {c1PositionPresentation:present}=helpers;
 const {verifyC1Quote}=modules.load('lib/c1QuoteVerification.js');
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
  const row={symbol,role:'Swing',shares:10,avgCost:100,price,value:price*10,weightPct:10,gainLoss:(price-100)*10,gainLossPct:price-100,
   openedAt:'2026-10-01',timestamp:RealDate.parse('2026-10-15T14:59:00Z')/1000,_fmpQuoteCache:'live',
   _fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteFetchedAt:instant,...patch};
  if(!Object.hasOwn(patch,'_fmpQuoteObservation'))row._fmpQuoteObservation={provider:'FMP',endpoint:'stable/quote',symbol:row.symbol,price:row.price,timestamp:row.timestamp,fetchedAt:row._fmpQuoteFetchedAt};
  return row;
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
  eq(result.quoteValidUntil,'2026-10-15T15:01:00.000Z','A current risk quote has an exact two-minute presentation deadline');
  eq(present({...input,now:new Date('2026-10-15T15:01:00.001Z')}).label,'VERIFY STOP URGENTLY','An expired apparent stop breach becomes urgent verification rather than an ordinary Hold');
  eq(present({...input,stock:quote('DELL',85,{timestamp:RealDate.parse('2026-10-15T19:59:30Z')/1000,_fmpQuoteFetchedAt:'2026-10-15T19:59:45Z'}),now:new Date('2026-10-15T19:59:45Z')}).quoteValidUntil,'2026-10-15T20:00:00.000Z','An intraday quote deadline is capped at the regular-session close');
  ok(result.reason.length<=220,'The primary stop explanation remains brief');
  absent(result.reason,/MACD|histogram|top-six|confirmation streak|1\/3\/5/i,'Technical detail does not compete with the primary stop action');
  absent(result.reason,/already sold|sale executed|order submitted|broker confirmed/i,'A Sell recommendation never claims a broker execution');
  eq(present({...input,decision:{...input.decision,current:false}}).label,'SELL — STOP TRIGGERED','A verified current stop can act independently of an unavailable completed-session review');
 }

 // Reproduce the reported DELL prices through the real single-stock API quote
 // normalizer. Provider provenance must survive that boundary into stop use.
 {
  const api=fs.readFileSync('pages/api/index.js','utf8'),start=api.indexOf('const normalizeSymbol='),end=api.indexOf('async function fetchQuote(',start);
  ok(start>=0&&end>start,'The actual account-position quote normalizer is available without network calls');
  const normalize=new Function(api.slice(start,end)+';return normalizeQuote;')();
  const row=holding('DELL',{avgCost:545.17,stops:[{sleeve:'base',shares:10,price:468.85}],momentumEvidence:{classification:'Momentum Intact',rank:1},
   recentMomentumReviews:[{available:true,metrics:{ret1:-3,ret3:-6,ret5:-8,macdImproving:false}}]});
  const provider=quote('DELL',460,{_fmpQuoteRequest:{refreshRequested:true,providerAttempted:true,newDataAccepted:false,refreshStatus:'provider-unchanged'}}),before=copy(provider);
  const normalized=normalize(provider,'DELL'),verification=verifyC1Quote(normalized,new Date()),result=present(args(row,normalized));
  same(normalized._fmpQuoteObservation,provider._fmpQuoteObservation,'API normalization preserves the exact bound provider observation');
  eq(verification.verifiedRegularSession,true,'Normalized fresh FMP data is accepted as current regular-session stop evidence');
  eq(verification.refreshRequested,true,'The accepted quote retains user-requested refresh provenance');
  eq(verification.providerAttempted,true,'The quote records that the provider was contacted');
  eq(verification.newDataAccepted,false,'A provider response with no new price/timestamp remains explicitly unchanged');
  eq(verification.refreshStatus,'provider-unchanged','A manually refreshed unchanged provider result is distinguishable from newly accepted data');
  eq(result.label,'SELL — STOP TRIGGERED','Real DELL $460 is below the recorded $468.85 stop despite high historical rank');
  match(result.reason,/460\.00[\s\S]*468\.85/,'The immediate action explains the real displayed and recorded stop prices');
  absent(result.reason,/already sold|sale executed|order submitted|broker confirmed/i,'The real DELL case does not imply broker execution');
  const unverified={...normalized,_fmpQuoteObservation:undefined},urgent=present(args(row,unverified));
  eq(urgent.label,'VERIFY STOP URGENTLY','An unverified apparent DELL $468.85 breach never becomes normal Hold');
  eq(urgent.urgent,true,'The apparent real DELL breach has explicit urgency');
  eq(urgent.stopTriggered,false,'Urgent verification cannot manufacture an executable stop proof');
  eq(urgent.canAdd,false,'The unresolved DELL stop cannot authorize fresh capital');
  same(provider,before,'API normalization and presentation preserve all original provider evidence');
  for(const [name,when,stamp,status] of [
   ['premarket','2026-10-15T13:00:30Z','2026-10-15T13:00:00Z','premarket'],
   ['after-hours','2026-10-15T20:30:30Z','2026-10-15T20:30:00Z','after-hours'],
   ['previous-close','2026-10-15T13:00:30Z','2026-10-14T19:59:00Z','previous-close'],
  ]){
   const stock=quote('DELL',460,{timestamp:RealDate.parse(stamp)/1000,_fmpQuoteFetchedAt:when}),now=new Date(when),snapshot=copy(row);
   eq(verifyC1Quote(stock,now).status,status,`${name}: the quote session is correctly classified`);
   eq(present(args(row,stock,{now})).label,'VERIFY STOP URGENTLY',`${name}: a nonregular price cannot confirm a new regular-session stop`);
   match(present(args(row,stock,{now})).quoteContext,new RegExp(status),`${name}: the investor-facing quote status identifies the price session`);
   same(row,snapshot,`${name}: no completed-close momentum observations are fabricated`);
  }
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
  eq(present({...input,now:new Date('2026-10-15T15:01:00.001Z')}).label,'VERIFY STOP URGENTLY','The expired execution advisory leaves an urgent unresolved apparent breach');
  for(const [name,patch] of Object.entries({expired:{observedAt:'2026-10-15T14:57:59Z'},future:{observedAt:'2026-10-15T15:00:01Z'},wrongSource:{sourceSessionDate:'2026-10-13'},unverified:{completedConfirmationsUnchanged:false}})){
   const candidate={...input,executionDecision:{...executionDecision,positions:[{...position,intradayMomentumAdvisory:{...advisory,...patch}}]}};
   eq(present(candidate).label,'VERIFY STOP URGENTLY',`${name}: invalid advisory metadata leaves the apparent breach unresolved`);
  }
  eq(present({...input,executionDecision:{...executionDecision,revision:2}}).label,'VERIFY STOP URGENTLY','Another execution revision cannot supply current quote authority');
  const newerStock=quote('DELL',90,{timestamp:RealDate.parse('2026-10-15T14:59:30Z')/1000});
  eq(present({...input,stock:newerStock}).label,'HOLD','A newer verified recovery quote supersedes an older intraday stop advisory');
  eq(present({...input,stock:quote('DELL',90)}).label,'HOLD','Conflicting same-time prices do not become a Sell when the displayed price is above the stop');
  eq(present({...input,stock:quote('DELL',85),executionDecision:{...executionDecision,positions:[{...position,intradayMomentumAdvisory:{...advisory,price:90,changeFromCompletedClosePct:0}}]}}).label,'VERIFY STOP URGENTLY','Conflicting same-time observations leave an apparent stop breach urgently unresolved');
  const duplicateObserved={...position,intradayMomentumAdvisory:advisory};
  eq(present({...input,position:duplicateObserved,stock:quote('DELL',84),decision:{...decision,positions:[duplicateObserved]}}).label,'VERIFY STOP URGENTLY','Duplicate base and execution advisories cannot conceal a third conflicting verified quote at the same timestamp');
  eq(present(args(holding('MPC',{action:'Review',momentumEvidence:{status:'available',classification:'Exit Risk',label:'Exit Risk'}}),quote('MPC',115))).label,'HOLD','An informational risk badge alone is not a confirmed Sell');
  eq(present(args(holding('MSTR',{role:'Core'}),quote('MSTR',85,{role:'Core'}))),null,'Core holdings remain outside C1 Swing presentation logic');
 }

 // A display value alone, stale quote or future observation cannot create Sell.
 for(const [name,patch] of Object.entries({
  missingTimestamp:{timestamp:undefined},missingCacheProvenance:{_fmpQuoteCache:undefined},expired:{timestamp:RealDate.parse('2026-10-15T14:44:59Z')/1000},
  previousSession:{timestamp:RealDate.parse('2026-10-14T19:00:00Z')/1000},future:{timestamp:RealDate.parse('2026-10-15T15:00:01Z')/1000},
  stale:{stale:true},fallback:{staleFallback:true},clientFallback:{clientSnapshotFallback:true},feedStale:{dataFeedSnapshotStale:true},
  cachedStale:{_fmpQuoteCache:'stale-fallback'},quoteError:{error:'Quote unavailable'},missingPrice:{price:null},
  missingObservation:{_fmpQuoteObservation:undefined},mismatchedObservation:{_fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol:'DELL',price:99,timestamp:RealDate.parse('2026-10-15T14:59:00Z')/1000,fetchedAt:instant}},
  serializedBooleanOnly:{_fmpQuoteObservation:undefined,quoteVerification:{verifiedRegularSession:true,status:'verified-regular-session'}},
 })){
  const position=holding('DELL',{action:'Stop review'}),input=args(position,quote('DELL',85,patch));
  const result=unchanged(input,`${name}: the original account evidence remains intact`);
  eq(result.label,name==='missingPrice'?'HOLD':'VERIFY STOP URGENTLY',`${name}: an unsupported apparent breach cannot become a Sell or an ordinary Hold`);
  eq(result.stopTriggered,false,`${name}: no new stop trigger is manufactured`);
  eq(result.urgent,name!=='missingPrice',`${name}: urgency requires an actual displayed apparent breach`);
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
   eq(result.label,/profit/.test(reason)?'SELL — PROFIT PROTECTION':'SELL — MOMENTUM',`${reason}: confirmed account exit has the requested specific Sell presentation`);
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
   eq(blocked.label,name==='unverifiedStop'?'VERIFY STOP URGENTLY':'HOLD',`${name}: unresolved stop risk is urgent while incomplete momentum alone remains Hold`);
   eq(blocked.canAdd,false,`${name}: a do-not-add holding explanation has no visible Add authorization`);
   same(blocked.addOrders,[],`${name}: unsupported capital proposals are hidden`);
   same(candidate,snapshot,`${name}: original checked quantities and account records remain unchanged`);
  }
 }

 const page=fs.readFileSync('pages/index.js','utf8');
 // Execute the actual refresh/merge boundary with a local transport. An
 // unchanged provider response is disclosed; neither it nor an error can
 // silently create new account evidence or rewrite entered ownership.
 {
  const start=page.indexOf('  async function fetchStock('),end=page.indexOf('  async function pushCloudPortfolio(',start);
  const extract=page.match(/^function extract\(d\)\{[^\n]+/m)?.[0];
  ok(start>=0&&end>start&&extract,'The actual holding refresh boundary can be exercised without provider access');
  const calls=[],holdings=[quote('DELL',460),quote('MPC',115),{symbol:'ERROR',role:'Swing',shares:2,avgCost:30},{symbol:'CASH',role:'Swing',shares:1000,avgCost:1},quote('DELL',460)];
  const evidence=copy(holdings);let disclosure='';
  const rows={DELL:quote('DELL',460,{_fmpQuoteRequest:{providerAttempted:true,newDataAccepted:false,refreshRequested:true,refreshStatus:'provider-unchanged'}}),
   MPC:quote('MPC',115,{_fmpQuoteCache:'fresh-memory',_fmpQuoteRequest:{providerAttempted:false,newDataAccepted:false,refreshRequested:true,refreshStatus:'rate-limited'}})};
  for(const stock of Object.values(rows))stock.quoteVerification=verifyC1Quote(stock,new Date());
  const scope={sym:stock=>stock.symbol,price:stock=>Number(stock.price),CASH:['CASH'],setQuoteRefreshStatus:value=>{disclosure=value;},
   calc:(position,price)=>({shares:position.shares,avgCost:position.avgCost,price,value:position.shares*price}),role:(symbol,value)=>value||'Swing',winnerHistoryFor:()=>[],
   fetch:async(url,options)=>{calls.push({url,options});const symbol=new URL(url,'https://offline.invalid').searchParams.get('symbol');if(symbol==='ERROR')throw new Error('Synthetic provider failure');return {ok:true,json:async()=>({stock:rows[symbol]})};}};
  const boundary=new Function(...Object.keys(scope),extract+'\n'+page.slice(start,end)+'\nreturn {fetchHoldingQuotes,holdingQuoteRow};')(...Object.values(scope));
  const refreshed=await boundary.fetchHoldingQuotes(holdings,true,[]);
  eq(calls.length,3,'A manual holding refresh deduplicates symbols and skips cash');
  for(const call of calls){match(call.url,/&refresh=1$/,'Every manually refreshed holding requests provider re-verification');eq(call.options.cache,'no-store','The manual holding quote request bypasses browser cache');}
  match(disclosure,/DELL: Provider checked; no new quote data received/,'An unchanged provider response is disclosed explicitly');
  match(disclosure,/MPC: Refresh rate-limited; no new provider data received/,'A rate-limited refresh cannot imply new data');
  match(disclosure,/ERROR: provider verification failed; no new data accepted/,'A failed refresh reports that no provider evidence was accepted');
  same(holdings,evidence,'Refreshing quotes does not change entered holdings, cash units or original cost basis');
  const previousAppRows=copy([rows.DELL]),previousBefore=copy(previousAppRows);
  rows.DELL={...rows.DELL,_fmpQuoteRequest:{providerAttempted:true,newDataAccepted:true,refreshRequested:true,refreshStatus:'provider-updated'}};
  rows.DELL.quoteVerification=verifyC1Quote(rows.DELL,new Date());
  const repeated=await boundary.fetchHoldingQuotes([holdings[0]],true,previousAppRows);
  match(disclosure,/DELL: Provider checked; no new quote data received/,'A cold server cache cannot claim new data when the client already has the identical price and provider timestamp');
  absent(disclosure,/New verified provider quote accepted/,'Identical client evidence overrides the server instance first-observation flag for refresh disclosure');
  eq(repeated.get('DELL').quoteVerification.verifiedRegularSession,true,'An unchanged current verified quote still supports immediate stop evaluation');
  same(previousAppRows,previousBefore,'Comparing prior application quotes cannot rewrite the retained provider evidence');
  const prior={...holdings[0],stale:true,staleFallback:true,staleVerification:true,clientSnapshotFallback:true,dataFeedSnapshotStale:true};
  const accepted=boundary.holdingQuoteRow(holdings[0],refreshed.get('DELL'),prior);
  for(const flag of ['stale','staleFallback','staleVerification','clientSnapshotFallback','dataFeedSnapshotStale'])eq(accepted[flag],false,`${flag}: accepted current verified quotes clear obsolete display flags`);
  eq(accepted.shares,holdings[0].shares,'Fresh quote merging preserves entered shares');eq(accepted.avgCost,holdings[0].avgCost,'Fresh quote merging preserves original cost basis');
  const unverified={...refreshed.get('DELL'),_fmpQuoteObservation:undefined,quoteVerification:{verifiedRegularSession:false}};
  const retained=boundary.holdingQuoteRow(holdings[0],unverified,prior);
  for(const flag of ['stale','staleFallback','staleVerification','clientSnapshotFallback','dataFeedSnapshotStale'])eq(retained[flag],true,`${flag}: an unverified response cannot erase prior stale evidence`);
  eq(boundary.holdingQuoteRow(holdings[0],refreshed.get('ERROR'),prior).staleVerification,true,'A provider failure keeps the prior holding explicitly unverified');
  const marker='    {["opportunities","portfolio"].includes(tab)&&<div className="refreshEvidence"',bannerStart=page.indexOf(marker),bannerEnd=page.indexOf('\n',bannerStart);
  ok(bannerStart>=0&&bannerEnd>bannerStart,'The actual application exposes the market-data freshness banner');
  const expression=page.slice(bannerStart,bannerEnd).trim().slice(1,-1),record={exports:{}};
  const code=babel.transformSync('import React from "react";function Freshness({tab,accountView,applicationRefreshAt,quoteRefreshStatus}){return ('+expression+');}module.exports=Freshness;',{
   filename:'c1-freshness-banner-regression.jsx',babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
  new Function('require','module','exports',code)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
  for(const tab of ['portfolio','opportunities']){
   const html=renderToStaticMarkup(React.createElement(record.exports,{tab,accountView:{decision:{sourceSessionDate:source}},applicationRefreshAt:new Date(instant),quoteRefreshStatus:disclosure}));
   match(html,/aria-label="Market data freshness"/,'Each trading view exposes the same freshness disclosure');
   match(html,/Latest completed signal session: 2026-10-14/,'The signal session stays distinct from the application refresh clock');
   match(html,/Last application refresh:/,'The application refresh clock has its own label');
   match(html,/Provider checked; no new quote data received/,'A manual refresh with no new provider data is disclosed in actual rendered markup');
  }
  const newer=quote('DELL',459,{timestamp:RealDate.parse('2026-10-15T14:59:45Z')/1000});newer.quoteVerification=verifyC1Quote(newer,new Date());
  const preserved=copy(newer),owned={symbol:'DELL',role:'Swing',shares:10,avgCost:500,openedAt:'2026-10-01'};
  const olderRows=await boundary.fetchHoldingQuotes([owned],true,[newer]);
  match(disclosure,/Provider returned an older quote; no new data accepted/,'An older provider observation cannot be described as newly accepted data');
  const merged=boundary.holdingQuoteRow(owned,olderRows.get('DELL'),newer);
  eq(merged.price,459,'An older fulfilled quote cannot erase a known newer stop-breach price');
  eq(merged.timestamp,newer.timestamp,'The newer verified provider timestamp survives an older response');
  eq(present(args(holding('DELL',{stops:[{price:468.85}]}),merged)).label,'SELL — STOP TRIGGERED','Keeping the newer verified quote preserves the actionable recorded-stop breach');
  same(newer,preserved,'Discarding an older display quote cannot mutate the retained provider observation');
 }
 // A failing broad screen must not prevent the independently requested held
 // quotes from completing. Existing request identity fences both price and
 // refresh-status publication when requests finish out of order.
 {
  const start=page.indexOf('  function screenHealth('),end=page.indexOf('  async function pushCloudPortfolio(',start),extract=page.match(/^function extract\(d\)\{[^\n]+/m)?.[0];
  ok(start>=0&&end>start&&extract,'The actual Opportunities load and quote publication path is available');
  const position={symbol:'DELL',role:'Swing',shares:10,avgCost:500,openedAt:'2026-10-01'},account=decisionFor(holding('DELL',{stops:[{price:468.85}]}));
  const before=copy({position,account});
  function harness({defer=false}={}){
   const state={rows:[],stocks:[],health:{status:'healthy'},requests:[],quotePending:[],status:'',error:'',accountCalls:[],refreshes:0};
   const scope={accountView:{decision:account},portfolio:[position],results:[],screenRequestId:{current:0},
    sym:row=>row.symbol,price:row=>Number(row.price),CASH:['CASH'],signalPersistence:()=>({}),
    readTop5Response:modules.load('lib/top5Response.js').readTop5Response,performanceHistory:async()=>({records:[],available:true}),
    refreshC1Account:async(...args)=>{state.accountCalls.push(args);return {decision:account};},prepareC1Execution:()=>{},
    setReloading:()=>{},setErr:value=>{state.error=value;},setResults:value=>{state.rows=typeof value==='function'?value(state.rows):value;},
    setStocks:value=>{state.stocks=typeof value==='function'?value(state.stocks):value;},setFeedHealth:value=>{state.health=typeof value==='function'?value(state.health):value;},
    setMarketScope:()=>{},setMarketRadar:()=>{},setLastUpdated:()=>{},setThemeStocks:()=>{},setThemeFeedHealth:()=>{},setApplicationRefreshAt:()=>{state.refreshes++;},
    setQuoteRefreshStatus:value=>{state.status=value;},setTimeout:fn=>{fn();return 0;},
    calc:(held,price)=>({shares:held.shares,avgCost:held.avgCost,price,value:held.shares*price}),role:(symbol,value)=>value||'Swing',winnerHistoryFor:()=>[],
    fetch:async(url,options)=>{
     state.requests.push({url,options});
     if(url.startsWith('/api/top5?'))return new Response(JSON.stringify({error:'Synthetic broad screen unavailable.'}),{status:503});
     if(!url.startsWith('/api?'))throw new Error('Unexpected local request '+url);
     if(defer)return new Promise(resolve=>state.quotePending.push(resolve));
     const stock=quote('DELL',460,{_fmpQuoteRequest:{providerAttempted:true,newDataAccepted:false,refreshRequested:true,refreshStatus:'provider-unchanged'}});
     stock.quoteVerification=verifyC1Quote(stock,new Date());return {ok:true,json:async()=>({stock})};
    }};
   const load=new Function(...Object.keys(scope),extract+'\n'+page.slice(start,end)+'\nreturn load;')(...Object.values(scope));
   return {state,load};
  }
  const failed=harness(),pending=failed.load('opportunities',1);
  match(failed.state.requests[0].url,/^\/api\?symbol=DELL&refresh=1$/,'The held quote starts independently before account or broad-screen completion');
  await pending;
  ok(failed.state.requests.some(row=>row.url.startsWith('/api/top5?')),'The fixture really attempted and failed the broad screen');
  eq(failed.state.health.status,'unavailable','The failed broad screen remains transparently unavailable');
  eq(failed.state.rows[0]?.price,460,'The fresh held quote is published despite a broad-screen failure');
  eq(present(args(holding('DELL',{stops:[{price:468.85}]}),failed.state.rows[0])).label,'SELL — STOP TRIGGERED','Broad-screen failure cannot hide a separately verified held-position stop');
  match(failed.state.status,/Provider checked; no new quote data received/,'The independently completed quote attempt publishes its actual outcome');
  eq(failed.state.refreshes,1,'The application refresh clock completes even when the broad screen fails');
  ok(failed.state.accountCalls.every(args=>args.length===0),'Quote refresh does not request any account mutation');
  const race=harness({defer:true}),older=race.load('opportunities',1),newest=race.load('opportunities',2);
  eq(race.state.quotePending.length,2,'Both overlapping requests independently start a held quote attempt');
  const latest=quote('DELL',459,{timestamp:RealDate.parse('2026-10-15T14:59:45Z')/1000,_fmpQuoteRequest:{providerAttempted:true,newDataAccepted:true,refreshRequested:true,refreshStatus:'provider-updated'}});
  latest.quoteVerification=verifyC1Quote(latest,new Date());race.state.quotePending[1]({ok:true,json:async()=>({stock:latest})});await newest;
  const published=copy(race.state.rows),latestStatus=race.state.status;
  eq(published[0]?.price,459,'The newer request publishes its verified price first');
  match(latestStatus,/New verified provider quote accepted/,'The newer request publishes its own verified refresh outcome');
  const oldQuote=quote('DELL',460,{_fmpQuoteRequest:{providerAttempted:true,newDataAccepted:false,refreshRequested:true,refreshStatus:'provider-unchanged'}});
  oldQuote.quoteVerification=verifyC1Quote(oldQuote,new Date());race.state.quotePending[0]({ok:true,json:async()=>({stock:oldQuote})});await older;
  same(race.state.rows,published,'A superseded request cannot replace newer held-position prices');
  eq(race.state.status,latestStatus,'A superseded request cannot overwrite the newer refresh disclosure');
  eq(race.state.refreshes,1,'Only the current request publishes a completed application refresh');
  same({position,account},before,'Failed and overlapping screen refreshes preserve original holdings, account cash and decision evidence');
 }
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
  eq(scheduled.delay,60001,'Home schedules a refresh one millisecond after the exact risk quote deadline');
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
   same(headers,['Position','Open Date','Decision','Evidence','Why','Price','Gain/Loss'],'The original compact seven-column Portfolio layout is restored');
   eq(headers.at(-2),'Price','The displayed price remains in the Price column');
   eq(headers.at(-1),'Gain/Loss','The gain/loss amount remains in the Gain/Loss column');
  }
  return html;
 }
 const visible=html=>html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 for(const mobile of [false,true]){
  const stop=portfolioHtml(holding(),quote(),{mobile});
  match(stop,/SELL — STOP TRIGGERED/,'The real Portfolio row renders the exact stop action');
  match(visible(stop),/Last verified quote:/,'The verified quote timestamp is shown independently of signal-session and refresh clocks');
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
  match(visible(stale),/VERIFY STOP URGENTLY/,'A potentially breached stop is not displayed as a normal Hold');
  match(visible(stale),/URGENT VERIFICATION REQUIRED/,'Urgent unresolved stop risk is unmistakable on desktop and mobile');
  const realDell=holding('DELL',{stops:[{sleeve:'base',shares:10,price:468.85}]}),realStock=quote('DELL',460);
  const realVerified=portfolioHtml(realDell,realStock,{mobile});
  match(visible(realVerified),/SELL — STOP TRIGGERED/,'The reported DELL breach has the same verified action on desktop and mobile');
  match(visible(realVerified),/460\.00[\s\S]*468\.85/,'The reported DELL price and existing stop are both visible in the concise action explanation');
  const realUnverified=portfolioHtml(realDell,{...realStock,_fmpQuoteObservation:undefined},{mobile});
  match(visible(realUnverified),/VERIFY STOP URGENTLY/,'The reported DELL breach is urgent when its exact API quote provenance is missing');
  match(visible(realUnverified),/URGENT VERIFICATION REQUIRED/,'The reported unverified DELL breach carries the explicit urgent notice in each layout');
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
 console.log(`PASS: ${assertions} compact position presentation assertions; verified quotes, manual refresh and real desktop/mobile/Opportunities markup.`);
}finally{global.Date=RealDate;}}
main().catch(error=>{console.error(error);process.exitCode=1;});
