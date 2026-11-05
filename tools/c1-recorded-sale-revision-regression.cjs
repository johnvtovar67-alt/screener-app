const assert=require('node:assert/strict'),crypto=require('node:crypto');
const l=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const {proveC1RecordedSaleRevision:prove,isC1RecordedSaleRevisionAudit:valid}=l.load('lib/c1RecordedSaleRevision.js');
const {createC1SleeveAccounting:create,applyC1SleeveFill:fill,restoreC1SleeveAccounting:restore,valueC1SleeveAccounting:value}=l.load('lib/c1SleeveAccounting.js');
const {c1CombinedPortfolio:combined}=l.load('lib/c1CombinedPortfolio.js');
const {C1_FROZEN_OPTIONS:options}=l.load('lib/c1FrozenOptions.js');
const {reconcileC1VerifiedProviderRevision:reconcile}=l.load('lib/c1ReviewedSessionRevision.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const digest=x=>crypto.createHash('sha256').update(canonical(x)).digest('hex'),ids=['base','cooldown15','sector40'];
function fixture(previous='2026-10-30',current='2026-11-02',opening=false){
 if(opening)return openingFixture(previous,current);
 let ledger=create(100000,'2026-10-14');
 const salePrice=(p,id)=>p*(1-options[id].slippageBps/10000);
 for(const id of ids){ledger=fill(ledger,{id:id+':buy',sleeve:id,date:'2026-10-14',symbol:'AAA',side:'buy',shares:10,price:100,fee:0});ledger=fill(ledger,{id:id+':sell',sleeve:id,date:previous,symbol:'AAA',side:'sell',shares:10,price:salePrice(opening?149:150,id),fee:0});}
 const bar={symbol:'AAA',date:previous,open:149,high:152,low:148,close:150,volume:1000,adjusted:true},nextBar={...bar,date:current,close:151};
 const session={date:previous,prices:[bar],signals:[],universeSymbols:['AAA']},nextSession={...clone(session),date:current,prices:[nextBar],decisionAt:current+'T22:00:00.000Z'};
 const prior={contract:'c1-dated-index-book-v1',universe:'sp500',captures:[{sessionDate:previous,hash:'d'.repeat(64)}],model:{sessions:[session],ledger,paperExecution:{records:['immutable']}}};prior.recordHash=digest(prior);
 const status={status:'unchanged',reason:null,proposedOrderCount:0,executable:false,basis:'retrospective-model-event-paper-mapping'};
 const summarize=(state,s)=>{const marks={AAA:151},v=value(state,marks);return {cash:v.cash,equity:v.equity,virtualShares:v.virtualShares,
  combinedPortfolio:combined(state,marks,current),sleeves:Object.fromEntries(ids.map(id=>[id,{cash:state.sleeves[id].cash,positions:state.sleeves[id].positions,tradeCount:2}])),paperExecution:s,unchanged:'sentinel'};};
 const original={...clone(prior.model),sessions:[clone(session),clone(nextSession)],pendingBySleeve:{base:[{symbol:'BBB',side:'buy',shares:2}],cooldown15:[],sector40:[]},pendingDecisionStatus:{status:'research-queue-only'},paperExecutionStatus:status,summary:summarize(ledger,status)};
 const prices=[{...bar,...(opening?{open:148.8,high:152.1}:{close:150.2}),volume:1100}],corrected=clone(original);corrected.sessions[0].prices=clone(prices);
 for(const sale of corrected.ledger.fills)if(sale.side==='sell')sale.price=salePrice(opening?148.8:150.2,sale.sleeve);
 corrected.ledger=restore(corrected.ledger);corrected.paperExecutionStatus={...status,status:'blocked',reason:'Model history changed'};corrected.summary=summarize(corrected.ledger,corrected.paperExecutionStatus);
 const input={sourceSessionDate:current,session:nextSession,observedAt:nextSession.decisionAt};
 return {prior,input,original,corrected,prices};
}
function openingFixture(previous,current,changedOpen=79.8){
 const {advanceC1ForwardModel:advance,c1ForwardOperationalState:state}=l.load('lib/c1ForwardModel.js');
 const {isUsMarketSessionDay}=l.load('lib/marketSession.js');
 const dates=[previous];let t=Date.parse(previous+'T12:00:00Z');
 while(dates.length<4){t-=86400000;const d=new Date(t).toISOString().slice(0,10);if(isUsMarketSessionDay(d))dates.unshift(d);}
 const symbols=Array.from({length:10},(_,i)=>'S'+i);
 const session=(date,price)=>({date,decisionAt:date+'T22:00:00.000Z',universeSymbols:symbols,
  prices:[...symbols,'SPY','QQQ'].map(symbol=>({symbol,date,open:price,close:price,high:price+1,low:price-1,volume:10000000,adjusted:true})),
  signals:symbols.map((symbol,i)=>({symbol,sector:'Sector'+i%5,price,researchFactors:{momentumPercentile:100-i,volatility60Pct:20,coverage:1,return60Ex5:20,return120Ex5:30,return252Ex21:40},entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))});
 let model=null;for(const date of dates)model=advance(model,[session(date,date===previous?80:100)],new Date(date+'T22:00:00Z'));
 assert(model.ledger.fills.some(f=>f.side==='sell'));assert(ids.every(id=>!Object.keys(model.ledger.sleeves[id].positions).length));
 const prior={contract:'c1-dated-index-book-v1',universe:'sp500',captures:[{sessionDate:previous,hash:'d'.repeat(64)}],model};prior.recordHash=digest(prior);
 const next=session(current,80),input={sourceSessionDate:current,session:next,observedAt:next.decisionAt};
 const original=advance(model,[next],new Date(input.observedAt));
 const revised=clone(model),prices=revised.sessions.at(-1).prices;prices.find(p=>p.symbol==='S0').open=changedOpen;
 const corrected=advance(revised,[next],new Date(input.observedAt));
 assert.deepEqual(state(original),state(corrected),'Complete real risk, cooldown, trade identity and pending state stays equal');
 return {prior,input,original,corrected,prices};
}
function audit(f,p){return {contract:'c1-recorded-sale-revision-v1',provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',priorRecordHash:f.prior.recordHash,
 previousSessionDate:f.prior.model.sessions.at(-1).date,currentSessionDate:f.input.sourceSessionDate,observations:['a'.repeat(64),'b'.repeat(64)],
 originalInputsPreserved:true,identicalModelEconomics:false,privateAccountTreatment:'preserved-recorded-basis',economicAdjustments:[],executable:false,eligibleForAlphaClaim:false,
 comparisonHash:digest(f.original),correctedPrices:f.prices,recordedSaleProof:p};}
async function main(){
 for(const [prev,next] of [['2026-10-30','2026-11-02'],['2026-11-02','2026-11-03'],['2026-11-05','2026-11-06']]){
  const f=fixture(prev,next),before=canonical(f),p=prove(f.prior,f.input,f.original,f.corrected,f.prices,digest);assert(p,'Generic proof does not depend on a fixed prior record/date');assert.equal(p.recordedFillCount,3);assert.equal(p.newModelFills,0);assert.equal(canonical(f),before);
  const a=audit(f,p),book={model:f.original,reconciliations:[a]};assert(valid(a,book));
  l.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage(book,{adoption:{sourceSessionDate:'2026-10-14'}},next);
  for(const mutate of [x=>x.ledger.fills[1].shares++,x=>x.ledger.fills[1].fee++,x=>x.ledger.fills[1].price+=.01,x=>x.ledger.fills[0].price++,
   x=>x.ledger.fills[1].date='2026-10-14',x=>x.ledger.sleeves.base.positions.AAA=1,x=>x.pendingBySleeve.base[0].shares++,
   x=>x.pendingDecisionStatus.changed=true,x=>x.paperExecution.changed='new',x=>x.summary.unchanged='changed',x=>x.unknownField='changed',x=>x.sessions[1].prices[0].close++]){
   const bad=clone(f.corrected);mutate(bad);assert.equal(prove(f.prior,f.input,f.original,bad,f.prices,digest),null);
  }
  for(const patch of [{open:148.5},{high:153},{low:147},{close:75},{symbol:'BBB'},{unknown:'field'}]){
   const prices=[{...f.prices[0],...patch}];assert.equal(prove(f.prior,f.input,f.original,f.corrected,prices,digest),null,'Unproved range/basis/identity changes reject');
  }
  for(const mutate of [x=>x.recordedSaleProof.recordedLedgerHash='f'.repeat(64),x=>x.recordedSaleProof.counterfactualLedgerHash='f'.repeat(64),
   x=>x.recordedSaleProof.changes[0].shares++,x=>x.recordedSaleProof.changes[0].observedPrice++,x=>x.recordedSaleProof.counterfactualCashDelta++,
   x=>x.recordedSaleProof.newModelFills=1,x=>x.economicAdjustments.push({cash:1}),x=>x.identicalModelEconomics=true,x=>x.observations=['a'.repeat(64)]]){
   const bad=clone(a);mutate(bad);assert.equal(valid(bad,book),false);assert.throws(()=>l.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage({...book,reconciliations:[bad]},{adoption:{sourceSessionDate:'2026-10-14'}},next),/reconciliation/);
  }
  // The real reconciliation gate still requires two independent archived bars.
  const observed=f.input.observedAt,other=new Date(Date.parse(observed)-600000).toISOString();
  const payload={...f.input,sourceReceipt:{provider:'FMP',membershipCheckedTwice:true},priorSessionPrices:{date:prev},
   priceEvidence:{contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',rows:f.prices.map(p=>({symbol:p.symbol,date:prev,adjOpen:p.open,adjHigh:p.high,adjLow:p.low,adjClose:p.close,volume:p.volume}))}};
  const observations=[{observationHash:'a'.repeat(64),observedAt:other,payload:{...clone(payload),observedAt:other}},{observationHash:'b'.repeat(64),observedAt:observed,payload}];
  const advance=model=>model.sessions[0].prices[0].close===150?clone(f.original):clone(f.corrected);
  const result=reconcile(f.prior,payload,new Date(observed),digest,advance,observations);assert.equal(result.audit.contract,'c1-recorded-sale-revision-v1');assert.equal(canonical(result.model),canonical(f.original));
  assert.throws(()=>reconcile(f.prior,payload,new Date(observed),digest,advance,observations.slice(1)),/evidence or economic/);
 }
 // November4's production failure was an already recorded opening sale, not
 // a closing sale. Generalize the proved fill field, never the price tolerance.
 // The dates and small fixture are synthetic; original incident replay is
 // separately bound to the downloaded book/observation hashes in the report.
 for(const [previous,current] of [['2026-11-03','2026-11-04'],['2026-11-06','2026-11-09']]){
  const f=fixture(previous,current,true),before=canonical(f),p=prove(f.prior,f.input,f.original,f.corrected,f.prices,digest);
  assert(p,'Repeat-confirmed historical opening sales can preserve their recorded basis');
  assert.equal(p.contract,'c1-recorded-sale-revision-proof-v2');assert.equal(p.openingSalesFullyClosed,true);
  assert(p.changes.every(change=>change.priceField==='open'));assert.equal(canonical(f),before);
  const a=audit(f,p),book={model:clone(f.original),reconciliations:[a]};assert(valid(a,book));
  l.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage(book,{adoption:{sourceSessionDate:'2026-10-14'}},current);
  for(const mutate of [x=>x.ledger.fills[1].shares++,x=>x.ledger.fills[1].fee++,x=>x.ledger.fills[1].price+=.01,
   x=>x.ledger.fills[1].date=current,x=>x.ledger.fills[1].side='buy',x=>x.ledger.fills[1].symbol='BBB',
   x=>x.ledger.fills[0].price++,x=>x.ledger.sleeves.base.cash++,x=>x.ledger.sleeves.base.positions.AAA=1,
   x=>x.pendingBySleeve.base[0].shares++,x=>x.pendingBySleeve.base[0].stopPrice=100,
   x=>x.pendingDecisionStatus.changed=true,x=>x.summary.unchanged='changed',x=>x.paperExecution.changed='new',
   x=>x.paperExecutionStatus.reason='different',x=>x.sessions[1].prices[0].close++,x=>x.unknown='changed']){
   const bad=clone(f.corrected);mutate(bad);assert.equal(prove(f.prior,f.input,f.original,bad,f.prices,digest),null);
  }
  for(const mutate of [x=>x.recordedSaleProof.contract='c1-recorded-sale-revision-proof-v1',
   x=>x.recordedSaleProof.openingSalesFullyClosed=false,x=>x.recordedSaleProof.operationalStateHash='invalid',x=>x.recordedSaleProof.changes[0].priceField='close',
   x=>x.recordedSaleProof.changes[0].observedPrice++,x=>x.recordedSaleProof.counterfactualCashDelta++,
   x=>x.recordedSaleProof.newModelFills=1,x=>x.correctedPrices[0].open++,x=>x.correctedPrices[0].high=1,
   x=>x.economicAdjustments.push({amount:1}),x=>x.observations=['a'.repeat(64)]]){
   const bad=clone(a);mutate(bad);assert(!valid(bad,book));
   assert.throws(()=>l.load('lib/c1AccountInput.js').assertC1AccountRevisionCoverage({...book,reconciliations:[bad]},{adoption:{sourceSessionDate:'2026-10-14'}},current),/reconciliation/);
  }
  const changed=clone(f);changed.original.ledger.fills.push({id:'new'});
  assert.equal(prove(changed.prior,changed.input,changed.original,changed.corrected,changed.prices,digest),null);
  // A surviving position invalidates the opening extension even if both
  // replayed ledgers agree: hidden simulator stops must not be assumed equal.
  const surviving=clone(f);
  for(const model of [surviving.prior.model,surviving.original,surviving.corrected]){
   model.ledger=fill(model.ledger,{id:'survivor',sleeve:'base',date:previous,symbol:'BBB',side:'buy',shares:1,price:10,fee:0});
  }
  const {recordHash,...content}=surviving.prior;surviving.prior.recordHash=digest(content);
  assert.equal(prove(surviving.prior,surviving.input,surviving.original,surviving.corrected,surviving.prices,digest),null);
  const observed=f.input.observedAt,earlier=new Date(Date.parse(observed)-600000).toISOString();
  const payload={...f.input,sourceReceipt:{provider:'FMP',membershipCheckedTwice:true},priorSessionPrices:{date:previous},
   priceEvidence:{contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',rows:f.prices.map(p=>({symbol:p.symbol,date:previous,adjOpen:p.open,adjHigh:p.high,adjLow:p.low,adjClose:p.close,volume:p.volume}))}};
  const observations=[{observationHash:'a'.repeat(64),observedAt:earlier,payload:{...clone(payload),observedAt:earlier}},{observationHash:'b'.repeat(64),observedAt:observed,payload}];
  const advance=model=>model.sessions.at(-1).prices[0].open===80?f.original:f.corrected;
  const result=reconcile(f.prior,payload,new Date(observed),digest,advance,observations);
  assert.equal(result.audit.contract,'c1-recorded-sale-revision-v1');assert.equal(canonical(result.model),canonical(f.original));
  assert.throws(()=>reconcile(f.prior,payload,new Date(observed),digest,advance,observations.slice(1)),/evidence or economic/);
  const corrupt=clone(f.prior);corrupt.recordHash='e'.repeat(64);
  assert.equal(prove(corrupt,f.input,f.original,f.corrected,f.prices,digest),null);
 }
 // Rollback remains fail-closed: an old reader recognizes the unchanged
 // audit envelope and rejects its unsupported opening proof version.
 {
  const fs=require('node:fs'),vm=require('node:vm'),seams=require('./c1-opening-sale-source-seams.cjs');
  const source=seams.restore('lib/c1RecordedSaleRevision.js',fs.readFileSync('lib/c1RecordedSaleRevision.js','utf8'));
  const box={...l.load('lib/c1SleeveAccounting.js'),...l.load('lib/c1CombinedPortfolio.js'),...l.load('lib/c1FrozenOptions.js'),
   ...l.load('lib/c1SimulatorPhases.js'),...l.load('lib/marketSession.js'),createHash:crypto.createHash};
  vm.createContext(box);vm.runInContext(source.replace(/^import .*;\n/gm,'').replace(/export /g,'')+';this.prove=proveC1RecordedSaleRevision;this.valid=isC1RecordedSaleRevisionAudit;',box);
  const f=fixture('2026-11-03','2026-11-04',true),p=prove(f.prior,f.input,f.original,f.corrected,f.prices,digest),a=audit(f,p),book={model:f.original,reconciliations:[a]};
  assert(p);assert.equal(box.prove(f.prior,f.input,f.original,f.corrected,f.prices,digest),null,'Defective source cannot reconcile the real opening-sale fixture');
  assert.equal(box.valid(a,book),false,'Older proof version cannot approve opening sales');
  const accountSource=fs.readFileSync('lib/c1AccountInput.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  const oldAccount={isC1RecordedSaleRevisionAudit:box.valid};vm.createContext(oldAccount);vm.runInContext(accountSource+';this.check=assertC1AccountRevisionCoverage;',oldAccount);
  assert.throws(()=>oldAccount.check(book,{adoption:{sourceSessionDate:'2026-10-14'}},'2026-11-04'),/reconciliation/);
  assert.equal(prove(f.prior,f.input,clone(f.original),clone(f.corrected),f.prices,digest),null,'Serialized/fabricated replay cannot replace ephemeral operational evidence');
 }
 // The actual authenticated read-only operations route reports only scalar
 // proof metadata. Detailed virtual fills and future debug fields stay private.
 const fs=require('node:fs'),vm=require('node:vm'),f=fixture(),proof=prove(f.prior,f.input,f.original,f.corrected,f.prices,digest);
 proof.debug={symbol:'PRIVATE_SENTINEL',shares:999,price:777};
 const a=audit(f,proof),book={model:f.original,reconciliations:[a],captures:[{sessionDate:f.input.sourceSessionDate}],recordHash:'c'.repeat(64)};
 assert(valid(a,book));const bytes=canonical(book),logs=[];
 const route=fs.readFileSync('pages/api/ops/c1-acceptance.js','utf8').replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler');
 const context={Date,Buffer,timingSafeEqual:crypto.timingSafeEqual,process:{env:{CRON_SECRET:'offline-ops-only'}},
  C1_RECORDED_SALE_FINALIZATION:l.load('lib/c1RecordedSaleFinalization.js').C1_RECORDED_SALE_FINALIZATION,
  isC1RecordedSaleRevisionAudit:valid,latestCompletedMarketSessionDay:l.load('lib/marketSession.js').latestCompletedMarketSessionDay,
  readStoredC1DatedBook:async()=>({record:book,view:{sourceSessionDate:f.input.sourceSessionDate,recordHash:book.recordHash}}),
  console:{info:(...args)=>logs.push(args),error(){throw Error('Unexpected operations error');}}};
 vm.createContext(context);vm.runInContext(route+';this.handler=handler;',context);let status,report;
 await context.handler({method:'GET',headers:{authorization:'Bearer offline-ops-only'}},{setHeader(){},status(s){status=s;return this;},json(b){report=b;return this;}});
 assert.equal(status,200);assert.equal(report.latestAuditSafe,true);assert.equal(report.latestReconciliation.recordedSaleProof.recordedFillCount,3);
 assert(!Object.hasOwn(report.latestReconciliation.recordedSaleProof,'changes'));assert(!Object.hasOwn(report.latestReconciliation.recordedSaleProof,'debug'));
 assert.doesNotMatch(JSON.stringify([report,logs]),/PRIVATE_SENTINEL|recordedPrice|observedPrice|shares|"symbol"/);
 assert.equal(canonical(book),bytes,'Operations reporting cannot alter the original model/audit');
 console.log('PASS: general repeat-confirmed opening/close-sale finalization across independent dates/books, canonical fill pricing, full counterfactual model reconstruction, original model/account basis preserved; altered cash/fills/positions/queues/unknown fields/range/basis/receipts rejected.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
