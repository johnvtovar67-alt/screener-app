// Synthetic behavior regressions through the actual dated selector and opening
// capacity path. These establish software behavior, never investment returns.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const eq=(actual,expected,label)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)),label);
const loader=createResearchModuleLoader(process.cwd());
const {buildC1StockScreenSnapshot,classifyC1StockScreen}=loader.load('lib/c1StockClassification.js');
const {c1AdditionalSwingCapacity}=loader.load('lib/c1AdditionalSwingCapacity.js');
const {previousMarketSessionDay}=loader.load('lib/marketSession.js');
const symbols=Array.from({length:30},(_,i)=>'S'+String(i+1).padStart(2,'0'));
const dates=['2026-11-10'];for(let i=0;i<5;i++)dates.unshift(previousMarketSessionDay(dates[0]));
const now=new Date('2026-11-11T15:50:00.000Z');
const history=dates.map((date,index)=>{
 const prices=[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date,open:95+index,high:96+index,low:94+index,close:95+index,volume:10_000_000,adjusted:true}));
 const signals=symbols.map((symbol,i)=>({symbol,companyName:symbol,sector:'Sector '+i,issuer:symbol,price:95+index,
  entryTiming:{available:true,asOf:date,macdImproving:true,liquidityPass:true,averageDollarVolume20:1e9,strongPass:true,pass:true},
  researchFactors:{momentumPercentile:100-i,volatility60Pct:20,factorCoverage:1},riskPlan:{invalidationPrice:80},recommendation:{}}));
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals,universeSymbols:symbols,corporateActions:[]};
});
const baseline=history.at(-1);
const event=(symbol,blocked=false)=>({symbol,status:blocked?'Blocked':'Clear',blockNewCapital:blocked,manualCheckRequired:false,eventRiskVerified:true,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true,newsCheckComplete:true,
 eventVerification:{contract:'c1-current-event-evidence-v1',provider:'FMP',state:blocked?'VERIFIED_BLOCKED':'VERIFIED_CLEAR',observedAt:now.toISOString(),expiresAt:new Date(+now+240000).toISOString(),
 sources:[['EARNINGS','earnings-calendar'],['MERGERS','mergers-acquisitions-latest'],['NEWS','news/stock']].map(([kind,endpoint])=>({kind,endpoint,complete:true,reason:'OK',fetchedAt:now.toISOString(),expiresAt:new Date(+now+240000).toISOString()}))}});
