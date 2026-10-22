// Offline presentation regression. Supplied diagnostics may explain an existing
// blocked purchase; they may never create a rating, checked order or quantity.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const NativeDate=Date,originalFetch=global.fetch,now='2026-10-22T15:00:00.000Z',sourceDate='2026-10-21';
global.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return NativeDate.parse(now);}};
global.fetch=async()=>{throw Error('Network forbidden in purchase-reason presentation regression');};
const clone=value=>JSON.parse(JSON.stringify(value));
const rawReasons={MRNA:'Current quote verification is incomplete; fresh capital is paused.',CRWD:'A current material-event block prevents fresh capital.'};
const legacy={MRNA:'Current entry evidence needs verification; purchases are paused.',CRWD:'An unresolved company event blocks new capital.'};
const expected={MRNA:'Accepted 60-session volatility is 373.29%, above the 100.00% purchase limit; this stock is outside the C1 purchase queue.',CRWD:'Current event verification is incomplete; purchases remain paused.'};
try{
 const loader=createResearchModuleLoader(process.cwd()),{c1PlainDecisionReason:copy}=loader.load('lib/c1DecisionCopy.js');
 const symbols=['MRNA','CRWD','AAA'],prices={MRNA:245.81,CRWD:239.34,AAA:100};
 const candidates=symbols.map((symbol,index)=>({symbol,sector:'Sector'+index,issuer:symbol,sourcePrice:prices[symbol],researchRank:index+1,momentumPercentile:100-index*2.2,
  sourceTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},recentMomentumGate:{sourceSessionDate:sourceDate,available:true,entryAllowed:true}}));
 const decision={contract:'c1-account-decision-v1',decisionId:'copy-regression:1',revision:1,current:true,sourceSessionDate:sourceDate,positions:[],opportunities:[{symbol:'CRWD'}],
  brokerageCashCurrent:true,brokerageCash:5000,executableCash:5000,stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:sourceDate,candidates}};
 const plan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,sourceSessionDate:sourceDate,date:'2026-10-22',observedAt:now,quoteValidUntil:'2026-10-22T15:10:00.000Z',
  sourceReceipt:{provider:'FMP',observedAt:now,membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},orders:[],entryReviews:[],
  additionalSwingCapacity:{contract:'c1-qualified-swing-capacity-v1',sourceSessionDate:sourceDate,symbols:[],reviews:symbols.map(symbol=>({symbol,rating:'Watch',reason:rawReasons[symbol]||'Selected C1 opportunity #3; momentum rank #3.',next:'Refresh existing checks.'}))}};
 const baseline={date:sourceDate,decisionAt:sourceDate+'T21:00:00.000Z',signals:symbols.map(symbol=>({symbol,price:prices[symbol],researchFactors:{momentumPercentile:100,volatility60Pct:symbol==='MRNA'?373.29:30},
  eventRiskVerified:symbol==='CRWD'?false:true,eventRisk:symbol==='CRWD'?{status:'Manual',blockNewCapital:true,checkComplete:false}:{status:'Clear',blockNewCapital:false,checkComplete:true}}))};
 const report=loader.load('lib/c1PurchaseDiagnostics.js').buildC1PurchaseDiagnostics({baseline,sourceBasis:'REQUEST_ACCOUNT_BASELINE',decision,requestedSymbols:['CRWD','AAA'],collectionStatus:'RETURNED',
  collectedOpening:{prices:['CRWD','AAA'].map(symbol=>({symbol,open:prices[symbol],observedPrice:prices[symbol],observedAt:now})),receipt:{observedAt:now,quoteMaximumAgeSeconds:120}},
  plan,manualRecommendations:{status:'ready'},requestObservedAt:now,observedAt:now,commit:'a'.repeat(40)});
 const args=symbol=>({symbol,action:'NO PURCHASE',reason:rawReasons[symbol],decision,openingPlan:plan,purchaseDiagnostics:report});
 const original=JSON.stringify({decision,plan,report,baseline});
 for(const symbol of ['MRNA','CRWD']){
  assert.equal(copy(args(symbol)),expected[symbol]);
  assert.equal(copy({...args(symbol),purchaseDiagnostics:undefined}),legacy[symbol]);
 }
 const target=(a,symbol=a.symbol)=>a.purchaseDiagnostics.tickers.find(row=>row.symbol===symbol);
 const fallbacks=[
  ['missing report',a=>{a.purchaseDiagnostics=null;}],['unknown contract',a=>{a.purchaseDiagnostics.contract='foreign';}],
  ['unavailable report',a=>{a.purchaseDiagnostics.status='UNAVAILABLE';}],['executable report',a=>{a.purchaseDiagnostics.executable=true;}],
  ['foreign source',a=>{a.purchaseDiagnostics.source.sessionDate='2026-10-20';}],['foreign plan source',a=>{a.openingPlan.sourceSessionDate='2026-10-20';}],
  ['unknown source basis',a=>{a.purchaseDiagnostics.source.basis='UNAVAILABLE';}],['unknown source signal',a=>{target(a).source.signalPresent=null;}],
  ['absent source signal',a=>{target(a).source.signalPresent=false;}],['foreign signal source',a=>{target(a).source.signalSource='UNAVAILABLE';}],
  ['stale decision',a=>{a.decision.current=false;}],['account mismatch',a=>{a.decision.accountMismatch=true;}],
  ['unverified plan',a=>{a.openingPlan.providerVerified=false;}],['unknown plan availability',a=>{a.purchaseDiagnostics.review.openingPlanAvailable=null;}],
  ['unverified diagnostic plan',a=>{a.purchaseDiagnostics.review.providerVerified=false;}],['failed collection',a=>{a.purchaseDiagnostics.collection.status='FAILED';}],
  ['receipt from another request',a=>{a.purchaseDiagnostics.collection.receiptObservedAt='2026-10-22T14:59:00.000Z';}],['invalid receipt',a=>{a.purchaseDiagnostics.collection.receiptObservedAt='invalid';}],
  ['missing target',a=>{a.purchaseDiagnostics.tickers=a.purchaseDiagnostics.tickers.filter(row=>row.symbol!==a.symbol);}],
  ['duplicate target',a=>{a.purchaseDiagnostics.tickers.push(clone(target(a)));}],['malformed target array',a=>{a.purchaseDiagnostics.tickers={private:'HOSTILE_SENTINEL'};}],
  ['no actual capacity review',a=>{a.openingPlan.additionalSwingCapacity.reviews=[];}],['malformed capacity reviews',a=>{a.openingPlan.additionalSwingCapacity.reviews={private:'HOSTILE_SENTINEL'};}],
  ['duplicate actual review',a=>{a.openingPlan.additionalSwingCapacity.reviews.push(clone(a.openingPlan.additionalSwingCapacity.reviews.find(row=>row.symbol===a.symbol)));}],
  ['different actual reason',a=>{a.openingPlan.additionalSwingCapacity.reviews.find(row=>row.symbol===a.symbol).reason='A different existing gate blocked the purchase.';}],
  ['different capacity reason code',a=>{target(a).capacityReview.reasonCode='UNAVAILABLE';}],
  ['existing holding context',a=>{a.position={};}],['existing presentation context',a=>{a.presentation={};}],
 ];
 for(const symbol of ['MRNA','CRWD'])for(const [name,edit]of fallbacks){const changed=clone(args(symbol));edit(changed);assert.equal(copy(changed),legacy[symbol],symbol+' '+name+' must preserve legacy wording');}
 for(const [name,edit]of [
  ['native queue includes it',a=>{target(a).nativeQueueIncluded=true;}],['quote genuinely requested',a=>{target(a).opening.requested=true;}],
  ['quote returned',a=>{target(a).opening.observed=true;}],['missing requested quote',a=>{target(a).opening.status='MISSING';}],
  ['native volatility within limit',a=>{target(a).source.volatility60Pct=100;}],['invalid volatility',a=>{target(a).source.volatility60Pct='373.29';}],
  ['unknown limits',a=>{target(a).source.volatilityLimits=[];}],['malformed limits',a=>{target(a).source.volatilityLimits={private:'HOSTILE_SENTINEL'};}],
  ['unknown limit',a=>{target(a).source.volatilityLimits=[{maxVolatility60Pct:null,componentPredicatePass:false}];}],
  ['unconfirmed component',a=>{target(a).source.volatilityLimits[0].componentPredicatePass=null;}],
  ['unbounded diagnostic limits',a=>{target(a).source.volatilityLimits=Array.from({length:4},()=>({maxVolatility60Pct:100,componentPredicatePass:false}));}],
 ]){const changed=clone(args('MRNA'));edit(changed);assert.equal(copy(changed),legacy.MRNA,name);}
 for(const [name,edit]of [
  ['known adverse event',a=>{target(a).source.event.status='BLOCKED';}],['verified event',a=>{target(a).source.event.eventRiskVerified=true;}],
  ['complete event check',a=>{target(a).source.event.checkComplete=true;}],['event no longer blocks',a=>{target(a).source.event.blockNewCapital=false;}],
  ['independent current evidence exists',a=>{target(a).source.event.independentCurrentEvidence='AVAILABLE';}],
  ['unobserved quote',a=>{target(a).opening.observed=false;}],['unknown quote status',a=>{target(a).opening.status='UNAVAILABLE';}],
  ['stale quote component',a=>{target(a).opening.ageWithinLimitPass=false;}],
 ]){const changed=clone(args('CRWD'));edit(changed);assert.equal(copy(changed),legacy.CRWD,name);}
 const hostile=clone(args('MRNA'));hostile.purchaseDiagnostics.tickers[0].source.volatility60Pct='<script>HOSTILE_SENTINEL</script>';
 assert.equal(copy(hostile),legacy.MRNA);assert.doesNotMatch(copy(hostile),/HOSTILE_SENTINEL/);
 for(const symbol of ['MRNA','CRWD'])for(const action of ['BUY','STRONG BUY','ADD','HOLD','WATCH','SELL — MOMENTUM EXIT']){
  const a={...args(symbol),action};assert.equal(copy(a),copy({...a,purchaseDiagnostics:null}),action+' must not receive a No Purchase diagnostic explanation');
 }
 assert.equal(copy({...args('MRNA'),symbol:'OTHER'}),legacy.MRNA,'Only fixed diagnostic symbols may use the new copy');
 const stopped={...args('MRNA'),position:{stops:[{price:86}]},presentation:{stopTriggered:true,quoteVerified:true,quotePrice:85}};
 assert.equal(copy(stopped),copy({...stopped,purchaseDiagnostics:null}),'An inconsistent No Purchase argument cannot supersede an existing verified stop presentation');

 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core'),components=new Map();
 function component(relative){
  const file=path.resolve(relative);if(components.has(file))return components.get(file);
  const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code,record={exports:{}};
  new Function('require','module','exports',compiled)(name=>name.startsWith('../lib/')?loader.load(name,file):name.startsWith('.')?component(path.resolve(path.dirname(file),name.endsWith('.js')?name:name+'.js')):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
  components.set(file,record.exports);return record.exports;
 }
 const Component=component('components/C1AccountOpportunities.js').default;
 const {buildC1ManualRecommendations}=loader.load('lib/c1ManualRecommendations.js');
 const review=buildC1ManualRecommendations({decision,openingPlan:plan,now:new Date()});assert.equal(review.status,'ready');
 const api=fs.readFileSync('pages/api/index.js','utf8'),normalizerStart=api.indexOf('const normalizeSymbol='),normalizerEnd=api.indexOf('async function fetchQuote(',normalizerStart);
 assert(normalizerStart>=0&&normalizerEnd>normalizerStart);
 const normalizeQuote=new Function(api.slice(normalizerStart,normalizerEnd)+';return normalizeQuote;')();
 const {verifyC1Quote}=loader.load('lib/c1QuoteVerification.js');
 const screenRows=symbols.map(symbol=>{
  const provider={symbol,price:prices[symbol],timestamp:Date.now()/1000,_fmpQuoteCache:'live',_fmpQuoteProvider:'FMP',_fmpQuoteEndpoint:'quote',_fmpQuoteFetchedAt:now,
   _fmpQuoteObservation:{provider:'FMP',endpoint:'stable/quote',symbol,price:prices[symbol],timestamp:Date.now()/1000,fetchedAt:now}};
  const quote=normalizeQuote(provider,symbol),verification=verifyC1Quote(quote,new Date());assert.equal(verification.verifiedRegularSession,true);
  return {...quote,eventRisk:{status:'Clear',blockNewCapital:false},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000},expertDecision:{metrics:{quoteFreshnessPass:verification.verifiedRegularSession}}};
 });
 const props={decision,executionDecision:decision,openingPlan:plan,manualRecommendations:review,purchaseDiagnostics:report,screenRows,screenCurrent:true};
 const render=patch=>renderToStaticMarkup(React.createElement(Component,{...props,...patch}));
 const card=(html,symbol)=>[...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match=>match[0]).find(row=>new RegExp('<h3[^>]*>'+symbol+'<\\/h3>').test(row))||'';
 const html=render({}),without=render({purchaseDiagnostics:null});
 for(const symbol of ['MRNA','CRWD']){
  const actual=card(html,symbol),prior=card(without,symbol);assert(actual,symbol+' retains its existing rating card');
  assert(actual.includes(expected[symbol]));assert(prior.includes(legacy[symbol]));assert.match(actual,/>NO PURCHASE</);
  assert.match(actual,/Buy rating as of 2026-10-21/);assert.doesNotMatch(actual,/(?:Buy|Add) \d+ shares?/);
 }
 let normalized=html;for(const symbol of ['MRNA','CRWD'])normalized=normalized.replace(expected[symbol],legacy[symbol]);
 assert.equal(normalized,without,'The rendered result differs only in the two authorized reason sentences');
 for(const patch of [{manualRecommendations:{...review,validUntil:now}},{screenCurrent:false},{openingPlan:null},
  {decision:{...decision,current:false}},{decision:{...decision,current:false,accountMismatch:true}},
  {purchaseDiagnostics:{...report,collection:{...report.collection,status:'FAILED'}}}]){
  const output=render(patch);for(const value of Object.values(expected))assert(!output.includes(value),'Unready/foreign evidence cannot receive the precise copy');
  assert.doesNotMatch(output,/(?:Buy|Add) \d+ shares?/);
 }
 assert.equal(render({view:'portfolio'}),'','Blocked purchases cannot manufacture Portfolio actions');
 assert.equal(JSON.stringify({decision,plan,report,baseline}),original,'Copy and SSR must not mutate source evidence or account/order objects');
 const page=fs.readFileSync('pages/index.js','utf8');assert.equal(page.split(' purchaseDiagnostics={accountView.purchaseDiagnostics}').length,2,'Exactly one existing account view passes response diagnostics into the presenter');
 console.log('PASS: exact request-bound MRNA/CRWD reason copy, conservative malformed/stale/adverse fallbacks, unchanged SSR ratings/actions/quantities and immutable evidence.');
}finally{global.Date=NativeDate;global.fetch=originalFetch;}
