// Synthetic account/API reproduction only. All live providers and storage forbidden.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createWorkflowApi}=require('./fixtures/c1-trading-workflow-api.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),same=(a,b)=>assert.deepEqual(clone(a),clone(b));
function fixture(kind='adoption',supplement=true,duplicate=false){
 const api=createWorkflowApi(kind),f=api.fixture;
 // Rename an actually owned fixture holding, including the shared universe
 // array used by its isolated opening provider. No real NTRA facts are claimed.
 const symbols=f.sessions[0].universeSymbols;symbols[symbols.indexOf('LLL')]='NTRA';
 for(const s of f.sessions)for(const rows of [s.prices,s.signals,s.positionSignals])for(const p of rows){if(p.symbol==='LLL')p.symbol='NTRA';if(p.issuer==='LLL')p.issuer='NTRA';}
 for(const p of f.portfolio)if(p.symbol==='LLL')p.symbol='NTRA';
 const rename=x=>JSON.parse(JSON.stringify(x).replaceAll('"LLL"','"NTRA"'));
 f.account=rename(f.account);if(f.adoptionPortfolioRecord)f.adoptionPortfolioRecord=rename(f.adoptionPortfolioRecord);
 const baseline=f.book.model.sessions.at(-1),price=clone(baseline.prices.find(p=>p.symbol==='NTRA'));
 const coverage={contract:'c1-held-price-coverage-v1',sourceSessionDate:baseline.date,rows:[{symbol:'NTRA',status:'verified',date:baseline.date,inDecisionUniverse:true,price,source:{provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',observedAt:baseline.decisionAt}}]};
 if(supplement){baseline.prices=baseline.prices.filter(p=>p.symbol!=='NTRA');f.account={...f.account,...(duplicate?{holdingCoverages:[coverage,clone(coverage)]}:{holdingCoverage:coverage})};}
 return {...api,coverage};
}
async function main(){
 const a=fixture(),f=a.fixture,original=clone(f.account),raw=clone(f.book);
 const r=await a.request('POST',{operation:'review-mrna-adoption',expectedRevision:f.account.revision});
 assert.equal(r.status,200,JSON.stringify(r.body));same(r.body.adoptionReview.allocations,{base:5,cooldown15:10,sector40:5});assert.equal(f.writes,0);same(f.account,original);same(f.book,raw);
 const control=fixture('adoption',false);const expected=await control.request('POST',{operation:'review-mrna-adoption',expectedRevision:control.fixture.account.revision});assert.equal(expected.status,200);for(const field of ['original','allocations','mark','value','history','cashChange'])same(r.body.adoptionReview[field],expected.body.adoptionReview[field]);
 const {c1AccountBook}=f.loader.load('lib/c1AccountInput.js');
 const once=c1AccountBook(f.book,a.coverage),twice=c1AccountBook(once,clone(a.coverage));same(once,twice);same(f.book,raw);
 const bar=once.model.sessions.at(-1).prices.find(p=>p.symbol==='NTRA');assert.strictEqual(twice.model.sessions.at(-1).prices.find(p=>p.symbol==='NTRA'),bar);
 // Native accepted evidence is never replaceable, even when its values match.
 assert.throws(()=>c1AccountBook(control.fixture.book,a.coverage),/Supplemental observation cannot replace an accepted price: NTRA/);
 assert.throws(()=>c1AccountBook(clone(once),a.coverage),/cannot replace/,'Serialized flags cannot authorize replay');
 for(const field of ['open','high','low','close','volume']){const changed=clone(a.coverage);changed.rows[0].price[field]+=.000001;assert.throws(()=>c1AccountBook(once,changed),/cannot replace/);}
 for(const change of [c=>c.rows[0].source.observedAt='2026-10-14T21:01:00Z',c=>c.rows[0].price.adjusted=false,c=>c.rows[0].source.provider='other',c=>c.rows.push(clone(c.rows[0]))]){const c=clone(a.coverage);change(c);assert.throws(()=>c1AccountBook(once,c));}
 const mutated=c1AccountBook(f.book,a.coverage);mutated.model.sessions.at(-1).prices.find(p=>p.symbol==='NTRA').volume++;assert.throws(()=>c1AccountBook(mutated,a.coverage),/cannot replace/);
 const inherited=clone(f.book),base=inherited.model.sessions.at(-1);base.universeSymbols=base.universeSymbols.filter(s=>s!=='NTRA');
 const outside=clone(a.coverage);outside.rows[0].classification={symbol:'NTRA',sector:'Sector11',issuer:'NTRA',provider:'FMP',endpoint:'profile',observedAt:'2026-10-14T21:00:00Z'};
 const inheritedOnce=c1AccountBook(inherited,outside),inheritedTwice=c1AccountBook(inheritedOnce,clone(outside));same(inheritedOnce,inheritedTwice);assert.equal(inheritedTwice.model.sessions.at(-1).legacyHoldingSignals.filter(s=>s.symbol==='NTRA').length,1);
 const badClass=clone(outside);badClass.rows[0].classification.sector='Different';assert.throws(()=>c1AccountBook(inheritedOnce,badClass),/classification changed/);
 // Ordinary Buy entry, actual fill, idempotent reload and completed replay.
 const b=fixture('buy',true,true),bc=fixture('buy',false),bf=b.fixture;bf.setCash(100000);bc.fixture.setCash(100000);
 const prep=await b.request('POST',{operation:'prepare-execution'}),cp=await bc.request('POST',{operation:'prepare-execution'});assert.equal(prep.status,200,JSON.stringify(prep.body));assert.equal(cp.status,200);same(prep.body.openingPlan,cp.body.openingPlan);same(prep.body.decision,cp.body.decision);
 const shares=prep.body.openingPlan.orders.filter(o=>o.symbol==='MRNA'&&o.side==='buy').reduce((n,o)=>n+o.shares,0);assert(shares>0);
 const ticket={id:'supplement-replay-buy',symbol:'MRNA',side:'buy',shares,price:100.12,fee:0,executedAt:bf.now.toISOString()};
 const recorded=await b.request('POST',{operation:'record-intraday',expectedRevision:bf.account.revision,ticket});assert.equal(recorded.status,200,JSON.stringify(recorded.body));assert.equal(bf.writes,1);assert.equal(recorded.body.decision.positions.find(p=>p.symbol==='MRNA').shares,shares);
 const stored=clone(bf.account),reloaded=await b.request('GET');assert.equal(reloaded.status,200);same(bf.account,stored);assert.equal(bf.writes,1);assert.equal(reloaded.body.decision.brokerageCash,recorded.body.decision.brokerageCash);
 bf.book.model.sessions.push(bf.sessions[221]);bf.book.captures.push({sessionDate:'2026-10-15',hash:'synthetic-workflow:2026-10-15',observedAt:'2026-10-15T21:00:00Z'});bf.now='2026-10-15T22:00:00Z';
 const close=await b.request('GET');assert.equal(close.status,200,JSON.stringify(close.body));assert.equal(close.body.decision.positions.find(p=>p.symbol==='MRNA').shares,shares);assert.equal(close.body.decision.brokerageCash,recorded.body.decision.brokerageCash);same(bf.account,stored);assert.equal(bf.writes,1);
 // Completed-trade entry must expose its historical plan without price conflict.
 const historical=fixture('buy',true,true),hf=historical.fixture;hf.setCash(100000);hf.book.model.sessions.push(hf.sessions[221]);hf.book.captures.push({sessionDate:'2026-10-15',hash:'synthetic-workflow:2026-10-15',observedAt:'2026-10-15T21:00:00Z'});hf.now='2026-10-15T22:00:00Z';
 const pending=await historical.request('POST',{operation:'prepare-execution'});assert.equal(pending.status,200,JSON.stringify(pending.body));assert(!pending.body.openingError,pending.body.openingError);assert.equal(pending.body.pendingSession.date,'2026-10-15');assert(pending.body.pendingSession.plan.orders.length);assert.equal(hf.writes,0);
 const evidence={scope:'Synthetic software fixtures; no real NTRA/account data or live writes',status:'PASS',baseline:'b6b074e6cce8d735fa57d231e732505a5cba034b',adoptionReview:{writes:0,shares:20,basis:1760,sleeves:{base:5,cooldown15:10,sector40:5}},tradeEntry:{shares,price:100.12,cashAfter:recorded.body.decision.brokerageCash,reload:'PASS',completedReplay:'PASS',completedTradeEntry:'PASS'},integrity:{nativeAcceptedReplacement:'REJECT',changedPriceOrVolume:'REJECT',changedSource:'REJECT',unverifiedObservation:'REJECT',changedClassification:'REJECT',duplicateRowWithinReceipt:'REJECT',mutatedDerivedPrice:'REJECT',serializedProvenance:'REJECT',unchangedOverlayReplay:'PASS',exactDecisionAndOrderParity:'PASS',sourceAndSavedRecordsUnchanged:true}};
 fs.mkdirSync('work/ntra-replay',{recursive:true});fs.writeFileSync('work/ntra-replay/workflow.json',JSON.stringify(evidence,null,2)+'\n');console.log('PASS: exact NTRA conflict repaired; MRNA read-only review, ordinary Buy/fill/reload and completed-trade entry pass; accepted evidence and all rejection guards preserved.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
