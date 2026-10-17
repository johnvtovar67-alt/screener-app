// Independent reviewer synthetic-only exploratory gates; no network/historical execution.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),root=process.env.C1_RESEARCH_ROOT||path.resolve(__dirname,'../..');process.chdir(root);
const out=process.argv[2]||process.env.C1_REVIEW_OUTPUT_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'c1-exploratory-review-'));fs.mkdirSync(out,{recursive:true});
const plain=x=>JSON.parse(JSON.stringify(x));
const {input}=require(root+'/tools/c1-champion-control-parity-review.cjs'),{createControlAdapter:strict}=require(root+'/tools/c1-research/control-adapter.cjs'),{createControlAdapter:explore}=require(root+'/tools/c1-exploratory/account-adapter.cjs'),{challengerTransform}=require(root+'/tools/c1-exploratory/transform.cjs'),{fillsFor,execute}=require(root+'/tools/c1-exploratory/runner.cjs');
let cases=[];
for(const costBps of [12,25,50]){
 const f=input([100,100,85,86]),all=f.dataset.sessions,baseline=all[220],opening=all[221],history=all.slice(0,221),a=strict(root,{costBps,policyMode:'retrospective-current'}),b=explore(root,{costBps,policyMode:'retrospective-current',transform:challengerTransform({id:'C'})}),l=a.loader;
 const portfolio=[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],adoption=l.load('lib/c1AccountSeed.js').createC1ProspectiveSeeds({portfolio,baseline,capitalRecord:{version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:l.load('lib/portfolioGovernor.js').portfolioCompositionSignature(portfolio)},adoptionConfirmed:true});
 const screen={decision:{stockScreen:l.load('lib/c1StockClassification.js').buildC1StockScreenSnapshot(baseline,new Date(baseline.decisionAt),history),current:true,sourceSessionDate:baseline.date,decisionId:'synthetic'},rows:baseline.screenRows,current:true},observedAt=opening.date+'T14:30:00Z',args={adoption,sessions:[baseline],historySessions:history,records:[],opening,observedAt,screen,account:{brokerageCash:{balance:100000,source:'manual-broker-balance',observedAt:opening.date+'T13:00:00Z'}}};
 const r=a.project(args),e=b.project(args);assert.deepEqual(plain(r),plain(e));
 const future=plain(opening);for(const p of future.prices){p.high=p.open*100;p.low=p.open/100;p.close=p.open*2;}assert.deepEqual(plain(e),plain(b.project({...args,opening:future})));
 const fills=fillsFor(e,opening,costBps),accepted=b.record({review:e,fills,observedAt:opening.date+'T22:00:00Z'}),own=plain(e.plan.openingBooks);
 for(const fill of fills){const o=e.plan.orders.find(x=>x.id===fill.orderId),book=own[o.sleeve],position=book.positions[o.symbol],n=position?.shares||0;assert(Number.isSafeInteger(fill.shares));const q=n+(fill.side==='buy'?fill.shares:-fill.shares);book.cash+=(fill.side==='buy'?-1:1)*fill.shares*fill.price-fill.fee;assert(q>=0&&book.cash>=-1e-6);if(q){const avgCost=fill.side==='buy'?(n*(position?.avgCost||0)+fill.shares*fill.price+fill.fee)/q:position.avgCost;book.positions[o.symbol]={shares:q,avgCost,openedAt:position?.openedAt||opening.date};}else delete book.positions[o.symbol];}
 assert.deepEqual(plain(accepted.accepted.books),own);cases.push({costBps,strictControlIdentity:'PASS',futureOHLCDecisionInvariance:'PASS',independentCashSharesBasis:'PASS'});
}
// Focused stop fill math with actual ownership lower than projected authority.
const synthetic={plan:{openingBooks:{base:{cash:1000,positions:{AAA:{shares:7}}}},orders:[{id:'stop',sleeve:'base',symbol:'AAA',side:'sell',shares:10,estimatedPrice:90,condition:'stop-triggered'}]}};
const stops=fillsFor(synthetic,{date:'2025-02-03',prices:[{symbol:'AAA',open:85,low:80}]},50);assert.equal(stops[0].shares,7);assert.equal(stops[0].price,85*.995);
assert.equal(fillsFor(synthetic,{date:'2025-02-03',prices:[{symbol:'AAA',open:100,low:95}]},50).length,0);
const report={author:'independent_control_review agent',scope:'Synthetic source/ledger/fill gates only',cases,stopTriggerAndGapPrice:'PASS',historicalExecutions:0};fs.writeFileSync(path.join(out,'exploratory-gates.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report);
