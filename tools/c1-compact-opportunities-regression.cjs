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
 const article=(markup,symbol)=>[...markup.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match=>match[0]).find(card=>new RegExp('<h3[^>]*>'+symbol+'<\\/h3>').test(card))||'';
 assert.match(main,/<h3>BBB<\/h3><b>Strong Buy<\/b>/,'A genuinely checked purchase retains the historical Strong Buy tile');
 assert.match(main,/Buy 2 shares/,'Only the original checked Buy quantity is displayed');
 assert.match(article(main,'BBB'),/Historical strength and recent momentum qualify this purchase\./,'A checked purchase has a consistent positive plain-English reason');
 assert.doesNotMatch(article(main,'BBB'),/does not currently qualify|insufficient for a purchase/,'A current checked Buy cannot be described as ineligible');
 assert.match(main,/<h3>MPC<\/h3><b>HOLD<\/b>/,'The current held-share Hold action replaces the historical generic Add headline');
 assert.match(main,/Add 1 share/,'The original checked partial-position completion is retained separately');
 assert.match(main,/Signal closing price/);assert.match(main,/Momentum score: 99\.0\/100/);
 assert.match(main,/Sector0 · Strong Buy rating as of 2026-10-14/,'The historical rating and source metadata remain in the original tile');
 const raw=renderRaw({}),rawMain=section(raw,'C1 account opportunities');
 assert.match(article(rawMain,'BBB'),/class="[^"]*pill green[^"]*"[^>]*>Strong Buy</,'A checked purchase retains its green investment action');
 assert.match(article(rawMain,'MPC'),/class="[^"]*pill yellow[^"]*"[^>]*>HOLD</,'The current Hold status remains distinct from its checked Add proposal');
 for(const symbol of ['BBB','MPC']){
  const rawCard=article(rawMain,symbol),plan=rawCard.match(/class="[^"]*\bplan\b[^"]*">([\s\S]*?)<\/div>/)?.[1]||'';
  assert.match(plan,/<small[^>]*>Your next action<\/small>/,'The original next-action label remains in its original slot');
  if(symbol!=='CCC')assert.match(plan,/Opening reference \$100\.00; confirm the current broker price\./,'Checked orders retain the original execution-reference slot');
  const sentence=plan.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/)?.[1]||'';
  assert.equal((sentence.match(/[.!?](?=\s+[A-Z]|$)/g)||[]).length,1,'Each decision reason is one sentence');
  assert.doesNotMatch(sentence,/MACD|histogram|confirmation|top[- ](?:six|nine)|rank #|1\/3\/5|bps|cooldown|\d+[- ]session/i,'Technical calculations and rules remain internal');
 }
 assert.match(watch,/<b>CCC<\/b>/,'Blocked Buy stays visible in Watch');
 assert.doesNotMatch(main,/<h3>CCC<\/h3>/,'Blocked Buy has no green card');
 assert.equal((article(main,'MPC').match(/>HOLD</g)||[]).length,1,'The holding action is not duplicated inside its reason');
 assert.match(watch,/<th>Priority<\/th><th>Stock \/ Sector<\/th><th>Momentum score<\/th><th>Signal closing price<\/th><th>Entry check<\/th>/,'The original five-column Watch table is restored');
 assert.match(watch,/<td>4<\/td><td><b>DDD<\/b>/,'The original independent Watch priority is retained');
 assert.doesNotMatch(watch,/<article|BUY \d+ shares/,'Watch remains a separate table without purchase instructions');
 assert.doesNotMatch(main+watch,/<details|Recent momentum<\/h4>|compactReason/,'The rejected rebuilt card/details layout is absent');
 const noOrders={...plan,orders:[]},noReview=buildC1ManualRecommendations({decision,openingPlan:noOrders});
 const paused=render({openingPlan:noOrders,manualRecommendations:noReview});
 assert.doesNotMatch(paused,/Buy 2 shares|Add 1 share/,'A ranking alone cannot create an executable quantity');
 // Rating, authorization and cash explanations are independent presentation concerns.
 assert.match(paused,/No purchases currently authorized\./);
 assert.doesNotMatch(paused,/No C1 Buy ratings|Candidates awaiting a C1 Buy rating/);
 assert.match(paused,/Includes blocked Buy-rated candidates/);
 assert.match(section(paused,'Watch opportunities'),/Strong Buy rating/,'Blocked candidates retain their investment rating');
 const {c1CashAvailability}=loader.load('lib/c1BrokerageCash.js');
 const {c1OpportunityPresentation}=loader.load('lib/c1EntryReview.js');
 for(const [name,balance,observedAt,strategyCash,reasons,expected] of [
  ['stale',363.36,'2026-10-14T17:00:00Z',1000,[],/earlier Eastern date/],
  ['strategy',363.36,now,0,[],/C1 strategy cash is exhausted/],
  ['strategy quantity',363.36,now,10,['insufficient-cash'],/C1 strategy cash cannot fund/],
  ['broker quantity',363.36,now,1000,['brokerage-cash-insufficient'],/brokerage cash is insufficient/],
 ]){
  const cash=c1CashAvailability({strategyCash,brokerageCash:{source:'manual-broker-balance',balance,observedAt},now:new Date()});
  const cashDecision={...decision,...cash},cashPlan={...noOrders,entryReviews:[],cashBlockedOrders:reasons.map(reason=>({symbol:'BBB',reason}))};
  const before=JSON.stringify({cashDecision,cashPlan});
  const output=c1OpportunityPresentation({decision:{...cashDecision,opportunities:[{symbol:'BBB',rating:'Buy'}]},plan:cashPlan,ready:true});
  assert.match(output.cashReason,expected,name+' exposes the actual cash gate');
  if(name==='strategy'||name==='stale')assert.equal(cash.executableCash,0);
  const cashHtml=render({decision:cashDecision,executionDecision:cashDecision,openingPlan:cashPlan,manualRecommendations:buildC1ManualRecommendations({decision:cashDecision,openingPlan:cashPlan})});
  assert.match(cashHtml,expected,name+' renders the authoritative cash reason');
  assert.equal(JSON.stringify({cashDecision,cashPlan}),before,name+' preserves cash, positions, review reasons and quantities');
 }
 const unknownCash=c1OpportunityPresentation({decision:{...decision,executableCash:0},plan:{...noOrders,entryReviews:[]}});
 assert.equal(unknownCash.cashReason,null,'A zero display alone cannot invent a cash blocker');
 const mrnaDecision={...decision,positions:[],stockScreen:{...decision.stockScreen,candidates:[{...candidate('MRNA',0),momentumPercentile:100,sector:'Healthcare'}]}};
 const mrnaRows=[{...screenRows[0],symbol:'MRNA'}];
 const mrnaPlan={...noOrders,entryReviews:[{symbol:'MRNA',reason:'brokerage-cash-insufficient'}]};
 const mrnaProps={decision:mrnaDecision,executionDecision:mrnaDecision,screenRows:mrnaRows,positionRows:[],openingPlan:mrnaPlan,manualRecommendations:buildC1ManualRecommendations({decision:mrnaDecision,openingPlan:mrnaPlan})};
 const staleMrna={...mrnaDecision,brokerageCashCurrent:false,brokerageCashReason:'Brokerage cash is from an earlier Eastern date. Update Brokerage Cash before a new C1 purchase.'};
 const staleReason=c1OpportunityPresentation({decision:{...staleMrna,opportunities:[{symbol:'MRNA',rating:'Strong Buy'}]},plan:mrnaPlan,ready:true});
 assert.match(staleReason.tiles[0].detail,/earlier Eastern date/,'Current freshness status takes priority over a prior quantity cash review');
 const mrna=render(mrnaProps);
 assert.match(mrna,/100\.0\/100/);assert.match(mrna,/Strong Buy rating/);
 assert.doesNotMatch(section(mrna,'C1 account opportunities'),/<article/,'MRNA score and rating cannot create an executable order');
 if(process.env.C1_PRESENTATION_RENDER_DIR){
  fs.mkdirSync(process.env.C1_PRESENTATION_RENDER_DIR,{recursive:true});
  fs.writeFileSync(path.join(process.env.C1_PRESENTATION_RENDER_DIR,'opportunities.html'),renderRaw(mrnaProps));
  const staleCash=c1CashAvailability({strategyCash:1000,brokerageCash:{source:'manual-broker-balance',balance:363.36,observedAt:'2026-10-14T17:00:00Z'},now:new Date()});
  fs.writeFileSync(path.join(process.env.C1_PRESENTATION_RENDER_DIR,'cash.html'),renderRaw({...mrnaProps,decision:{...mrnaDecision,...staleCash}}));
 }
 const expired=render({manualRecommendations:{...review,validUntil:'2026-10-15T16:59:59Z'}});
 assert.doesNotMatch(expired,/Buy 2 shares|Add 1 share/,'Expired checks cannot authorize fresh capital');
 const fullSlots={...decision,positions:[position,{...position,symbol:'XXX'},{...position,symbol:'YYY'}]},fullPlan={...plan,orders:[]};
 const full=render({decision:fullSlots,executionDecision:fullSlots,openingPlan:fullPlan,manualRecommendations:buildC1ManualRecommendations({decision:fullSlots,openingPlan:fullPlan})});
 assert.match(full,/All C1 position slots are occupied\./);assert.doesNotMatch(full,/Buy 2 shares|Add 1 share/,'Full slots cannot create a new checked purchase');
 const poor={...decision,stockScreen:{...decision.stockScreen,candidates:decision.stockScreen.candidates.map(c=>c.symbol==='BBB'?{...c,recentMomentumGate:{...c.recentMomentumGate,entryAllowed:false}}:c)}};
 const blocked=render({decision:poor,executionDecision:poor});
 assert.doesNotMatch(section(blocked,'C1 account opportunities'),/Buy 2 shares/,'A checked order cannot override failed current momentum eligibility');
 assert.match(section(blocked,'Watch opportunities'),/<b>BBB<\/b>/,'The failed recent-momentum candidate returns to the original Watch table');
 const stoppedPosition={...position,stops:[{price:468.85}]},stoppedDecision={...decision,positions:[stoppedPosition]};
 const stoppedProps={decision:stoppedDecision,executionDecision:stoppedDecision,manualRecommendations:buildC1ManualRecommendations({decision:stoppedDecision,openingPlan:plan})};
 const stopped=render(stoppedProps),expected=c1PositionPresentation({decision:stoppedDecision,position:stoppedPosition,stock:screenRows.find(r=>r.symbol==='MPC')});
 assert.equal(expected.label,'SELL — STOP TRIGGERED');assert.equal(expected.quotePrice,100);
 assert.match(section(stopped,'Watch opportunities'),/SELL — STOP TRIGGERED/);assert.doesNotMatch(stopped,/Add 1 share/,'A verified stop overrides the existing checked Add');
 assert.equal(expected.quoteAt,new Date(now).toISOString(),'The accepted verified current quote timestamp remains unchanged');
 assert.match(stopped,/Signals based on 2026-10-14 close/,'An intraday quote does not fabricate a completed-session signal');
 const staleRows=screenRows.map(row=>({...row,quoteVerification:verifyC1Quote(row,new Date()),stale:true,clientSnapshotFallback:true}));
 const stale=render({...stoppedProps,positionRows:staleRows,screenRows:staleRows});
 assert.doesNotMatch(stale,/Buy 2 shares|Add 1 share/,'Stale prices and incomplete screen evidence fail closed for all fresh capital');
 assert.match(section(stale,'Watch opportunities'),/VERIFY STOP URGENTLY/,'An unverified apparent breach remains urgent in the historical UI');
 assert.doesNotMatch(stale,/SELL — STOP TRIGGERED/,'Stale quotes cannot manufacture a confirmed stop');
 const missingProofRows=screenRows.map(row=>({...row,_fmpQuoteObservation:undefined}));
 const missingProof=render({...stoppedProps,positionRows:missingProofRows,screenRows:missingProofRows});
 assert.match(section(missingProof,'Watch opportunities'),/VERIFY STOP URGENTLY/);assert.doesNotMatch(missingProof,/SELL — STOP TRIGGERED|Add 1 share/,'Missing proof cannot authorize a new exit or addition');
 assert.equal(c1PositionPresentation({decision:stoppedDecision,position:stoppedPosition,stock:missingProofRows.find(row=>row.symbol==='MPC')}).lastVerifiedQuoteAt,null,'Missing verification history cannot invent a verified timestamp');
 const coreDecision={...decision,positions:[position,{symbol:'DDD',role:'Swing',shares:2,exits:[]}]},coreRows=screenRows.map(row=>row.symbol==='DDD'?{...row,role:'Core'}:row);
 const coreInput={decision:coreDecision,executionDecision:coreDecision,positionRows:coreRows},coreBefore=JSON.stringify(coreInput);
 const coreHtml=render(coreInput),coreRow=section(coreHtml,'Watch opportunities').match(/<tr><td>Held<\/td><td><b>DDD<\/b>[\s\S]*?<\/tr>/)?.[0];
 assert.ok(coreRow,'A saved-position / Core-quote mismatch renders without crashing');
 assert.doesNotMatch(coreRow,/HOLD|SELL|VERIFY STOP/,'A Core quote cannot receive a Swing action adapter');
 assert.match(coreRow,/>WATCH</,'The original Watch row retains its neutral non-Swing action');
 assert.equal(JSON.stringify(coreInput),coreBefore,'The Core mismatch cannot rewrite saved ownership or role classifications');
 assert.equal(JSON.stringify(props),baseline,'Every historical-layout projection preserves checked orders, cash, holdings, costs and evidence');
 console.log('PASS: literal historical Buy tiles and separate Watch table retain checked quantities, current stop/urgency, momentum eligibility, cash limits, Core separation and immutable account facts.');

}finally{global.Date=RealDate;}
