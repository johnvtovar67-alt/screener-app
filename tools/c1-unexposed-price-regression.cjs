const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>crypto.createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));
const imports={createHash:crypto.createHash,...loader.load('lib/c1ForwardModel.js'),...loader.load('lib/c1DecisionSnapshot.js'),...loader.load('lib/c1HoldingsComparison.js'),...loader.load('lib/marketSession.js'),...loader.load('lib/c1LiveInput.js'),...loader.load('lib/c1BaselineReconciliation.js')};
const box={...imports,Date,process};vm.createContext(box);
vm.runInContext(fs.readFileSync('lib/c1DatedBook.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.accept=acceptC1DatedInput;',box);
const accept=box.accept,symbols=['AAA','BBB','CCC','CVX','DOC','FDX','LLY','WFC'];
function make(date,previous){return {contract:'c1-dated-index-input-v1',universe:'sp500',sourceSessionDate:date,observedAt:date+'T22:00:00.000Z',metadata:{},sourceReceipt:{provider:'FMP',membershipCheckedTwice:true},priorSessionPrices:{date:previous,closes:Object.fromEntries([...symbols,'SPY','QQQ'].map(s=>[s,100]))},session:{date,decisionAt:date+'T22:00:00.000Z',universeSymbols:symbols,prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date,open:100,close:100,high:101,low:99,volume:10000000,adjusted:true})),signals:symbols.slice(0,3).map((symbol,i)=>({symbol,sector:'Sector'+i,price:100,researchFactors:{momentumPercentile:100-i,volatility60Pct:20},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))}};}
const first=make('2026-09-10','2026-09-09'),second=make('2026-09-11','2026-09-10');
const prior=accept(accept(null,first,new Date(first.observedAt)),second,new Date(second.observedAt));
assert.ok(prior.model.ledger.fills.length>0,'Fixture has actual paper-model exposure in other stocks');
const input=make('2026-09-14','2026-09-11');
const changed=['CVX','DOC','FDX','LLY','WFC'];
for(const s of changed)input.priorSessionPrices.closes[s]=99.9;
input.priceEvidence={contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',rows:[...prior.model.sessions.at(-1).prices,...input.session.prices].map(p=>({symbol:p.symbol,date:p.date,adjOpen:p.open,adjHigh:p.high,adjLow:p.low,adjClose:p.date==='2026-09-11'&&changed.includes(p.symbol)?99.9:p.close,volume:p.volume}))};
const now=new Date(input.observedAt),before=JSON.stringify(prior),inputBefore=JSON.stringify(input),result=accept(prior,input,now);
assert.equal(result.model.sessions.at(-1).date,'2026-09-14');
assert.equal(result.reconciliations.at(-1).mismatches.length,5);
assert.equal(JSON.stringify(prior),before);assert.equal(JSON.stringify(input),inputBefore);
assert.equal(JSON.stringify(result.model.sessions.slice(0,2)),JSON.stringify(prior.model.sessions));
assert.equal(JSON.stringify(result.captures.slice(0,2)),JSON.stringify(prior.captures));
assert.equal(accept(result,input,now),result,'Retry is idempotent');
for(const mutate of [x=>delete x.priorSessionPrices.closes.CVX,x=>x.priceEvidence.rows.find(r=>r.symbol==='CVX').adjClose=50,x=>x.session.prices.find(r=>r.symbol==='CVX').close=102,x=>x.priceEvidence.rows.push(x.priceEvidence.rows.find(r=>r.symbol==='CVX')),x=>x.sourceReceipt.provider='other',x=>x.priceEvidence.rows.find(r=>r.symbol==='CVX').adjLow=200]){
 const bad=clone(input);mutate(bad);assert.throws(()=>accept(prior,bad,now),/reconciliation/);
}
for(const symbol of ['AAA','SPY','QQQ']){const bad=clone(input);bad.priorSessionPrices.closes[symbol]=99.9;assert.throws(()=>accept(prior,bad,now),/reconciliation/);}
for(const mutate of [p=>p.model.ledger.fills.push({symbol:'CVX'}),p=>p.model.pendingBySleeve.base.push({symbol:'CVX'}),p=>p.model.ledger.sleeves.base.positions.CVX={shares:1}]){const p=clone(prior);mutate(p);delete p.recordHash;p.recordHash=digest(p);assert.throws(()=>accept(p,input,now),/reconciliation/);}
assert.throws(()=>imports.reconcileC1UnexposedPrices(prior,input,now,digest,(model,...args)=>{const r=imports.advanceC1ForwardModel(model,...args);if(model.sessions.at(-1).prices.find(p=>p.symbol==='CVX').close===99.9)r.ledger.sleeves.base.cash++;return r;}),/conditions/,'A one-dollar economic effect is rejected');
const {assertC1AccountRevisionCoverage:guard}=loader.load('lib/c1AccountInput.js');
const account={adoption:{sourceSessionDate:'2026-09-11',seeds:{base:{positions:[{symbol:'NTRA'},{symbol:'FCX'},{symbol:'STX'}]}}},records:[]};
guard(result,account,'2026-09-14');
const own=clone(account);own.adoption.seeds.base.positions.push({symbol:'CVX'});
assert.throws(()=>guard(result,own,'2026-09-14'),/CVX/);
guard(result,own,'2026-09-11');
const traded=clone(account);traded.records.push({fills:[{symbol:'FDX'}]});assert.throws(()=>guard(result,traded,'2026-09-14'),/FDX/);
const manual=loader.load('lib/c1ManualRecommendations.js');
const waiting=manual.buildC1ManualRecommendations({decision:{current:false,updateReason:'Market-data update pending for 2026-09-14.'},now});
assert.match(waiting.reason,/Market-data update pending/);assert.equal(waiting.orders.length,0);assert.doesNotMatch(waiting.reason,/Record outstanding/);
assert.match(fs.readFileSync('components/C1AccountOpportunities.js','utf8'),/C1 ratings awaiting update/);
console.log('PASS: Monday rollover with five unexposed revisions; exact economic parity, immutable history, retry, evidence validation, model/account exposure blocks and honest stale status');
