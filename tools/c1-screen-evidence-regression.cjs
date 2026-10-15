const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const equal=(actual,expected,message)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),message);
const {buildC1StockScreenSnapshot, classifyC1StockScreen}=loader.load('lib/c1StockClassification.js');
const {resolveC1ScreenEvidence,readC1ScreenEvidence,writeC1ScreenEvidence}=loader.load('lib/c1ScreenEvidence.js');
const {readTop5Response}=loader.load('lib/top5Response.js');
const specs=[['MRNA','Health Care'],['HPE','Technology'],['MPC','Energy'],['DELL','Technology'],['VLO','Energy'],['ILMN','Health Care'],['AAA','Other'],['BBB','Other'],['CCC','Other']];
const session={date:'2026-10-09',signals:specs.map(([symbol,sector],i)=>({symbol,sector,companyName:symbol,cik:String(100+i),price:100,researchFactors:{momentumPercentile:99-i},entryTiming:{available:true,asOf:'2026-10-09',liquidityPass:true,averageDollarVolume20:500000000}}))};
const snapshot=buildC1StockScreenSnapshot(session);
const decision={contract:'c1-account-decision-v1',current:true,decisionId:'accepted-hash:1',sourceSessionDate:session.date,stockScreen:snapshot,positions:[{symbol:'DELL',exits:[],holdingRank:{base:{verified:true,eligible:true,rank:4,eligibleCount:500}},reason:'Momentum rank #4; original account holding explanation.',entryContext:{stage:'full'}}]};
const rows=specs.map(([symbol,sector])=>({symbol,sector,price:100,entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},expertDecision:{metrics:{quoteFreshnessPass:true}},eventRisk:{status:'Clear'},finalDecision:{action:'Watch',relativeCapitalScore:['DELL','ILMN'].includes(symbol)?200:0}}));
const crowded=[...rows,...Array.from({length:110},(_,i)=>({symbol:'X'+i,finalDecision:{action:'Watch',relativeCapitalScore:100-i}}))];
const api=fs.readFileSync('pages/api/top5.js','utf8'),start=api.indexOf('function compactRowsForClient('),end=api.indexOf('\n}',start)+2;
const compact=new Function('normalizeSymbol',api.slice(start,end)+';return compactRowsForClient;')(s=>String(s||'').toUpperCase());
const page=fs.readFileSync('pages/index.js','utf8');
const boundary=page.slice(page.indexOf('  function screenHealth('),page.indexOf('  async function fetchStock('));
function client(){
 const state={stocks:[],health:null,requests:[]};let resolveAccount;
 const box={accountView:null,portfolio:[],screenRequestId:{current:0},Date,setTimeout:fn=>{fn();},readTop5Response,
  refreshC1Account:()=>new Promise(resolve=>{resolveAccount=resolve;}),prepareC1Execution:()=>{},
  performanceHistory:async()=>({records:[],available:true}),signalPersistence:()=>({}),sym:r=>r.symbol,
  fetch:async url=>{state.requests.push(url);const u=new URL(url,'https://offline.invalid');return new Response(JSON.stringify({stocks:compact(crowded,80,'',u.searchParams.get('screenSymbols')||''),meta:{quoteFeedStatus:'live',fundamentalFeedStatus:'healthy'}}));},
  setReloading:()=>{},setErr:()=>{},setStocks:value=>{state.stocks=typeof value==='function'?value(state.stocks):value;},setFeedHealth:value=>{state.health=typeof value==='function'?value(state.health):value;},setMarketScope:()=>{},setMarketRadar:()=>{},setLastUpdated:()=>{},setApplicationRefreshAt:()=>{},setThemeStocks:()=>{},setThemeFeedHealth:()=>{}};
 vm.createContext(box);vm.runInContext(boundary+';this.loadScreen=load;',box);
 return {state,box,load:box.loadScreen,get account(){return resolveAccount;}};
}
async function main(){
 const c=client(),initial=c.load('opportunities');
 assert.equal(c.state.requests.length,0,'First load must wait for current account candidates');
 c.account({decision});await initial;
 assert.equal(c.state.stocks.length,80,'Compact response stays at 80 with all nine candidates');
 assert.equal(c.state.requests.length,1,'No fallback full-universe or second screen request');
 const symbols=new URL(c.state.requests[0],'https://offline.invalid').searchParams.get('screenSymbols').split(',');
 equal(symbols,snapshot.candidates.map(c=>c.symbol));
 const first=resolveC1ScreenEvidence({decision,rows:c.state.stocks,current:true});
 assert.equal(first.pending,false);equal(first.ratings,classifyC1StockScreen({snapshot,rows:c.state.stocks,current:true}));
 equal(first.buySymbols,['MRNA','HPE','MPC']);
 const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
 writeC1ScreenEvidence(storage,first);
 const restored=readC1ScreenEvidence(storage,decision);
 equal(restored.ratings,first.ratings,'Same accepted-source state survives a page remount');
 assert.equal(readC1ScreenEvidence(storage,{...decision,decisionId:'other-hash:1'}),null);
 writeC1ScreenEvidence(storage,{...first,verified:false});equal(readC1ScreenEvidence(storage,decision).ratings,first.ratings,'Pending state cannot overwrite verified cache');
 c.box.accountView={decision};const reload=c.load('opportunities',1);c.account({decision});await reload;
 const later=resolveC1ScreenEvidence({decision,rows:c.state.stocks,current:true,previous:first});
 equal(later.ratings,first.ratings,'First load/reload exact ranking, eligibility and selected/Watch parity');
 for(let i=0;i<10;i++)equal(resolveC1ScreenEvidence({decision,rows:c.state.stocks,current:true,previous:first}).ratings,first.ratings);
 const partial=compact(crowded,80),pending=resolveC1ScreenEvidence({decision,rows:partial,current:true,previous:first});
 assert.equal(pending.pending,true);equal(pending.ratings,first.ratings);equal(pending.buySymbols,[]);
 const cold=resolveC1ScreenEvidence({decision,rows:partial,current:true});assert.equal(cold.pending,true);assert.ok(cold.ratings.every(r=>r.rating==='Watch'));
 assert.match(cold.reason,/verification is pending/);assert.doesNotMatch(cold.reason,/ineligible/);
 const stale=rows.map(r=>({...r,clientSnapshotFallback:true}));assert.equal(resolveC1ScreenEvidence({decision,rows:stale,current:true,previous:first}).pending,true);
 for(const mutate of [r=>r.eventRisk.blockNewCapital=true,r=>r.price=104,r=>r.expertDecision.metrics.quoteFreshnessPass=false,r=>r.entryTiming.averageDollarVolume20=1000000]){
  const blocked=structuredClone(rows);mutate(blocked[0]);const state=resolveC1ScreenEvidence({decision,rows:blocked,current:true,previous:first});
  assert.equal(state.pending,true);equal(state.ratings,first.ratings);equal(state.buySymbols,[],'Changed gates cannot authorize fresh capital or substitute lower names');
 }
 equal(resolveC1ScreenEvidence({decision:{...decision,decisionId:'accepted-hash:2'},rows,current:true,previous:first}).ratings,first.ratings,'Cash/account revisions do not replace source identity');
 const revised={...decision,decisionId:'new-accepted-hash:2',stockScreen:structuredClone(snapshot)};revised.stockScreen.candidates[0].sourcePrice=90;
 assert.notDeepEqual(resolveC1ScreenEvidence({decision:revised,rows,current:true,previous:first}).key,first.key,'Accepted source revision invalidates old selection');
 // Execute actual component projection and markup with persistent refs, without
 // a browser, provider calls, account saves or fabricated opening authority.
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
 const file=path.resolve('components/C1AccountOpportunities.js'),effects=[],refs=[],states=[];let refIndex=0,stateIndex=0;
 const mockReact={...React,useRef:value=>refs[refIndex++]||(refs[refIndex-1]={current:value}),useState:value=>{const index=stateIndex++;if(!(index in states))states[index]=value;return [states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},useEffect:fn=>effects.push(fn)};
 function component(file,libs=loader){
  const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code,record={exports:{}};
  new Function('require','module','exports',compiled)(name=>name==='react'?mockReact:name.startsWith('../lib/')?libs.load(name,file):name.startsWith('.')?component(path.resolve(path.dirname(file),name.endsWith('.js')?name:name+'.js'),libs):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
  return record.exports;
 }
 const Component=component(file).default;
 function render(screenRows){refIndex=0;stateIndex=0;effects.length=0;const node=Component({decision,screenRows,screenCurrent:true});const html=renderToStaticMarkup(node);effects.slice(1).forEach(effect=>effect());return html.replace(/\sclass="[^"]*"/g,'');}
 const html=render(rows),heldRow=html.match(/<tr><td>Held<\/td><td><b>DELL<\/b>[\s\S]*?<\/tr>/)?.[0];
 assert.ok(heldRow,'The existing holding remains in the original separate Watch table');
 assert.match(heldRow,/<b>HOLD<\/b>/,'A held stock without a confirmed exit retains the current Hold action');
 assert.equal(decision.positions[0].holdingRank.base.rank,4,'The supplied verified holding rank remains unchanged by presentation');
 assert.equal(decision.positions[0].reason,'Momentum rank #4; original account holding explanation.','The original account explanation remains unchanged');
 assert.match(heldRow,/96\.0\/100/);assert.match(heldRow,/\$100\.00/,'The original score and signal price remain readable');
 assert.match(html,/<td>4<\/td><td><b>VLO<\/b>/);assert.match(html,/<td>5<\/td><td><b>ILMN<\/b>/,'Held identity does not consume an independent Watch priority');
 equal([...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]),first.buySymbols,'The original main tiles preserve exactly the accepted Buy-rated membership and order');
 const watchSymbols=markup=>[...markup.slice(markup.indexOf('aria-label="Watch opportunities"')).matchAll(/<tr><td>[^<]+<\/td><td><b>([^<]+)<\/b>/g)].map(match=>match[1]);
 equal(watchSymbols(html),['DELL','VLO','ILMN','AAA','BBB','CCC'],'The original Watch table preserves accepted membership and order');
 const assertPaused=markup=>{
  equal([...markup.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]),first.buySymbols,'Pending evidence retains the historical ranked tiles without authorizing purchases');
  for(const symbol of first.buySymbols)assert.match(markup,new RegExp('<h3>'+symbol+'<\\/h3><b>NO PURCHASE<\\/b>'),'Unverified ranked tiles remain neutral');
  assert.doesNotMatch(markup,/(?:buy|add) \d+ shares?/i,'Pending evidence cannot authorize any purchase or completion quantity');
  equal(watchSymbols(markup),['DELL','VLO','ILMN','AAA','BBB','CCC'],'Pending evidence retains the independent Watch members and order');
 };
 const pendingHtml=render(partial);assert.match(pendingHtml,/verification is pending/);assert.doesNotMatch(pendingHtml,/currently ineligible/);assertPaused(pendingHtml);
 // Browser omission can suppress a server-checked Buy/Add recommendation,
 // but cannot generate or mutate the independent server recommendation.
 const RealDate=Date;
 global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-10-12T14:00:00Z']));}static now(){return RealDate.parse('2026-10-12T14:00:00Z');}};
 try{
  const fixed=createResearchModuleLoader(process.cwd()),entryDecision={...decision,contract:'c1-account-decision-v1',revision:1,decisionId:'quantity-source:1',positions:[{symbol:'DELL',exits:[],entryContext:{stage:'full'}},{symbol:'HPE',exits:[],entryContext:{stage:'half'}}]};
  const plan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,sourceSessionDate:session.date,date:'2026-10-12',observedAt:'2026-10-12T14:00:00Z',quoteValidUntil:'2026-10-12T14:02:00Z',sourceReceipt:{observedAt:'2026-10-12T14:00:00Z',membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},orders:[{id:'new',symbol:'MRNA',side:'buy',shares:2,estimatedPrice:100,phase:3},{id:'add',symbol:'HPE',side:'buy',shares:3,estimatedPrice:100,phase:3},{id:'exit',symbol:'DELL',side:'sell',shares:4,estimatedPrice:100,phase:1}]};
  const manual=fixed.load('lib/c1ManualRecommendations.js'),review=manual.buildC1ManualRecommendations({decision:entryDecision,openingPlan:plan});assert.equal(review.status,'ready');
  const serverEvidence=JSON.stringify({plan,review}),Entry=component(file,fixed).default;
  function actions(screenRows){refIndex=0;stateIndex=0;effects.length=0;const node=Entry({decision:entryDecision,executionDecision:entryDecision,manualRecommendations:review,openingPlan:plan,screenRows,screenCurrent:true,view:'portfolio'});const html=renderToStaticMarkup(node);effects.at(-1)();return html;}
  const checked=actions(rows);assert.match(checked,/Buy 2 shares/);assert.match(checked,/Add 3 shares/);assert.match(checked,/sell 4 shares/);
  const omitted=actions(partial);assert.doesNotMatch(omitted,/(?:buy 2|add 3) shares/i);assert.match(omitted,/sell 4 shares/,'Missing entry evidence does not suppress checked exits');
  assert.equal(JSON.stringify({plan,review}),serverEvidence,'Compact evidence cannot change server orders or quantities');
 }finally{global.Date=RealDate;}
 const previousWindow=global.window;
 try{
  global.window={localStorage:storage};refs.length=0;states.length=0;
  assert.match(render(partial),/verification is pending/,'A new mount must restore before trusting browser cache');
  const restoredMarkup=render(partial);
  assertPaused(restoredMarkup);
  assert.doesNotMatch(restoredMarkup,/currently ineligible/);assert.match(restoredMarkup,/verification is pending/);
  equal(readC1ScreenEvidence(storage,decision).ratings,first.ratings);
 }finally{if(previousWindow===undefined)delete global.window;else global.window=previousWindow;}
 // An earlier screen response cannot publish after the newer refresh.
 const race=client(),a=race.load('opportunities');const oldAccount=race.account;const b=race.load('opportunities');race.account({decision});await b;const saved=JSON.stringify(race.state.stocks);oldAccount({decision});await a;
 assert.equal(race.state.requests.length,1);assert.equal(JSON.stringify(race.state.stocks),saved);
 assert.equal(JSON.stringify(session),JSON.stringify({date:'2026-10-09',signals:specs.map(([symbol,sector],i)=>({symbol,sector,companyName:symbol,cik:String(100+i),price:100,researchFactors:{momentumPercentile:99-i},entryTiming:{available:true,asOf:'2026-10-09',liquidityPass:true,averageDollarVolume20:500000000}}))}),'Source inputs are not mutated');
 console.log('PASS: first load/reload and ten repeats have exact C1 parity; nine required candidates in 80 compact rows; incomplete/stale/changed evidence retains verified composition and pauses fresh capital; held priorities preserved; superseded requests fenced.');
}
const watchdog=setTimeout(()=>{console.error('C1 screen evidence regression did not complete');process.exit(1);},10000);
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>clearTimeout(watchdog));
