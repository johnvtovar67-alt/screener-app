const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const RealDate=Date,now='2026-10-15T17:00:00Z';
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return RealDate.parse(now);}};
try{
 const loader=createResearchModuleLoader(process.cwd());
 const components=new Map();
 function loadComponent(relativeFile){
  const file=path.resolve(relativeFile);if(components.has(file))return components.get(file);
  const record={exports:{}},compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
  new Function('require','module','exports',compiled)(name=>name.startsWith('../lib/')?loader.load(name,file):name.startsWith('.')?loadComponent(path.resolve(path.dirname(file),name.endsWith('.js')?name:name+'.js')):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
  components.set(file,record.exports);return record.exports;
 }
 const file=path.resolve('components/C1AccountOpportunities.js'),Component=loadComponent(file).default,{buildC1ManualRecommendations}=loader.load('lib/c1ManualRecommendations.js');
 const {c1PositionPresentation}=loader.load('lib/c1PositionPresentation.js');
 const {verifyC1Quote}=loader.load('lib/c1QuoteVerification.js');
 // Reuse the actual API normalization boundary so a fabricated freshness
 // boolean cannot stand in for the provider observation used by stop checks.
 const api=fs.readFileSync('pages/api/index.js','utf8'),normalizerStart=api.indexOf('const normalizeSymbol='),normalizerEnd=api.indexOf('async function fetchQuote(',normalizerStart);
 assert.ok(normalizerStart>=0&&normalizerEnd>normalizerStart);
 const normalize=new Function(api.slice(normalizerStart,normalizerEnd)+';return normalizeQuote;')();
 const position={symbol:'MPC',role:'Swing',shares:10,avgCost:80,price:100,action:'Hold',stops:[{price:86}],exits:[],entryContext:{stage:'half'},reviewRules:[],reason:'Momentum rank #2; technical supporting evidence.'};
 const candidate=(symbol,index)=>({symbol,sector:'Sector'+index,issuer:'issuer:'+symbol,sourcePrice:100,researchRank:index+1,momentumPercentile:99-index,sourceTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},recentMomentumGate:{sourceSessionDate:'2026-10-14',available:true,entryAllowed:true}});
 const decision={contract:'c1-account-decision-v1',decisionId:'compact:1',revision:1,current:true,sourceSessionDate:'2026-10-14',positions:[position],strategyCash:1000,brokerageCash:500,brokerageCashCurrent:true,executableCash:500,stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:'2026-10-14',candidates:['BBB','MPC','CCC','DDD'].map(candidate)}};
 const screenRows=['BBB','MPC','CCC','DDD'].map((symbol,index)=>{
  const provider={symbol,price:100,timestamp:Date.now()/1000,_fmpQuoteCache:'live',_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteFetchedAt:now,
   _fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol,price:100,timestamp:Date.now()/1000,fetchedAt:now}};
  const normalized=normalize(provider,symbol);
  assert.deepEqual(normalized._fmpQuoteObservation,provider._fmpQuoteObservation,'The real account quote normalizer retains bound price and timestamp evidence');
  assert.equal(verifyC1Quote(normalized,new Date()).verifiedRegularSession,true);
  return {...normalized,sector:symbol==='MPC'?'Energy':symbol==='BBB'?'Technology':undefined,eventRisk:{status:'Clear'},entryTiming:{available:true,liquidityPass:index<3,averageDollarVolume20:index<3?500000000:1000000},recommendation:{expertDecision:{strongBuyPass:symbol==='BBB',metrics:{quoteFreshnessPass:true}}}};
 });
 const plan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,sourceSessionDate:decision.sourceSessionDate,date:'2026-10-15',observedAt:now,quoteValidUntil:'2026-10-15T17:02:00Z',sourceReceipt:{observedAt:now,membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},entryReviews:[{symbol:'CCC',reason:'brokerage-cash-insufficient'}],orders:[{id:'new',symbol:'BBB',side:'buy',shares:2,estimatedPrice:100,phase:3},{id:'add',symbol:'MPC',side:'buy',shares:1,estimatedPrice:100,phase:3}]};
 const review=buildC1ManualRecommendations({decision,openingPlan:plan});assert.equal(review.status,'ready');
 const props={decision,executionDecision:decision,openingPlan:plan,manualRecommendations:review,screenRows,positionRows:screenRows,screenCurrent:true};
 const strip=html=>html.replace(/\sclass="[^"]*"/g,'');
 const renderRaw=patch=>renderToStaticMarkup(React.createElement(Component,{...props,...patch}));
 const render=patch=>strip(renderRaw(patch));
 const section=(html,label)=>{
  const start=html.search(new RegExp('<section[^>]*aria-label="'+label+'"'));if(start<0)return '';
  const tags=/<\/?section\b[^>]*>/g;tags.lastIndex=start;let depth=0,match;
  while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(!depth)return html.slice(start,tags.lastIndex);}
  throw new Error('Unclosed actual section '+label);
 };
 const visible=html=>html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
 const baseline=JSON.stringify(props),html=render({}),main=section(html,'C1 account opportunities'),watch=section(html,'Watch opportunities');
 assert.match(main,/<h3>BBB<\/h3><b>STRONG BUY<\/b>/,'Only actual authorized capital uses a green actionable tile');
 assert.match(main,/BUY 2 shares; opening checks passed\./);assert.match(main,/<h3>MPC<\/h3><b>HOLD<\/b>/);assert.match(main,/ADD 1 share; opening checks passed\./,'Checked partial-position completion is retained separately from the held-share action');
 assert.match(main,/Opening reference: \$100\.00/,'The unchanged checked opening reference remains available in Details');
 assert.doesNotMatch(main,/<h3>CCC<\/h3>|<h3>DDD<\/h3>|NO PURCHASE/,'Unfunded and nonqualifying candidates do not occupy opportunities');
 assert.match(watch,/<h3>CCC<\/h3>[\s\S]*?<details[^>]*>[\s\S]*?Investment rating: Buy/,'A capital cap does not change the underlying investment rating retained in collapsed Details');
 assert.match(watch,/NO PURCHASE/);assert.match(visible(watch),/Insufficient cash for a purchase\./);assert.match(watch,/<h3>DDD<\/h3>/);
 assert.doesNotMatch(section(renderRaw({}),'Watch opportunities'),/class="[^"]*\bgreen\b|BUY \d+ shares/,'Watch stays neutral without implying permission');
 assert.match(main,/<b>HOLD<\/b>/,'The held-share action remains separate from a checked Add proposal');
 const componentSource=fs.readFileSync(file,'utf8'),watchHtml=section(renderRaw({}),'Watch opportunities');
 assert.doesNotMatch(watchHtml,/<table/,'Watch uses the same compact card language as Opportunities');
 assert.equal([...watchHtml.matchAll(/<article\b/g)].length,2,'Every original Watch candidate retains one compact card');
 assert.match(watchHtml,/class="[^"]*pill gray[^\"]*"[^>]*>NO PURCHASE</,'No-purchase cards have a neutral badge');
 assert.match(renderRaw({}),/class="[^"]*pill yellow[^\"]*"[^>]*>HOLD</,'A checked Add does not replace a yellow Hold status');
 assert.match(componentSource,/<style jsx global>/,'Helper-rendered cards use the global stylesheet contract required for actual scoped classes');
 assert.match(componentSource,/\.opportunityCard \.price small\{display:block/,'Card price labels remain stacked in the actual namespaced stylesheet');
 assert.doesNotMatch(componentSource,/\.buyGrid\{grid-template-columns:repeat\(auto-fit/,'One opportunity cannot stretch across the entire viewport');
 for(const card of [...renderRaw({}).matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match=>match[0])){
  assert.deepEqual([...card.matchAll(/<h4[^>]*>([^<]+)<\/h4>/g)].map(match=>match[1]),['Recent momentum','Rank / protection state','Stop information','Data freshness'],'Each card has exactly four structured technical groups');
  assert.doesNotMatch(card,/<details[^>]*\bopen(?:\s|=|>)/,'Technical groups remain collapsed');
  assert.equal([...visible(card).matchAll(/class="[^"]*compactReason[^\"]*"/g)].length,1,'Each card has one visible concise explanation');
  const faceReason=card.match(/<p[^>]*class="[^"]*compactReason[^\"]*"[^>]*>([^<]*)<\/p>/)?.[1];
  const entryReasons=[...card.matchAll(/<small[^>]*>Entry check: ([^<]*)<\/small>/g)].map(match=>match[1]);
  assert.ok(!entryReasons.includes(faceReason),'Collapsed entry checks cannot repeat an identical primary explanation');
 }
 assert.match(visible(main),/Technology · 2026-10-14/);assert.match(visible(main),/Energy · 2026-10-14/);
 assert.match(main,/<details[^>]*>[\s\S]*?Investment rating: Strong Buy/,'The underlying Strong Buy rating remains available in collapsed Details');
 assert.doesNotMatch(visible(main+watch),/Rated |Investment rating:/,'Card faces retain only sector and source date rather than duplicate rating metadata');
 assert.match(watch,/Sector unavailable/,'Unknown sector identifiers use the human-readable fallback');
 assert.doesNotMatch(visible(main+watch),/Sector0|Sector1|Sector2|Sector3|Momentum rank #2; technical supporting evidence/,'Internal sector codes and narrative paragraphs are absent from the primary cards');
 // Reproduce the actual four-button navigation on every tab. Its former
 // nowrap flex row overflowed a 390px page to 417px, outside any scroller.
 const page=fs.readFileSync('pages/index.js','utf8'),navSource=page.match(/<nav>[\s\S]*?<\/nav>/)?.[0];
 assert.ok(navSource,'The production navigation is exercised rather than a substitute layout');
 const navRecord={exports:{}};
 const navCode=babel.transformSync('import React from "react";function Navigation({tab}){const openTab=()=>{};return ('+navSource+');}module.exports=Navigation;',{filename:'c1-compact-navigation-regression.jsx',babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',navCode)(name=>require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),navRecord,navRecord.exports);
 const tabs=['opportunities','portfolio','themes','single'],labels=['Opportunities','My Portfolio','Themes','Single'];
 for(const [index,tab] of tabs.entries()){
  const navigation=renderToStaticMarkup(React.createElement(navRecord.exports,{tab}));
  assert.deepEqual([...navigation.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(match=>match[1]),labels,'Mobile wrapping preserves every original navigation action and its order');
  assert.match(navigation,new RegExp('<button class="active">'+labels[index]+'<\/button>'),'The selected tab keeps the existing active state');
 }
 const globalCss=page.match(/<style jsx global>\{`([\s\S]*?)`}<\/style>/)?.[1];
 assert.ok(globalCss,'The actual application stylesheet supplies the navigation layout');
 const navWrap=[];
 require('postcss').parse(globalCss).walkRules('nav',rule=>rule.walkDecls('flex-wrap',decl=>{
  const media=[];for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule')media.push([parent.name,parent.params]);
  navWrap.push({value:decl.value,media});
 }));
 assert.deepEqual(navWrap,[{value:'wrap',media:[['media','(max-width:700px)']]}],'Only mobile navigation wraps; desktop layout and all trading views retain their existing behavior');
 assert.equal(JSON.stringify(props),baseline,'Rendering cannot mutate checked orders, shares, fees, cash or evidence');
 const noOrders={...plan,orders:[]},noReview=buildC1ManualRecommendations({decision,openingPlan:noOrders});
 const paused=render({openingPlan:noOrders,manualRecommendations:noReview});
 assert.doesNotMatch(section(paused,'C1 account opportunities'),/<article/,'A ranking alone cannot authorize a tile');
 assert.match(section(paused,'Watch opportunities'),/<details[^>]*>[\s\S]*?Investment rating: Strong Buy/,'Strong Buy ranking survives in Details without permission to buy');
 const expired=render({manualRecommendations:{...review,validUntil:'2026-10-15T16:59:59Z'}});
 assert.doesNotMatch(section(expired,'C1 account opportunities'),/BUY 2 shares|ADD 1 share/,'Expired review cannot create green purchase intent');
 const fullSlots={...decision,positions:[position,{...position,symbol:'XXX'},{...position,symbol:'YYY'}]},fullPlan={...plan,orders:[]};
 const full=render({decision:fullSlots,executionDecision:fullSlots,openingPlan:fullPlan,manualRecommendations:buildC1ManualRecommendations({decision:fullSlots,openingPlan:fullPlan})});
 assert.match(full,/All three C1 position slots are currently allocated/);assert.doesNotMatch(section(full,'C1 account opportunities'),/<article/);
 const poor={...decision,stockScreen:{...decision.stockScreen,candidates:decision.stockScreen.candidates.map(c=>c.symbol==='BBB'?{...c,recentMomentumGate:{...c.recentMomentumGate,entryAllowed:false}}:c)}};
 assert.doesNotMatch(section(render({decision:poor,executionDecision:poor}),'C1 account opportunities'),/BUY 2 shares/,'A checked order cannot override a failed current momentum screen');
 // Same quote evidence reaches the shared holding presenter from both pages;
 // a stopped holding never remains a green Add tile.
 const stoppedPosition={...position,stops:[{price:468.85}]},stoppedDecision={...decision,positions:[stoppedPosition]};
 const stoppedProps={decision:stoppedDecision,executionDecision:stoppedDecision,manualRecommendations:buildC1ManualRecommendations({decision:stoppedDecision,openingPlan:plan})};
 const stopped=render(stoppedProps),expected=c1PositionPresentation({decision:stoppedDecision,position:stoppedPosition,stock:screenRows.find(r=>r.symbol==='MPC')});
 assert.equal(expected.label,'SELL — STOP TRIGGERED');assert.match(stopped,/SELL — STOP TRIGGERED/);assert.doesNotMatch(section(stopped,'C1 account opportunities'),/ADD 1 share/);
 assert.match(section(renderRaw(stoppedProps),'Watch opportunities'),/class="[^"]*pill red[^\"]*"[^>]*>SELL — STOP TRIGGERED</,'A confirmed stop keeps its red action in Watch');
 assert.match(section(stopped,'Watch opportunities'),/<dt>Last verified quote<\/dt><dd>2026-10-15 17:00:00 UTC<\/dd>/,'Held opportunities retain the verified quote timestamp in Data freshness');
 assert.match(stopped,/Signals based on 2026-10-14 close/,'The completed signal session is not replaced by the intraday timestamp');
 const staleRows=screenRows.map(r=>({...r,quoteVerification:verifyC1Quote(r,new Date()),stale:true,clientSnapshotFallback:true}));
 const stale=render({...stoppedProps,positionRows:staleRows,screenRows:staleRows});
 assert.doesNotMatch(section(stale,'C1 account opportunities'),/BUY 2 shares|ADD 1 share/,'Stale price/screen evidence fails closed for all new capital');
 assert.match(stale,/VERIFY STOP URGENTLY/,'A stale apparent stop breach is urgent rather than an ordinary Hold');
 assert.match(section(renderRaw({...stoppedProps,positionRows:staleRows,screenRows:staleRows}),'Watch opportunities'),/class="[^"]*pill orange[^\"]*"[^>]*>VERIFY STOP URGENTLY</,'Unverified apparent stop risk is prominent and orange');
 assert.doesNotMatch(stale,/SELL — STOP TRIGGERED/,'A stale quote cannot fabricate a stop confirmation');
 assert.match(section(stale,'Watch opportunities'),/<dt>Quote<\/dt><dd>Fallback \/ unverified<\/dd>/,'A retained last verified timestamp is not presented as current verification');
 const missingProofRows=screenRows.map(row=>({...row,_fmpQuoteObservation:undefined}));
 const missingProof=render({...stoppedProps,positionRows:missingProofRows,screenRows:missingProofRows});
 assert.match(missingProof,/VERIFY STOP URGENTLY/,'A bare cached quote without bound provenance stays an urgent verification condition');
 assert.match(section(missingProof,'Watch opportunities'),/<dt>Last verified quote<\/dt><dd>Unavailable<\/dd>/,'Missing verification history does not invent a verified timestamp');
 assert.doesNotMatch(missingProof,/SELL — STOP TRIGGERED|ADD 1 share/,'Missing proof cannot confirm an exit or authorize adding through the apparent stop');
 assert.equal(JSON.stringify(props),baseline,'Stop, stale, momentum and expiry projections preserve all original inputs');
 console.log('PASS: compact actual-render opportunities require checked capital; rated but unfunded/blocked candidates remain neutral Watch; partial completions, shared stop decisions, expiry, stale checks and accounting immutability are preserved.');
}finally{global.Date=RealDate;}
