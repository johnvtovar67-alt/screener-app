// Newly authorized selection mechanics. All data/fills are synthetic; no network,
// storage, production jobs, or historical performance experiments are invoked.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const original=loader.load('lib/c1StockClassification.js');
const {resolveC1ScreenEvidence}=loader.load('lib/c1ScreenEvidence.js');
const {c1AdditionalSwingCapacity}=loader.load('lib/c1AdditionalSwingCapacity.js');
const {projectC1AccountSession}=loader.load('lib/c1AccountProjection.js');
const {simulatePointInTimePortfolio}=loader.load('lib/c1RecentMomentumAccountSimulator.js');
const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
const {previousMarketSessionDay,isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {C1_QUALIFIED_SELECTION}=loader.load('lib/c1QualifiedSelection.js');
const copy=x=>JSON.parse(JSON.stringify(x));
let assertions=0;
function eq(actual,expected,label){assertions++;assert.equal(JSON.stringify(actual),JSON.stringify(expected),label);}
function yes(x,label){assertions++;assert.ok(x,label);}
const symbols=Array.from({length:24},(_,i)=>i===16?'QST':String.fromCharCode(65+i).repeat(3));
const dates=['2026-11-09'];for(let i=0;i<252;i++)dates.unshift(previousMarketSessionDay(dates[0]));
const now=new Date('2026-11-10T15:50:00.000Z');
function event(symbol,blocked=false,missing=false){
 if(missing)return {symbol,status:'Manual',blockNewCapital:true,checkComplete:false};
 const observedAt=now.toISOString(),expiresAt=new Date(+now+4*60000).toISOString();
 return {symbol,status:blocked?'Blocked':'Clear',blockNewCapital:blocked,manualCheckRequired:false,eventRiskVerified:true,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true,newsCheckComplete:true,
 eventVerification:{contract:'c1-current-event-evidence-v1',provider:'FMP',state:blocked?'VERIFIED_BLOCKED':'VERIFIED_CLEAR',observedAt,expiresAt,
 sources:[['EARNINGS','earnings-calendar'],['MERGERS','mergers-acquisitions-latest'],['NEWS','news/stock']].map(([kind,endpoint])=>({kind,endpoint,complete:true,reason:'OK',fetchedAt:observedAt,expiresAt}))}};
}
function fixture({weakFirst=9,allWeak=false,allClear=false,missingFirst=0,eventFirst=0,gapFirst=0,sameSector=false}={}){
 const sessions=dates.map((date,index)=>{
  const lastSix=index>=247;
  const prices=[...symbols,'SPY','QQQ'].map((symbol,i)=>{
   const weak=i<24&&!allClear&&(allWeak||i<weakFirst);
   const close=i>=24?100:lastSix?(weak?105-(index-247):95+(index-247)):100;
   return {symbol,date,open:close,high:close*1.001,low:close*.999,close,volume:10_000_000,adjusted:true};
  }).filter(p=>!(lastSix&&index===247&&symbols.indexOf(p.symbol)>=0&&symbols.indexOf(p.symbol)<missingFirst));
  const signals=symbols.map((symbol,i)=>{
   const price=prices.find(p=>p.symbol===symbol)?.close||100;
   const weak=!allClear&&(allWeak||i<weakFirst);
   return {symbol,companyName:symbol,sector:sameSector?'Same Sector':'Sector '+i%6,issuer:symbol,price,action:'Strong Buy',
    marketAvailableAt:date+'T21:00:00Z',fundamentalsAvailableAt:date+'T21:00:00Z',eventRiskAvailableAt:date+'T21:00:00Z',
    fundamentalDataVerified:true,fundamentalRevisionSafe:true,eventRiskVerified:true,eventHistoryComplete:true,entryTimingVerified:true,
    entryTiming:{available:true,asOf:date,macdImproving:!weak,liquidityPass:true,averageDollarVolume20:1e9,strongPass:true,pass:true},
    researchFactors:{momentumPercentile:100-i,volatility60Pct:20,return120Ex20:40-i,return60Ex5:30-i,factorCoverage:1},
    riskPlan:{invalidationPrice:price*.86},recommendation:{}};
  });
  return {date,decisionAt:date+'T21:00:00Z',prices,signals,positionSignals:signals,universeSymbols:symbols,corporateActions:[]};
 });
 const baseline=sessions.at(-1);
 const rows=baseline.signals.map((r,i)=>({...r,price:r.price*(i<gapFirst?1.075:1),expertDecision:{strongBuyPass:true,metrics:{quoteFreshnessPass:true}},eventRisk:event(r.symbol,i<eventFirst)}));
 const opening={date:'2026-11-10',universeSymbols:symbols,corporateActions:[],prices:[...symbols,'SPY','QQQ'].map((symbol,i)=>({symbol,open:100,observedPrice:rows[i]?.price||100,observedAt:now.toISOString(),adjusted:true})),currentEventEvidence:symbols.map((s,i)=>event(s,i<eventFirst))};
 return {sessions,baseline,rows,opening};
}
const buys=rs=>rs.filter(x=>['Buy','Strong Buy'].includes(x.rating)).map(x=>x.symbol);
function screen(f,engine=original){
 const snapshot=engine.buildC1StockScreenSnapshot(f.baseline,now,f.sessions);
 return {snapshot,ratings:engine.classifyC1StockScreen({snapshot,rows:f.rows,current:true})};
}
function nativeQueue(f){
 const seed={contract:'c1-prospective-account-seed-v1',sleeve:'base',asOfSession:f.baseline.date,prospectiveAdoptionConfirmed:true,cash:100000,highWater:100000,remainingCooldownSessions:0,resumeAtNextOpen:false,positions:[]};
 return simulatePointInTimePortfolio({metadata:{},sessions:f.sessions,recentMomentumHistorySessions:f.sessions},{...C1_FROZEN_OPTIONS.base,startDate:f.baseline.date,endDate:f.baseline.date,liquidateAtEnd:false},seed).pendingDecisions.filter(o=>o.side==='buy').map(o=>o.symbol);
}

const cases=[
 ['nine weak leaders',{weakFirst:9},['JJJ','KKK','LLL']],
 ['nine incomplete histories',{allClear:true,missingFirst:9},['JJJ','KKK','LLL']],
 ['all clear control',{allClear:true},['AAA','BBB','CCC']],
 ['all weak control',{allWeak:true},[]],
 ['sector constraint',{allClear:true,sameSector:true},['AAA']],
 ['three event blocks among qualified names',{weakFirst:9,eventFirst:12},['MMM','NNN','OOO']],
 ['three gap blocks among qualified names',{weakFirst:9,gapFirst:12},['MMM','NNN','OOO']],
 ['all nine eligible names event-blocked',{weakFirst:9,eventFirst:18},[]],
];
for(const [name,options,expected] of cases){
 const f=fixture(options),before=JSON.stringify(f),s=screen(f);
 eq(buys(s.ratings),expected,name);
 yes(s.snapshot.candidates.length<=18,'Bounded current evidence requirements');
 eq(s.snapshot.selectionPolicy,C1_QUALIFIED_SELECTION,'Explicit policy identity');
 eq(s.snapshot.candidates.slice(0,9).map(x=>x.researchRank),[1,2,3,4,5,6,7,8,9],'Original Watch ranks retained');
 const capacity=c1AdditionalSwingCapacity({baseline:f.baseline,historySessions:f.sessions,opening:f.opening,observedAt:now.toISOString(),heldSymbols:[]});
 eq(capacity.symbols,expected,'Opening permission agrees with screen: '+name);
 eq(JSON.stringify(f),before,'No accepted input mutations');
}

const f=fixture(),snapshot=screen(f).snapshot;
// Indexed gate evaluation must retain every rejection of the canonical reader.
const {createC1QualifiedMomentumReview}=loader.load('lib/c1QualifiedSelection.js');
const {readC1RecentMomentum}=loader.load('lib/c1RecentMomentumGate.js');
for(const change of [
 h=>{},
 h=>h.at(-1).prices.push(copy(h.at(-1).prices.find(p=>p.symbol==='JJJ'))),
 h=>h.at(-3).prices=h.at(-3).prices.filter(p=>p.symbol!=='JJJ'),
 h=>h.at(-1).signals.push(copy(h.at(-1).signals.find(p=>p.symbol==='JJJ'))),
 h=>h.at(-1).signals.find(p=>p.symbol==='JJJ').entryTiming.macdImproving=null,
 h=>h.at(-2).stale=true,
 h=>h.at(-1).signals.find(p=>p.symbol==='JJJ').availableAt='2026-11-10T00:00:00Z',
]){
 const history=copy(f.sessions);change(history);
 eq(createC1QualifiedMomentumReview(history)(history.at(-1).date,'JJJ'),readC1RecentMomentum({sessions:history,sessionIndex:history.length-1,symbol:'JJJ'}),'Indexed evaluation exactly preserves canonical gate evidence');
}
eq(snapshot.candidates.slice(9).map(c=>[c.researchRank,c.qualifiedRank]),Array.from({length:9},(_,i)=>[i+10,i+1]),'Historical score/rank never relabeled as qualified rank');
eq(nativeQueue(f),symbols.slice(9,18),'Account and screen use exactly the same qualified queue');
const weights={base:.25,cooldown15:.5,sector40:.25};
function project(input){
 const adoption={sourceSessionDate:input.baseline.date,seeds:Object.fromEntries(Object.entries(weights).map(([sleeve,weight])=>[sleeve,{contract:'c1-prospective-account-seed-v1',sleeve,asOfSession:input.baseline.date,prospectiveAdoptionConfirmed:true,cash:100000,highWater:100000,remainingCooldownSessions:0,resumeAtNextOpen:false,positions:[],actualDollarsPerModelDollar:weight}]))};
 return projectC1AccountSession({adoption,baseline:input.baseline,opening:input.opening,observedAt:now.toISOString(),books:Object.fromEntries(Object.entries(weights).map(([s,w])=>[s,{cash:100000*w,positions:{}}])),sessions:[input.baseline],historySessions:input.sessions,purchaseFundingIndependent:true,additionalSwingCapacity:true,prospectiveSwingStopPolicy:'c1-new-swing-initial-stop-10-v1'});
}
const plan=project(f),buyNames=p=>[...new Set(p.orders.filter(o=>o.side==='buy'&&!o.condition).map(o=>o.symbol))];
eq(buyNames(plan),['JJJ','KKK','LLL'],'Actual three-sleeve opening projection reaches the newly visible opportunities');
yes(!plan.entryReviews.some(r=>r.reason==='position-limit'&&['JJJ','KKK','LLL'].includes(r.symbol)),'No false capacity veto on a cash-only account');
yes(plan.orders.filter(o=>o.side==='buy').every(o=>o.initialSwingStopPct===10),'Prospective ten-percent stops preserved');
eq(plan.executable,false,'Synthetic projection alone grants no execution authority');
const decision={current:true,decisionId:'synthetic:1',sourceSessionDate:f.baseline.date,stockScreen:snapshot};
eq(resolveC1ScreenEvidence({decision,rows:f.rows,current:true,reviewCurrent:true}).buySymbols,buyNames(plan),'Browser and account selection agree');
yes(resolveC1ScreenEvidence({decision,rows:f.rows.filter(r=>r.symbol!=='JJJ'),current:true,reviewCurrent:true}).pending,'Missing new candidate cannot publish a complete screen');
for(const mode of ['stale','event','gap']){
 const c=copy(f);
 if(mode==='stale')for(const p of c.opening.prices)p.observedAt='2026-11-10T14:00:00Z';
 if(mode==='event')c.opening.currentEventEvidence=c.opening.currentEventEvidence.map(r=>({...r,eventVerification:{...r.eventVerification,state:'UNVERIFIED'}}));
 if(mode==='gap')for(const p of c.opening.prices)p.observedPrice*=1.08;
 eq(buyNames(project(c)),[],mode+' cannot be bypassed by expanded selection');
}
const cap=heldSymbols=>c1AdditionalSwingCapacity({baseline:f.baseline,historySessions:f.sessions,opening:f.opening,observedAt:now.toISOString(),heldSymbols});
eq(cap(['UUU','VVV','WWW','XXX']).symbols,[],'Four-name account cap unchanged');
eq(cap(['UUU','VVV','WWW']).symbols,['JJJ'],'Only one remaining account slot');

// The compact HTTP response must retain every requested new candidate even
// when the independent broad-screen order places them below its usual cutoff.
const compact=loader.load('lib/c1ScreenSnapshotView.js').compactRowsForClient;
const broad=[...Array.from({length:90},(_,i)=>({symbol:'Z'+i,compositeScore:1000-i})),...f.rows];
const transported=compact(broad,80,'',snapshot.candidates.map(c=>c.symbol).join(','));
yes(snapshot.candidates.every(c=>transported.some(r=>r.symbol===c.symbol)),'All eighteen authoritative candidates survive transport compaction');

// Multi-session synthetic lifecycle: the new entry rank and exit rank share
// the same completed-session pool. No future market outcome is asserted.
function lifecycle({old=false,deteriorate=false,missing=false}={}){
 const c=fixture();
 if(old){c.sessions.pop();c.baseline=c.sessions.at(-1);}
 let calendar=new Date(c.baseline.date+'T12:00:00Z');
 for(let n=1;n<=38;){
  calendar.setUTCDate(calendar.getUTCDate()+1);const date=calendar.toISOString().slice(0,10);
  if(!isUsMarketSessionDay(date))continue;
  const session=copy(c.baseline);session.date=date;session.decisionAt=date+'T21:00:00Z';
  for(const p of session.prices){const i=symbols.indexOf(p.symbol);p.date=date;p.close=i<0?100:i<9?100-n*.15:100+n*.1;p.open=p.close;p.high=p.close*1.001;p.low=p.close*.999;}
  for(const field of ['signals','positionSignals'])for(const [i,s]of session[field].entries()){
   s.price=session.prices.find(p=>p.symbol===s.symbol).close;
   s.marketAvailableAt=s.fundamentalsAvailableAt=s.eventRiskAvailableAt=session.decisionAt;
   s.entryTiming.asOf=date;s.entryTiming.macdImproving=i>=9;
   if(deteriorate&&n>=6)s.researchFactors.momentumPercentile=i>=12?120-i:100-i;
   if(missing&&n>=6&&s.symbol==='JJJ')s.entryTiming.available=false;
  }
  c.sessions.push(session);n++;
 }
 const seed={contract:'c1-prospective-account-seed-v1',sleeve:'base',asOfSession:c.baseline.date,prospectiveAdoptionConfirmed:true,cash:100000,highWater:100000,remainingCooldownSessions:0,resumeAtNextOpen:false,positions:[]};
 if(old){
  seed.positions=symbols.slice(9,12).map(symbol=>{const stock=c.baseline.signals.find(s=>s.symbol===symbol);return {symbol,role:'Swing',shares:100,entryPrice:stock.price,openedAt:c.baseline.date,sector:stock.sector,issuer:symbol,stock};});
  seed.cash-=seed.positions.reduce((sum,p)=>sum+p.shares*p.entryPrice,0);
 }
 const run=simulatePointInTimePortfolio({metadata:{},sessions:c.sessions,recentMomentumHistorySessions:c.sessions},{...C1_FROZEN_OPTIONS.base,startDate:c.baseline.date,endDate:c.sessions.at(-1).date,liquidateAtEnd:false},seed);
 return {run,c,seed};
}
const rising=lifecycle();
yes(rising.run.trades.some(t=>t.side==='buy'&&t.symbol==='JJJ'&&t.date==='2026-11-10'),'Lower historical rank is actually purchased after activation');
eq(rising.run.trades.filter(t=>t.side==='sell'&&['JJJ','KKK','LLL'].includes(t.symbol)),[],'No rank-based churn across early, profit and thirty-session exit windows');
yes(rising.run.openPositions.filter(p=>['JJJ','KKK','LLL'].includes(p.symbol)).every(p=>p.rankSelectionPolicy===C1_QUALIFIED_SELECTION&&p.lastC1Rank<=3),'New holdings expose the qualified rank basis');
const deteriorated=lifecycle({deteriorate:true});
yes(deteriorated.run.trades.some(t=>t.side==='sell'&&t.symbol==='JJJ'&&t.reason==='early-rank-deterioration'),'Genuine loss of qualified rank still triggers the existing three-close exit');
const unknown=lifecycle({missing:true});
yes(!unknown.run.trades.some(t=>t.side==='sell'&&t.symbol==='JJJ'&&t.reason.includes('rank-deterioration')),'Missing held evidence cannot manufacture a rank sell');
const legacy=lifecycle({old:true});
yes(legacy.run.trades.some(t=>t.side==='sell'&&t.symbol==='JJJ'&&t.reason==='early-rank-deterioration'),'Existing lifecycle retains its historical rank exit');

// Exact prior source retained for date-bound compatibility checks. This is a
// new synthetic regression, not a rerun of a historical research experiment.
const path=require('node:path'),{createHash}=require('node:crypto');
const inverse=require('./c1-qualified-selection-seams.cjs'),patches=require('./fixtures/c1-qualified-selection-source-seams.json');
const scratch=fs.mkdtempSync(path.join(process.cwd(),'work/qualified-selection-baseline-'));
try{
 fs.cpSync('lib',path.join(scratch,'lib'),{recursive:true});
 for(const [file,patch]of Object.entries(patches)){
  const restored=inverse.restore(file,fs.readFileSync(file,'utf8'));
  eq(createHash('sha1').update('blob '+Buffer.byteLength(restored)+'\0').update(restored).digest('hex'),patch.beforeHash,'Unchanged previous source oracle '+file);
  fs.writeFileSync(path.join(scratch,file),restored);
 }
 const prior=createResearchModuleLoader(scratch);
 const old=fixture();old.sessions.pop();old.baseline=old.sessions.at(-1);
 eq(original.buildC1StockScreenSnapshot(old.baseline,now,old.sessions),prior.load('lib/c1StockClassification.js').buildC1StockScreenSnapshot(old.baseline,now,old.sessions),'Pre-activation snapshot is byte-equivalent');
 const seed={contract:'c1-prospective-account-seed-v1',sleeve:'base',asOfSession:old.baseline.date,prospectiveAdoptionConfirmed:true,cash:100000,highWater:100000,remainingCooldownSessions:0,resumeAtNextOpen:false,positions:[]};
 const args=[{sessions:old.sessions,recentMomentumHistorySessions:old.sessions},{...C1_FROZEN_OPTIONS.base,startDate:old.baseline.date,endDate:old.baseline.date,liquidateAtEnd:false},seed];
 eq(simulatePointInTimePortfolio(...args),prior.load('lib/c1RecentMomentumAccountSimulator.js').simulatePointInTimePortfolio(...args),'Entire pre-activation live-account output remains unchanged');
 const researchArgs=[{sessions:rising.c.sessions},{...C1_FROZEN_OPTIONS.base,startDate:rising.c.baseline.date,endDate:rising.c.sessions.at(-1).date,liquidateAtEnd:false},rising.seed];
 eq(loader.load('lib/c1RecentMomentumChallengerSimulator.js').simulatePointInTimePortfolio(...researchArgs),prior.load('lib/c1RecentMomentumChallengerSimulator.js').simulatePointInTimePortfolio(...researchArgs),'Default research engine remains unchanged even on post-activation synthetic dates');
}finally{fs.rmSync(scratch,{recursive:true,force:true});}

async function actualAccountFlow(){
 const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
 const workflow=createWorkflowFixture('buy',{baselineDate:'2026-11-09',portfolio:[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}]});
 // Explicitly weak original leaders; four lower-ranked names retain complete,
 // improving accepted history. These are synthetic accepted closes only.
 for(let index=215;index<=220;index++){
  const session=workflow.sessions[index];
  for(const symbol of ['MRNA','BBB','CCC','DDD','EEE','FFF','GGG','HHH','III']){
   const p=session.prices.find(p=>p.symbol===symbol);p.close=105-(index-215);p.open=p.close;p.high=p.close*1.001;p.low=p.close*.999;
   for(const field of ['signals','positionSignals']){
    const s=session[field].find(s=>s.symbol===symbol);s.price=p.close;s.entryTiming.macdImproving=false;
   }
  }
 }
 workflow.setCash(100000);const adoptionBefore=JSON.stringify(workflow.account.adoption);
 const view=await workflow.prepare();
 eq(buyNames(view.openingPlan),['JJJ','KKK','LLL'],'Normal account-to-opening flow selects the same newly qualified candidates');
 const accepted=await workflow.prepare({id:'qualified-fill-1',symbol:'JJJ',side:'buy',shares:10,price:100.12,fee:0,executedAt:workflow.now.toISOString()});
 workflow.account=copy(accepted.account);
 const completedBook={...workflow.book,model:{sessions:workflow.sessions.slice(0,222)},captures:workflow.sessions.slice(0,222).map(s=>({sessionDate:s.date,hash:'synthetic-workflow:'+s.date,observedAt:s.decisionAt}))};
 const closed=workflow.service.deriveC1CompletedAccount({account:workflow.account,book:completedBook,now:new Date('2026-11-10T22:00:00Z')});
 const reviewed=workflow.service.evaluateC1Account({account:closed,book:completedBook,now:new Date('2026-11-10T22:00:00Z')});
 const held=reviewed.positions.find(p=>p.symbol==='JJJ');
 eq(held.shares,10,'Recorded account owns exactly the supplied executed quantity');
 yes(held.reviewRules.every(r=>r.rankSelectionPolicy===C1_QUALIFIED_SELECTION),'Reloaded completed-fill replay retains the qualified lifecycle');
 yes(held.stops.every(s=>Math.abs(s.price-90.108)<1e-8),'Actual new fills retain their captured ten-percent stop');
 eq(JSON.stringify(closed.adoption),adoptionBefore,'Original account adoption remains byte-identical');
 eq(workflow.writes,0,'Offline workflow performs no external writes');
}
actualAccountFlow().then(()=>console.log(JSON.stringify({assertions,syntheticOnly:true,openingBuySymbols:buyNames(plan),qualifiedPoolSize:snapshot.candidates.length,productionWrites:0}))).catch(error=>{console.error(error);process.exitCode=1;});
