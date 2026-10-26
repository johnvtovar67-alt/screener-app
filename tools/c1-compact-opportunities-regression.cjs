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
 assert.match(main,/<h3>MPC<\/h3><b(?: style="[^"]*")?>HOLD<\/b>/,'The current held-share Hold action replaces the historical generic Add headline');
 assert.match(main,/Add 1 share/,'The original checked partial-position completion is retained separately');
 assert.match(main,/Signal closing price/);assert.match(main,/Momentum score: 99\.0\/100/);
 assert.match(main,/Sector0 · Strong Buy rating as of 2026-10-14/,'The historical rating and source metadata remain in the original tile');
 const raw=renderRaw({}),rawMain=section(raw,'C1 account opportunities');
 assert.match(article(rawMain,'BBB'),/class="[^"]*pill green[^"]*"[^>]*>Strong Buy</,'A checked purchase retains its green investment action');
 assert.match(article(rawMain,'MPC'),/class="[^"]*pill yellow[^"]*"[^>]*>HOLD</,'The current Hold status remains distinct from its checked Add proposal');
 for(const symbol of ['BBB','MPC']){
  const rawCard=article(rawMain,symbol),plan=rawCard.match(/class="[^"]*\bplan\b[^"]*">([\s\S]*?)<\/div>/)?.[1]||'';
  assert.match(plan,new RegExp('<small[^>]*>'+(symbol==='MPC'?'Your position':'Purchase check')+'<\\/small>'),'The account label identifies held positions separately from new purchase checks');
  if(symbol!=='CCC')assert.match(plan,/opening reference \$100\.00/,'Cards retain the exact checked execution reference');
  const sentence=plan.match(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/)?.[1]||'';
  assert.equal((sentence.match(/[.!?](?=\s+[A-Z]|$)/g)||[]).length,1,'Each decision reason is one sentence');
  assert.doesNotMatch(sentence,/MACD|histogram|confirmation|top[- ](?:six|nine)|rank #|1\/3\/5|bps|cooldown|\d+[- ]session/i,'Technical calculations and rules remain internal');
 }
 assert.doesNotMatch(watch,/<b>CCC<\/b>/,'Verified Buy with blocked purchase stays in Buy ratings, not Watch');
 assert.match(main,/<h3>CCC<\/h3>/,'Verified Buy remains visible without an authorized purchase');
 assert.equal((article(main,'MPC').match(/>HOLD</g)||[]).length,1,'The holding action is not duplicated inside its reason');
 assert.match(watch,/<th>Priority<\/th><th>Stock \/ Sector<\/th><th>Momentum score<\/th><th>Signal closing price<\/th><th>Entry check<\/th>/,'The original five-column Watch table is restored');
 assert.match(watch,/<td>4<\/td><td><b>DDD<\/b>/,'Historical Watch priority remains after three verified Buy ratings');
 assert.doesNotMatch(watch,/<article|BUY \d+ shares/,'Watch remains a separate table without purchase instructions');
 assert.doesNotMatch(main+watch,/<details|Recent momentum<\/h4>|compactReason/,'The rejected rebuilt card/details layout is absent');
 const noOrders={...plan,orders:[]},noReview=buildC1ManualRecommendations({decision,openingPlan:noOrders});
 const paused=render({openingPlan:noOrders,manualRecommendations:noReview});
 assert.doesNotMatch(paused,/Buy 2 shares|Add 1 share/,'A ranking alone cannot create an executable quantity');
 // Rating, authorization and cash explanations are independent presentation concerns.
 assert.match(paused,/Purchase check/);
 assert.doesNotMatch(paused,/No C1 Buy ratings|Candidates awaiting a C1 Buy rating/);
 assert.match(paused,/Includes blocked Buy-rated candidates/);
 assert.match(section(paused,'C1 account opportunities'),/Strong Buy rating/,'Verified candidates retain their investment rating');
 const {c1CashAvailability}=loader.load('lib/c1BrokerageCash.js');
 const {c1OpportunityPresentation}=loader.load('lib/c1EntryReview.js');
 for(const [name,balance,observedAt,strategyCash,reasons,expected] of [
  ['stale',363.36,'2026-10-14T17:00:00Z',1000,[],/earlier Eastern date/],
  ['strategy independent',363.36,now,0,[],null],
  ['legacy funding review',363.36,now,10,['insufficient-cash'],/historical sleeve cash is not a brokerage funding limit/],
  ['broker quantity',363.36,now,1000,['brokerage-cash-insufficient'],/brokerage cash is insufficient/],
 ]){
  const cash=c1CashAvailability({strategyCash,brokerageCash:{source:'manual-broker-balance',balance,observedAt},now:new Date()});
  const cashDecision={...decision,...cash},cashPlan={...noOrders,entryReviews:[],cashBlockedOrders:reasons.map(reason=>({symbol:'BBB',reason}))};
  const before=JSON.stringify({cashDecision,cashPlan});
  const output=c1OpportunityPresentation({decision:{...cashDecision,opportunities:[{symbol:'BBB',rating:'Buy'}]},plan:cashPlan,ready:true});
  if(expected)assert.match(output.cashReason,expected,name+' exposes the actual cash gate');else assert.equal(output.cashReason,null,'Low accounting cash cannot invent a funding block');
  if(name==='stale')assert.equal(cash.executableCash,0);else assert.equal(cash.executableCash,balance);
  const cashHtml=render({decision:cashDecision,executionDecision:cashDecision,openingPlan:cashPlan,manualRecommendations:buildC1ManualRecommendations({decision:cashDecision,openingPlan:cashPlan})});
  if(expected)assert.match(cashHtml,expected,name+' renders the authoritative cash reason');else assert.doesNotMatch(cashHtml,/strategy cash is exhausted/);
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
 assert.match(section(mrna,'C1 account opportunities'),/<h3>MRNA<\/h3>/,'Verified MRNA rating is visible without an executable order');assert.doesNotMatch(section(mrna,'C1 account opportunities'),/Buy \d+ shares|Add \d+ shares/,'MRNA rating cannot create an executable order');
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
 assert.match(full,/<h3[^>]*>BBB<\/h3>/,'Full slots still display verified Buy rating');assert.doesNotMatch(full,/Buy 2 shares|Add 1 share/,'Full slots cannot create a new checked purchase');
 const poor={...decision,stockScreen:{...decision.stockScreen,candidates:decision.stockScreen.candidates.map(c=>c.symbol==='BBB'?{...c,recentMomentumGate:{...c.recentMomentumGate,entryAllowed:false}}:c)}};
 const blocked=render({decision:poor,executionDecision:poor});
 assert.doesNotMatch(section(blocked,'C1 account opportunities'),/Buy 2 shares/,'A checked order cannot override failed current momentum eligibility');
 assert.match(section(blocked,'Watch opportunities'),/<b>BBB<\/b>/,'The failed recent-momentum candidate returns to the original Watch table');
 const stoppedPosition={...position,stops:[{price:468.85}]},stoppedDecision={...decision,positions:[stoppedPosition]};
 const stoppedProps={decision:stoppedDecision,executionDecision:stoppedDecision,manualRecommendations:buildC1ManualRecommendations({decision:stoppedDecision,openingPlan:plan})};
 const stopped=render(stoppedProps),expected=c1PositionPresentation({decision:stoppedDecision,position:stoppedPosition,stock:screenRows.find(r=>r.symbol==='MPC')});
 assert.equal(expected.label,'SELL — STOP TRIGGERED');assert.equal(expected.quotePrice,100);
 assert.match(stopped,/SELL — STOP TRIGGERED/,'Verified stop must remain visible in account opportunities');assert.doesNotMatch(stopped,/Add 1 share/,'A verified stop overrides the existing checked Add');
 assert.equal(expected.quoteAt,new Date(now).toISOString(),'The accepted verified current quote timestamp remains unchanged');
 assert.match(stopped,/Signals based on 2026-10-14 close/,'An intraday quote does not fabricate a completed-session signal');
 const staleRows=screenRows.map(row=>({...row,quoteVerification:verifyC1Quote(row,new Date()),stale:true,clientSnapshotFallback:true}));
 const stale=render({...stoppedProps,positionRows:staleRows,screenRows:staleRows});
 assert.doesNotMatch(stale,/Buy 2 shares|Add 1 share/,'Stale prices and incomplete screen evidence fail closed for all fresh capital');
 assert.doesNotMatch(render({...stoppedProps,view:'portfolio',positionRows:staleRows,screenRows:staleRows}),/data-action="SELL"/,'Stale stop evidence cannot authorize a Portfolio sale');
 assert.doesNotMatch(stale,/SELL — STOP TRIGGERED/,'Stale quotes cannot manufacture a confirmed stop');
 const missingProofRows=screenRows.map(row=>({...row,_fmpQuoteObservation:undefined}));
 const missingProof=render({...stoppedProps,positionRows:missingProofRows,screenRows:missingProofRows});
 assert.doesNotMatch(render({...stoppedProps,view:'portfolio',positionRows:missingProofRows,screenRows:missingProofRows}),/data-action="SELL"/,'Missing stop proof cannot authorize a Portfolio sale');assert.doesNotMatch(missingProof,/SELL — STOP TRIGGERED|Add 1 share/,'Missing proof cannot authorize a new exit or addition');
 assert.equal(c1PositionPresentation({decision:stoppedDecision,position:stoppedPosition,stock:missingProofRows.find(row=>row.symbol==='MPC')}).lastVerifiedQuoteAt,null,'Missing verification history cannot invent a verified timestamp');
 const coreDecision={...decision,positions:[position,{symbol:'DDD',role:'Swing',shares:2,exits:[]}]},coreRows=screenRows.map(row=>row.symbol==='DDD'?{...row,role:'Core'}:row);
 const coreInput={decision:coreDecision,executionDecision:coreDecision,positionRows:coreRows},coreBefore=JSON.stringify(coreInput);
 const coreHtml=render(coreInput),coreRow=section(coreHtml,'Watch opportunities').match(/<tr><td>Held<\/td><td><b>DDD<\/b>[\s\S]*?<\/tr>/)?.[0];
 assert.ok(coreRow,'A saved-position / Core-quote mismatch renders without crashing');
 assert.doesNotMatch(coreRow,/HOLD|SELL|VERIFY STOP/,'A Core quote cannot receive a Swing action adapter');
 assert.match(coreRow,/>WATCH</,'The original Watch row retains its neutral non-Swing action');
 assert.equal(JSON.stringify(coreInput),coreBefore,'The Core mismatch cannot rewrite saved ownership or role classifications');
 // The summary renders the existing authority exactly once per checked instruction.
 const summary=markup=>section(markup,'Portfolio actions');
 const summaryBase=summary(render({view:'portfolio'}));
 assert.equal(summary(html),'','Opportunities has no action summary');
 assert.doesNotMatch(main,/C1 action summary|Checked recommendation listed above/,'Cards must stand alone without summary redirects');
 const allocations={...plan,orders:[{...plan.orders[0],id:'new.base',sleeve:'base',shares:1},{...plan.orders[0],id:'new.cooldown',sleeve:'cooldown15',shares:1},plan.orders[1]]};
 const allocationBefore=JSON.stringify(allocations);
 const allocationHtml=render({openingPlan:allocations,manualRecommendations:buildC1ManualRecommendations({decision,openingPlan:allocations})});
 assert.equal((allocationHtml.match(/Buy 2 shares/g)||[]).length,1,'The existing lossless display grouping combines identical sleeve instructions exactly once');
 assert.equal(JSON.stringify(allocations),allocationBefore,'Grouping preserves original per-sleeve quantities and order IDs');
 const distinct={...allocations,orders:allocations.orders.map(order=>order.id==='new.cooldown'?{...order,estimatedPrice:101}:order)};
 const distinctHtml=render({openingPlan:distinct,manualRecommendations:buildC1ManualRecommendations({decision,openingPlan:distinct}),view:'portfolio'});
 assert.equal((distinctHtml.match(/Buy 1 share/g)||[]).length,2,'Different checked references remain separate instructions rather than losing a group or inventing a combined price');
 assert.match(summary(distinctHtml),/opening reference \$100\.00/);assert.match(summary(distinctHtml),/opening reference \$101\.00/);


 assert.equal((html.match(/Buy 2 shares/g)||[]).length,1,'The Buy quantity appears once in its Opportunities card');
 assert.equal((html.match(/Add 1 share/g)||[]).length,1,'The Add quantity appears once; no second instruction is created');
 assert.match(summaryBase,/data-action="ADD"[\s\S]*?Add 1 share/);
 assert.doesNotMatch(summaryBase,/data-action="HOLD"|data-action="WAIT"|Some purchases remain blocked/,'Only trades and urgent verification belong in the orange box');
 assert.doesNotMatch(watch,/<b>CCC<\/b>/,'A verified Buy-rated CCC remains in the Buy grid even when its cash review blocks purchase');
 const commonDecision={...decision,stockScreen:{...decision.stockScreen,candidates:[decision.stockScreen.candidates[0]]}};
 const commonPlan={...plan,orders:[],entryReviews:[{symbol:'BBB',reason:'brokerage-cash-insufficient'}]};
 const commonHtml=render({decision:commonDecision,executionDecision:commonDecision,openingPlan:commonPlan,manualRecommendations:buildC1ManualRecommendations({decision:commonDecision,openingPlan:commonPlan})});
 assert.equal(summary(commonHtml),'');
 assert.match(section(commonHtml,'C1 account opportunities'),/Purchase check/,'A verified Buy rating retains its separate account purchase review');assert.doesNotMatch(commonHtml,/Buy 2 shares|Add 1 share/,'Cash restriction cannot create a checked order');
 assert.equal(summary(render({decision:commonDecision,executionDecision:commonDecision,openingPlan:commonPlan,manualRecommendations:buildC1ManualRecommendations({decision:commonDecision,openingPlan:commonPlan}),view:'portfolio'})),'','A blocked purchase alone never creates an orange box');

 const stopRow={...position,symbol:'DELL',action:'Exit candidate',stops:[{price:468.85}],exits:[{reason:'initial-stop'}],stopTriggerEvidence:{low:460,stop:468.85,date:decision.sourceSessionDate}};
 const verifyRow={...position,symbol:'UUU',stops:[{price:86}]};
 const weakRow={...position,symbol:'VEEV',action:'Review',momentumEvidence:{status:'available',classification:'Momentum Weakening'}};
 const quoteFor=(symbol,price,verified=true)=>({...screenRows[0],symbol,price,_fmpQuoteObservation:verified?{...screenRows[0]._fmpQuoteObservation,symbol,price}:undefined});
 const mixedDecision={...decision,positions:[stopRow,verifyRow,weakRow]};
 const mixedPlan={...plan,orders:[plan.orders[0],{id:'sell-dell',symbol:'DELL',side:'sell',shares:3,estimatedPrice:460,reason:'initial-stop',phase:1}]};
 const mixedProps={decision:mixedDecision,executionDecision:mixedDecision,openingPlan:mixedPlan,manualRecommendations:buildC1ManualRecommendations({decision:mixedDecision,openingPlan:mixedPlan}),positionRows:[quoteFor('DELL',460),quoteFor('UUU',85,false),quoteFor('VEEV',100)]};
 const mixedBefore=JSON.stringify(mixedProps);
 const mixedOpportunities=render({...mixedProps,view:'opportunities'});
 assert.equal(summary(mixedOpportunities),'','SELL and VERIFY must not be repeated in Opportunities');
 assert.match(article(mixedOpportunities,'BBB'),/Buy 2 shares/);
 const rendered=render({...mixedProps,view:'portfolio'}),actions=summary(rendered);
 const ordered=[...actions.matchAll(/<li data-action="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(ordered,['SELL','BUY','VERIFY']);
 assert.match(actions,/DELL: SELL — STOP TRIGGERED/);
 assert.equal((actions.match(/\$468\.85/g)||[]).length,1,'DELL stop appears once, even when the proof has the same stop');
 assert.match(actions,/recorded low \$460\.00/);assert.match(actions,/verify Schwab order\/fill status/);
 assert.equal((rendered.match(/sell 3 shares/g)||[]).length,1,'Only the checked remaining sale quantity is instructed');
 assert.match(actions,/Urgent verification — not authorized trades/);assert.match(actions,/VERIFY — UUU/);
 assert.doesNotMatch(actions,/UUU: SELL|data-action="HOLD"|data-action="WAIT"|VEEV|Momentum weakening|sale pending|order submitted|order executed/i);
 assert.doesNotMatch(actions,/keep the proceeds unallocated/,'An authorized replacement purchase suppresses the unallocated-capital message');
 const holdOnly={...decision,positions:[weakRow],stockScreen:{...decision.stockScreen,candidates:[]}};
 assert.equal(render({decision:holdOnly,executionDecision:holdOnly,openingPlan:null,manualRecommendations:null,positionRows:[quoteFor('VEEV',100)],view:'portfolio'}),'','Routine HOLDs, including those absent from Watch, never create the orange box');
 assert.equal(c1PositionPresentation({decision:holdOnly,position:weakRow,stock:quoteFor('VEEV',100)}).label,'HOLD','Weakening momentum keeps the existing HOLD authority for the portfolio table');
 const verifyOnly={...holdOnly,positions:[verifyRow]};
 const urgentOnly=summary(render({decision:verifyOnly,executionDecision:verifyOnly,openingPlan:null,manualRecommendations:null,positionRows:[quoteFor('UUU',85,false)],view:'portfolio'}));
 assert.match(urgentOnly,/VERIFY — UUU/);assert.doesNotMatch(urgentOnly,/data-action="SELL"|data-action="BUY"|data-action="ADD"|keep the proceeds unallocated/);
 assert.equal(JSON.stringify(mixedProps),mixedBefore,'Summary rendering preserves holdings, stops, account identity and checked order allocations');
 const mismatched=summary(render({...mixedProps,decision:{...mixedDecision,current:false,accountMismatch:true},openingPlan:null,view:'portfolio'}));
 assert.doesNotMatch(mismatched,/data-action="SELL"|data-action="BUY"|data-action="ADD"|data-action="HOLD"/,'Account differences retain the existing ownership verification gate');
 assert.equal(mismatched,'','Account mismatch does not generate a routine WAIT box');
 const noQuantityProps={...mixedProps,openingPlan:null,manualRecommendations:{...mixedProps.manualRecommendations,status:'waiting',orders:[]}};
 const noQuantity=summary(render({...noQuantityProps,view:'portfolio'}));
 assert.match(noQuantity,/keep the proceeds unallocated pending a verified C1 Buy/);
 assert.match(noQuantity,/DELL: SELL — STOP TRIGGERED/);assert.match(noQuantity,/Recorded holding: 10 shares/);assert.match(noQuantity,/Verify the exit quantity against the recorded sleeve holdings/);
 assert.doesNotMatch(noQuantity,/sell \d+ shares|Buy \d+ shares|Add \d+ shares/,'A recorded signal alone cannot authorize any quantity');
 const duplicatedStopDecision={...mixedDecision,positions:[{...stopRow,stops:[{price:468.85},{price:468.85}]}]};
 const duplicateStops=summary(render({...noQuantityProps,decision:duplicatedStopDecision,executionDecision:duplicatedStopDecision,view:'portfolio'}));
 assert.equal((duplicateStops.match(/\$468\.85/g)||[]).length,1,'Repeated recorded sleeve stops display the original level once');

 for(const [exit,label] of [['recent-momentum-deterioration','SELL — MOMENTUM EXIT'],['recent-momentum-profit-protection','SELL — PROFIT PROTECTION']]){
  const exitPosition={...stopRow,stops:[{price:86},{price:87}],stopTriggerEvidence:undefined,exits:[{reason:exit}]};
  const exitDecision={...decision,positions:[exitPosition]};
  const exitHtml=summary(render({decision:exitDecision,executionDecision:exitDecision,openingPlan:null,manualRecommendations:null,positionRows:[quoteFor('DELL',100)],view:'portfolio'}));
  assert.match(exitHtml,new RegExp(label));assert.match(exitHtml,/Recorded stops: \$86\.00, \$87\.00/,'Non-stop exits retain every recorded stop without changing thresholds');
  assert.match(exitHtml,/Recorded holding: 10 shares/);assert.doesNotMatch(exitHtml,/sell \d+ shares/);
 }
 const multiStop={...stopRow,stops:[{price:86},{price:87}],stopTriggerEvidence:{low:85,stop:86,date:decision.sourceSessionDate}},multiDecision={...decision,positions:[multiStop]};
 assert.match(summary(render({decision:multiDecision,executionDecision:multiDecision,openingPlan:null,manualRecommendations:null,positionRows:[quoteFor('DELL',85)],view:'portfolio'})),/Recorded stops: \$86\.00, \$87\.00/,'A confirmed stop displays multiple original recorded levels without manufacturing a single threshold');
 const quoteOnlyDecision={...decision,positions:[{...stopRow,action:'Hold',stops:[{price:86}],exits:[],stopTriggerEvidence:undefined}]};
 const quoteOnly={decision:quoteOnlyDecision,executionDecision:quoteOnlyDecision,openingPlan:null,manualRecommendations:null,positionRows:[quoteFor('DELL',85)],view:'portfolio'};
 assert.match(summary(render(quoteOnly)),/DELL: SELL — STOP TRIGGERED/,'Existing verified quote-based stop presentation is reused');
 const expiredQuote={...quoteOnly,positionRows:[{...quoteFor('DELL',85),timestamp:Date.now()/1000-121}]};
 assert.match(summary(render(expiredQuote)),/VERIFY — DELL/);assert.doesNotMatch(summary(render(expiredQuote)),/data-action="SELL"/,'Expired quote proof cannot remain a confirmed intraday breach');
 const conditionalPlan={...mixedPlan,orders:mixedPlan.orders.map(order=>({...order,condition:'stop-triggered'}))};
 const conditionalDecision={...decision,positions:[position]};
 const conditionalHtml=render({decision:conditionalDecision,executionDecision:conditionalDecision,openingPlan:conditionalPlan,manualRecommendations:buildC1ManualRecommendations({decision:conditionalDecision,openingPlan:conditionalPlan}),view:'portfolio'});
 assert.doesNotMatch(summary(conditionalHtml),/data-action="BUY"|data-action="ADD"|data-action="SELL"/,'Conditional orders are not immediate instructions');
 for(const patch of [{manualRecommendations:{...review,validUntil:now}},{executionDecision:{...decision,revision:2}},{decision:{...decision,current:false}},{decision:{...decision,current:false,accountMismatch:true},openingPlan:null}]){
  const actions=summary(render({...patch,view:'portfolio'}));assert.equal(actions,'','Stale or mismatched purchase authorization without an exit/urgent condition hides the orange box');
  assert.doesNotMatch(render(patch),/Buy \d+ shares|Add \d+ shares/,'Stale or mismatched authority never creates purchases');
 }
 // Consume the real existing fill-reconciliation output, never subtract fills in the view.
 const {reconcileC1ActualAccountFills}=loader.load('lib/c1AccountLedger.js');
 const fillPlan={...plan,openingBooks:{base:{cash:1000,positions:{}},cooldown15:{cash:0,positions:{}},sector40:{cash:0,positions:{}}},orders:[{...plan.orders[0],sleeve:'base'}]};
 const fill={id:'posted-buy',orderId:'new',symbol:'BBB',side:'buy',shares:1,price:100,fee:0,executedAt:now};
 const fillState={plan:fillPlan,fills:[fill]},fillBefore=JSON.stringify(fillState);
 const reconciled=reconcileC1ActualAccountFills({plan:fillPlan,fills:[fill],observedAt:now});
 const remainingPlan={...fillPlan,openingBooks:reconciled.books,orders:reconciled.outstanding},remainingReview=buildC1ManualRecommendations({decision,openingPlan:remainingPlan});
 const remainingHtml=render({openingPlan:remainingPlan,manualRecommendations:remainingReview});
 assert.equal((remainingHtml.match(/Buy 1 share/g)||[]).length,1,'The existing outstanding quantity is shown once after a recorded fill');
 assert.doesNotMatch(remainingHtml,/Buy 2 shares/,'A filled share cannot be offered again');
 const complete=reconcileC1ActualAccountFills({plan:fillPlan,fills:[{...fill,shares:2}],observedAt:now});
 const completePlan={...fillPlan,openingBooks:complete.books,orders:complete.outstanding};
 assert.doesNotMatch(summary(render({view:'portfolio',openingPlan:completePlan,manualRecommendations:buildC1ManualRecommendations({decision,openingPlan:completePlan})})),/data-action="BUY"|data-action="ADD"/,'A complete fill leaves no purchase instruction');
 const sellPlan={...mixedPlan,openingBooks:{base:{cash:0,positions:{DELL:{shares:10,avgCost:100,openedAt:'2026-10-01'}}},cooldown15:{cash:0,positions:{}},sector40:{cash:0,positions:{}}},orders:[{...mixedPlan.orders[1],sleeve:'base'}]};
 const saleFill={id:'posted-sale',orderId:'sell-dell',symbol:'DELL',side:'sell',shares:1,price:85,fee:0,executedAt:now};
 const saleBefore=JSON.stringify({sellPlan,saleFill});
 const sale=reconcileC1ActualAccountFills({plan:sellPlan,fills:[saleFill],observedAt:now});
 const remainingSale={...sellPlan,openingBooks:sale.books,orders:sale.outstanding};
 const saleHtml=render({...mixedProps,view:'portfolio',openingPlan:remainingSale,manualRecommendations:buildC1ManualRecommendations({decision:mixedDecision,openingPlan:remainingSale})});
 assert.equal((saleHtml.match(/sell 2 shares/g)||[]).length,1);assert.doesNotMatch(saleHtml,/sell 3 shares/,'The already recorded sale is never recommended twice');
 assert.equal(JSON.stringify({sellPlan,saleFill}),saleBefore,'Remaining-sale display leaves original books and actual fill records intact');
 assert.equal(JSON.stringify(fillState),fillBefore,'The summary cannot rewrite original fill identities or account books');
 if(process.env.C1_ACTION_SUMMARY_RENDER_DIR){
  fs.mkdirSync(process.env.C1_ACTION_SUMMARY_RENDER_DIR,{recursive:true});
  fs.writeFileSync(path.join(process.env.C1_ACTION_SUMMARY_RENDER_DIR,'authorized.html'),renderRaw({view:'portfolio'}));
  fs.writeFileSync(path.join(process.env.C1_ACTION_SUMMARY_RENDER_DIR,'no-replacement.html'),renderRaw({...noQuantityProps,view:'portfolio'}));
  fs.writeFileSync(path.join(process.env.C1_ACTION_SUMMARY_RENDER_DIR,'hold-only.html'),renderRaw({decision:holdOnly,executionDecision:holdOnly,openingPlan:null,manualRecommendations:null,positionRows:[quoteFor('VEEV',100)],view:'portfolio'}));
  for(const view of ['opportunities','portfolio'])fs.writeFileSync(path.join(process.env.C1_ACTION_SUMMARY_RENDER_DIR,view+'.html'),renderRaw({...mixedProps,view}));
 }
 assert.equal(JSON.stringify(props),baseline,'Every historical-layout projection preserves checked orders, cash, holdings, costs and evidence');
 console.log('PASS: literal historical Buy tiles and separate Watch table retain checked quantities, current stop/urgency, momentum eligibility, cash limits, Core separation and immutable account facts.');

}finally{global.Date=RealDate;}
