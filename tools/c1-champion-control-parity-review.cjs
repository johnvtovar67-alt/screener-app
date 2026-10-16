// ARCHIVED DEFECT COUNTEREXAMPLE: intentionally tests the retired prototype and exits 2.
// Current replacement control evidence: c1-research/control-parity-test.cjs.
// Differential source/adapter review. Synthetic mechanics, not historical performance.
const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
const {createResearchModuleLoader}=require(root+'/tools/research-module-loader.cjs');
const {createPrototypeEngine:createEngine,verifySources}=require(root+'/tools/c1-research/engine.cjs');
const {fixture}=require(root+'/tools/c1-recent-momentum-challenger-regression.cjs');
const spec=require(root+'/tools/c1-research/research-spec-v1.json');
verifySources(root);const loader=createResearchModuleLoader(root);
const {previousMarketSessionDay,isUsMarketSessionDay}=loader.load('lib/marketSession.js');
const {createC1ProspectiveSeeds}=loader.load('lib/c1AccountSeed.js');
const {portfolioCompositionSignature}=loader.load('lib/portfolioGovernor.js');
const {planC1ActualAccountOpening}=loader.load('lib/c1AccountExecution.js');
const {buildC1StockScreenSnapshot,classifyC1StockScreen}=loader.load('lib/c1StockClassification.js');
function input(prices=[100,100,100]){const f=fixture(prices);let dates=['2026-10-14'];for(let i=0;i<220;i++)dates.unshift(previousMarketSessionDay(dates[0]));let next=new Date('2026-10-14T12:00:00Z');while(dates.length<f.dataset.sessions.length){next.setUTCDate(next.getUTCDate()+1);const d=next.toISOString().slice(0,10);if(isUsMarketSessionDay(d))dates.push(d);}
 for(let i=0;i<f.dataset.sessions.length;i++){const s=f.dataset.sessions[i];s.date=dates[i];s.decisionAt=s.date+'T21:00:00Z';for(const p of s.prices)p.date=s.date;for(const field of ['signals','positionSignals'])for(const x of s[field]||[]){x.entryTiming.asOf=s.date;for(const k of ['marketAvailableAt','fundamentalsAvailableAt','eventRiskAvailableAt'])if(x[k])x[k]=s.decisionAt;}
 s.screenRows=s.signals.map(x=>({...x,expertDecision:{strongBuyPass:true,metrics:{quoteFreshnessPass:true}},eventRisk:{blockNewCapital:false}}));}return f;}
module.exports={input};
if(require.main===module){
const fixtures=[];
for(const block of [false,true]){
 const f=input(),s=f.dataset.sessions[220],opening=f.dataset.sessions[221];if(block){for(const field of ['signals','positionSignals','screenRows']){const x=s[field].find(x=>x.symbol==='AAA');x.eventRisk={blockNewCapital:true,availableAt:s.decisionAt};}}
 const portfolio=[{symbol:'CASH',role:'Swing',shares:100000,avgCost:1}],capitalRecord={version:2,highWater:100000,triggerDay:null,reconciliationRequired:false,portfolioSignature:portfolioCompositionSignature(portfolio)};
 const adoption=createC1ProspectiveSeeds({portfolio,baseline:s,capitalRecord,adoptionConfirmed:true});
 const before=JSON.stringify({f,adoption});const projected=planC1ActualAccountOpening({adoption,baseline:s,opening,observedAt:opening.date+'T14:00:00Z',historySessions:f.dataset.sessions.slice(0,221)});
 const source=projected.orders.filter(x=>x.side==='buy').map(x=>({sleeve:x.sleeve,symbol:x.symbol,shares:x.shares,price:x.estimatedPrice}));
 const derived=createEngine(root,spec.arms.find(a=>a.id==='C')).run(f.dataset,s.date,opening.date,12);
 const snapshot=buildC1StockScreenSnapshot(s,new Date(s.decisionAt),f.dataset.sessions.slice(0,221));const screenAllowed=new Set(classifyC1StockScreen({snapshot,rows:s.screenRows,current:true}).filter(x=>['Buy','Strong Buy'].includes(x.rating)).map(x=>x.symbol));
 const screenedSource=source.filter(x=>screenAllowed.has(x.symbol));
 const adapter=derived.trades.filter(x=>x.side==='buy').map(x=>({sleeve:x.sleeve,symbol:x.symbol,shares:x.shares,price:x.price}));
 fixtures.push({case:block?'event-block-in-screen':'clear-entry',sourceOpeningOrdersAfterSameScreenFilter:screenedSource,adapterOpeningFills:adapter,exactMatch:JSON.stringify(screenedSource)===JSON.stringify(adapter),immutable:JSON.stringify({f,adoption})===before});
}
const report={scope:'Synthetic differential check; no historical returns or investment comparison',productionSource:spec.production_commit,status:fixtures.every(x=>x.exactMatch)?'MATCH_IN_TWO_SCENARIOS_ONLY':'PARITY_NOT_ESTABLISHED',fixtures};if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({scope:report.scope,productionSource:report.productionSource,status:report.status,fixtures:fixtures.map(x=>({case:x.case,exactMatch:x.exactMatch,sourceOrders:x.sourceOpeningOrdersAfterSameScreenFilter.length,adapterFills:x.adapterOpeningFills.length,immutable:x.immutable}))},null,2));if(!fixtures.every(x=>x.exactMatch))process.exitCode=2;

}
