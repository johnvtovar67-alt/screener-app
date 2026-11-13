// Actual coherent owner-frame regression: verified background-only policy
// reports preserve checked orders; changed trading authority remains blocked.
// Actual account planner/comparison -> coherent response -> real HTTP screen ->
// real opportunities join and rendered owner view. All external I/O is synthetic.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const vm=require('node:vm');
const {applyAccountPolicyUniverseFixture}=require('./fixtures/c1-account-policy-universe.cjs');
const {createNormalRefreshScreen}=require('./fixtures/c1-normal-refresh-screen.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),summary=[];let healthyOrders;
const copyFile=path.resolve('lib/c1DecisionCopy.js'),oldText=require('./c1-opening-copy-seams.cjs').restore('lib/c1DecisionCopy.js',fs.readFileSync(copyFile,'utf8'));
const oldDeps={},oldLoader=createResearchModuleLoader(process.cwd());
const oldCode=oldText.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{const values=oldLoader.load(request,copyFile);for(const name of names.split(',').map(n=>n.trim()))oldDeps[name]=values[name];return '';}).replace(/export function /g,'function ');
const oldBox={...oldDeps};vm.createContext(oldBox);vm.runInContext(oldCode+';this.exports={c1PlainDecisionReason,c1DecisionTrigger,c1CompactMomentumEvidence,c1HoldingTiming};',oldBox);
const historical=createResearchModuleLoader(process.cwd(),{'lib/c1DecisionCopy.js':oldBox.exports});
const file=path.resolve('components/C1AccountOpportunitiesView.js');
const compile=source=>babel.transformSync(source,{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const compiled=compile(fs.readFileSync(file,'utf8')),oldCompiled=compile(require('./c1-opening-copy-seams.cjs').restore('components/C1AccountOpportunitiesView.js',fs.readFileSync(file,'utf8')));
function renderer(loader,previous=false){const module={exports:{}};new Function('require','module','exports',previous?oldCompiled:compiled)(request=>request.startsWith('../lib/')?loader.load(request,file):request.startsWith('@babel/runtime/')?require('next/dist/compiled/'+request):require(request),module,module.exports);return module.exports.renderC1AccountOpportunitiesView;}
async function example(name,{cash=100000,staleCash=false,openingEdit,openingThrow,sourceEdit,expectBuy=false,expectError=false,expectV4=false,failureCopy=/Opening price verification failed:/}={}){
 const f=createWorkflowFixture('buy',{baselineDate:'2026-11-12'});applyAccountPolicyUniverseFixture(f,{count:50});const originalNow=f.now;if(staleCash)f.now=new Date('2026-11-12T22:00:00Z');f.setCash(cash);f.now=originalNow;if(sourceEdit)sourceEdit(f);
 const before=JSON.stringify({account:f.account,book:f.book}),opening=f.opening();if(openingEdit)openingEdit(opening,f);
 const view=await f.loader.load('lib/c1AccountExecutionView.js').prepareC1AccountExecution({account:f.account,book:f.book,now:f.now,collectOpening:async()=>{if(openingThrow)throw Error(openingThrow);return clone(opening);}});
 const http=createNormalRefreshScreen(f),screen=await http.request({compact:'1',screenSymbols:view.decision.stockScreen.candidates.map(row=>row.symbol).join(',')});
 assert.equal(screen.status,200);assert.equal(screen.body.meta.quoteFeedStatus,'live','Real screen producer must return a healthy current feed');
 const input={...view,screenRows:screen.body.stocks,positionRows:screen.body.stocks,screenCurrent:true,portfolio:f.portfolio};
 const {evidence,projection}=f.loader.load('lib/c1OpportunitiesContract.js').joinC1Opportunities(input,{readTime:()=>f.now});
 const prior=historical.load('lib/c1OpportunitiesContract.js').joinC1Opportunities(input,{readTime:()=>f.now});
 assert.deepEqual(clone(projection),clone(prior.projection),'The entire structured decision, action labels, checked quantities and readiness remain unchanged by copy');
 const html=renderToStaticMarkup(renderer(f.loader)(projection)),hasBuy=/Buy \d+ shares/.test(html);
 assert.equal(hasBuy,expectBuy,name+' must show exactly the permitted current purchase outcome');
 assert.equal(Boolean(view.openingError),expectError,name+' opening error contract');
 if(name==='healthy')healthyOrders=clone(view.openingPlan.orders);
 if(expectV4){assert.equal(view.openingPlan.sourceReceipt.priceBasisReview.contract,'c1-verified-opening-price-review-v4');assert.equal(f.loader.load('lib/c1OpeningPriceReview.js').verifiedC1OpeningPriceBasis(view.openingPlan.sourceReceipt),true);assert.deepEqual(clone(view.openingPlan.orders),healthyOrders,'A background-only policy report difference cannot change checked orders or quantities');assert.equal(view.openingPlan.accountPolicy.purchaseBlocks.X20,'not-in-entry-queue','Publish the real revised policy rather than a comparison copy');}
 if(expectBuy){assert.equal(view.manualRecommendations.status,'ready');assert(projection.actionableBuys.length>0);for(const symbol of ['X12','X13','X14'])assert(projection.actionableBuys.some(row=>row.symbol===symbol));}
 else assert.equal(projection.actionableBuys.length,0,'No checked order means no executable Buy tile');
 const specifics=projection.ratedTiles.filter(tile=>!projection.actionableBuys.some(order=>order.symbol===tile.symbol)).map(tile=>({symbol:tile.symbol,raw:tile.detail,rendered:projection.plainReason(tile.symbol,'NO PURCHASE',tile.detail)}));
 if(expectError){
  assert(specifics.every(row=>failureCopy.test(row.rendered)),'A failed shared review must be shown specifically rather than relabeled as a normal no-Buy session');
  const banner=html.match(/aria-label="Watch monitoring status"[^>]*>([\s\S]*?)<\/p>/)?.[1];assert(banner&&failureCopy.test(banner),'The shared Watch banner preserves the specific failure through fixed safe copy');
  for(const row of projection.watchView.rows)assert(row.review.why.includes(view.openingError),'Every displayed Watch row retains its real current opening blocker');
  const beforeHtml=renderToStaticMarkup(renderer(historical,true)(prior.projection));assert(beforeHtml.includes('Current entry evidence needs verification; purchases are paused.'),'Real historical owner rendering reproduces generic masking');
 }
 if(staleCash){assert.equal(view.decision.brokerageCashCurrent,false);assert(html.includes('earlier Eastern date'),'A previous-day balance requires an update, never an assumed current funding pass');}
 assert.equal(JSON.stringify({account:f.account,book:f.book}),before);assert.equal(f.writes,0);
 summary.push({name,openingError:view.openingError,manualStatus:view.manualRecommendations.status,candidateEvidenceComplete:view.openingPlan?.additionalSwingCapacity?.scan?.evidenceComplete??null,
  sourceScreenVerified:evidence.verified,brokerageCashCurrent:view.decision.brokerageCashCurrent,brokerageCashStatus:view.decision.brokerageCashStatus,renderedBuy:hasBuy,checkedSymbols:projection.actionableBuys.map(row=>row.symbol),specifics});
}
const correction=(symbol,close)=>(o,f)=>{const p=f.book.model.sessions.at(-1).prices.find(row=>row.symbol===symbol);o.receipt.previousAdjustedClosesUnchanged=false;o.priceBasisRevisions=[{symbol,savedClose:p.close,rechecked:true,observedBar:{...p,close,low:Math.min(p.low,close)}}];};
(async()=>{
 await example('healthy',{expectBuy:true});
 await example('backup-policy-only-revision',{openingEdit:correction('X20',99),expectBuy:true,expectV4:true});
 await example('cash-zero',{cash:0});
 await example('stale-brokerage-cash',{staleCash:true});
 await example('backup-revision-with-stale-brokerage-cash',{staleCash:true,openingEdit:correction('X20',99)});
 await example('required-opening-quote-missing',{openingThrow:'Fresh opening quote missing for LLL',expectError:true,failureCopy:/required fresh regular-session opening quote is missing/});
 await example('verified-company-event-block',{openingEdit:o=>{for(const risk of o.currentEventEvidence){risk.status='Blocked';risk.blockNewCapital=true;risk.eventVerification.state='VERIFIED_BLOCKED';}}});
 await example('event-evidence-missing',{openingEdit:o=>{o.currentEventEvidence=[];}});
 await example('backup-revision-with-missing-event-evidence',{openingEdit:(o,f)=>{correction('X20',99)(o,f);o.currentEventEvidence=o.currentEventEvidence.filter(risk=>risk.symbol!=='X12');},expectError:true,failureCopy:/Opening verification is incomplete:/});
 await example('recent-entry-trigger-failed',{sourceEdit:f=>{for(const [i,session]of f.book.model.sessions.slice(-6).entries())for(const p of session.prices)if(!['SPY','QQQ','LLL'].includes(p.symbol)){
  p.close=105-i;p.open=p.close;p.high=p.close*1.001;p.low=p.close*.999;
  for(const field of ['signals','positionSignals'])for(const r of session[field])if(r.symbol===p.symbol){r.price=p.close;r.entryTiming.macdImproving=false;}
 }}});
 await example('selected-trade-changes-remain-blocked',{openingEdit:correction('X12',99),expectError:true});
 fs.mkdirSync('work/opening-owner-frame',{recursive:true});fs.writeFileSync('work/opening-owner-frame/rehearsal.json',JSON.stringify({verifiedBackgroundRecovery:true,examples:summary},null,2)+'\n');
 console.log('PASS: real price review, account response, HTTP screen and owner renderer preserve checked purchase authority and distinguish controlled zero-order/failure outcomes.');
})().catch(error=>{fs.mkdirSync('work/opening-owner-frame',{recursive:true});fs.writeFileSync('work/opening-owner-frame/rehearsal.json',JSON.stringify({verifiedBackgroundRecovery:true,examples:summary,error:error.message},null,2)+'\n');console.error(error);process.exitCode=1;});