const rows=baseline.signals.map(row=>({...row,price:100,expertDecision:{strongBuyPass:true,metrics:{quoteFreshnessPass:true}},eventRisk:event(row.symbol)}));
const opening={date:'2026-11-11',universeSymbols:symbols,corporateActions:[],prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,open:100,observedPrice:100,observedAt:now.toISOString(),adjusted:true})),currentEventEvidence:symbols.map(symbol=>event(symbol))};
const policy={contract:'c1-account-policy-v2',version:2,active:true,complete:true,date:opening.date,identity:'synthetic-policy:1',blockedSymbols:[],stockCooldowns:[]};
const names=ratings=>ratings.filter(row=>['Buy','Strong Buy'].includes(row.rating)).map(row=>row.symbol);
const snapshot=buildC1StockScreenSnapshot(baseline,now,history,policy);
assert.equal(snapshot.candidates.length,30,'All thirty accepted candidates survive source discovery; no continuity top-nine union');
assert.equal(snapshot.scan.complete,true);
assert.equal(snapshot.scan.totalUniverse,30);
eq(names(classifyC1StockScreen({snapshot,rows,current:true,accountPolicy:policy})),symbols.slice(0,3));
for(const count of [9,24]){
 const blocked={...policy,blockedSymbols:symbols.slice(0,count)};
 const ratings=classifyC1StockScreen({snapshot,rows,current:true,accountPolicy:blocked});
 eq(names(ratings),symbols.slice(count,count+3),'Candidates beyond #'+count+' advance after earlier account disqualifications');
 const capacity=c1AdditionalSwingCapacity({baseline,historySessions:history,opening,observedAt:now,accountPolicy:blocked});
 eq(capacity.symbols,symbols.slice(count,count+3),'Real account opening capacity uses the same unrestricted qualified pool');
}
// A blocked leader must not consume either its sector or issuer slot.
const shared=JSON.parse(JSON.stringify(snapshot));shared.candidates[24].sector=shared.candidates[0].sector;shared.candidates[24].issuer=shared.candidates[0].issuer;
eq(names(classifyC1StockScreen({snapshot:shared,rows,current:true,accountPolicy:{...policy,blockedSymbols:symbols.slice(0,24)}})),symbols.slice(24,27));
const exits=[{symbol:symbols[0],side:'sell',conditional:false,activeExit:true}];
eq(names(classifyC1StockScreen({snapshot,rows,current:true,accountPolicy:policy,accountActions:exits})),symbols.slice(1,4),'A valid active exit releases no conflicting purchase slot');
eq(names(classifyC1StockScreen({snapshot,rows,current:true,accountPolicy:policy,accountActions:[{...exits[0],conditional:true}]})),symbols.slice(0,3),'Conditional protective stops are not unconditional exit vetoes');
const first24={...policy,blockedSymbols:symbols.slice(0,24)};
const missingRows=rows.filter(row=>row.symbol!==symbols[24]);
eq(names(classifyC1StockScreen({snapshot,rows:missingRows,current:true,accountPolicy:first24})),symbols.slice(25,28),'Missing quote evidence never becomes a pass; verified lower candidates continue');
const blockedEvent=JSON.parse(JSON.stringify(opening));blockedEvent.currentEventEvidence[24]=event(symbols[24],true);
eq(c1AdditionalSwingCapacity({baseline,historySessions:history,opening:blockedEvent,observedAt:now,accountPolicy:first24}).symbols,symbols.slice(25,28),'A disqualified current event never reserves its sector or opportunity slot');
const noEvents=c1AdditionalSwingCapacity({baseline,historySessions:history,opening:{...opening,currentEventEvidence:[]},observedAt:now,accountPolicy:policy});
eq(noEvents.symbols,[]);assert.equal(noEvents.scan.complete,true);assert.equal(noEvents.scan.evidenceComplete,false);assert.equal(noEvents.scan.status,'evidence-incomplete');
eq(noEvents.scan.unverifiedEventSymbols,symbols,'All missing current events are explicit unknown evidence, not no qualified opportunities');
const noQuotes=c1AdditionalSwingCapacity({baseline,historySessions:history,opening:{...opening,prices:[]},observedAt:now,accountPolicy:policy});
eq(noQuotes.symbols,[]);assert.equal(noQuotes.scan.status,'evidence-incomplete');eq(noQuotes.scan.missingQuoteSymbols,symbols);
const partialEvents={...opening,currentEventEvidence:opening.currentEventEvidence.filter(row=>row.symbol!==symbols[24])};
const partialCapacity=c1AdditionalSwingCapacity({baseline,historySessions:history,opening:partialEvents,observedAt:now,accountPolicy:first24});
eq(partialCapacity.symbols,symbols.slice(25,28),'Unknown higher evidence does not prevent verified lower names from advancing');assert.equal(partialCapacity.scan.status,'evidence-incomplete');
const verifiedBlocks=c1AdditionalSwingCapacity({baseline,historySessions:history,opening:{...opening,currentEventEvidence:symbols.map(symbol=>event(symbol,true))},observedAt:now,accountPolicy:policy});
eq(verifiedBlocks.symbols,[]);assert.equal(verifiedBlocks.scan.status,'complete');assert.equal(verifiedBlocks.scan.evidenceComplete,true);eq(verifiedBlocks.scan.unverifiedEventSymbols,[],'Verified blocked events are completed disqualifications, not missing evidence');
assert(verifiedBlocks.reviews.every(row=>row.reason==='A current material-event block prevents fresh capital.'));
const unknownTiming=JSON.parse(JSON.stringify(history));for(const signal of unknownTiming.at(-1).signals)signal.entryTiming.available=false;
const unknownHistory=c1AdditionalSwingCapacity({baseline:unknownTiming.at(-1),historySessions:unknownTiming,opening,observedAt:now,accountPolicy:policy});
eq(unknownHistory.symbols,[]);assert.equal(unknownHistory.scan.status,'evidence-incomplete');eq(unknownHistory.scan.unverifiedHistorySymbols,symbols,'Missing accepted timing cannot masquerade as a completed no-opportunity scan');
for(const incomplete of [{...snapshot,scan:{...snapshot.scan,complete:false}},buildC1StockScreenSnapshot({...baseline,universeSymbols:[...symbols,'MISSING']},now,history,policy)]){
 assert.equal(incomplete.scan.complete,false);
 eq(names(classifyC1StockScreen({snapshot:incomplete,rows,current:true,accountPolicy:policy})),[],'An interrupted or missing-source scan cannot publish no-opportunity completion as actionable');
 assert(classifyC1StockScreen({snapshot:incomplete,rows,current:true,accountPolicy:policy}).every(row=>/scan is incomplete/.test(row.screenReview.why)));
}
eq(names(classifyC1StockScreen({snapshot,rows,current:true,accountPolicy:{...policy,complete:false,unavailableReason:'Missing account fills'}})),[],'Unknown account stock restrictions fail closed');
const cooldown={...policy,blockedSymbols:[symbols[0]],stockCooldowns:[{symbol:symbols[0],active:true,expiresAfterSession:'2026-11-20',resumesOn:'2026-11-23'}]};
const restriction=classifyC1StockScreen({snapshot,rows,current:true,accountPolicy:cooldown}).find(row=>row.symbol===symbols[0]);
assert.match(restriction.screenReview.why,/2026-11-20/);assert.match(restriction.screenReview.next,/2026-11-23/);
const before=JSON.stringify({baseline,history,opening,policy});
c1AdditionalSwingCapacity({baseline,historySessions:history,opening,observedAt:now,accountPolicy:first24,heldSymbols:['HELD1','HELD2','HELD3']}).symbols.forEach(symbol=>assert.equal(symbol,symbols[24]));
assert.equal(JSON.stringify({baseline,history,opening,policy}),before,'Discovery never mutates accepted observations, financial records or policy evidence');
console.log('PASS: full accepted universe, ranks 10/25+, account-wide vetoes before slots, exact restriction dates, current evidence, incomplete scan and unchanged four-position capacity.');
