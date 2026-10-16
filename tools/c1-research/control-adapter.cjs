// Research-only orchestration of unchanged production projection and accounting.
// No network/storage; callers must explicitly supply evidence and hypothetical fills.
const {createResearchModuleLoader}=require('./module-loader.cjs');
function createControlAdapter(root){
 const loader=createResearchModuleLoader(root);
 const execution=loader.load('lib/c1AccountExecution.js');
 const ledger=loader.load('lib/c1AccountLedger.js');
 const {resolveC1ScreenEvidence}=loader.load('lib/c1ScreenEvidence.js');
 const {buildC1AccountDecision}=loader.load('lib/c1AccountDecision.js');
 const {capC1ExecutionCash}=loader.load('lib/c1ExecutionCashAuthority.js');
 function project({adoption,sessions,historySessions,records=[],cashReconciliations=[],opening,observedAt,screen,account,completionPolicy}){
  // Do not feed the current screen into queue construction. Source projections
  // remain in normalized model units and are rounded by the source account path.
  if(screen?.decision?.sourceSessionDate!==sessions.at(-1)?.date||screen?.decision?.stockScreen?.sourceSessionDate!==sessions.at(-1)?.date)throw Error('Screen evidence must bind the projected source session');
  const rawPlan=records.length||sessions.length>1
   ?execution.planC1ContinuedAccountOpening({adoption,sessions,historySessions,records,cashReconciliations,opening,observedAt,completionPolicy})
   :execution.planC1ActualAccountOpening({adoption,baseline:sessions[0],historySessions,opening,observedAt});
  const evidence=resolveC1ScreenEvidence(screen);
  const allowed=new Set(evidence.buySymbols);
  const screenBlockedOrders=rawPlan.orders.filter(o=>o.side==='buy'&&!allowed.has(o.symbol));
  // Intersection only: screening cannot add an order, change its ID, or rerank.
  const screened={...rawPlan,orders:rawPlan.orders.filter(o=>o.side!=='buy'||allowed.has(o.symbol)),projectedBooks:null};
  const strategyCash=Object.values(rawPlan.openingBooks).reduce((s,b)=>s+b.cash,0);
  const plan=capC1ExecutionCash({plan:screened,account:{...account,records},strategyCash,now:new Date(observedAt)});
  return {label:'Research-only source projection; no live execution authority',rawPlan,screenEvidence:evidence,screenBlockedOrders,plan};
 }
 function record({review,fills,observedAt}){
  // No fabricated execution selection: a separate, audited execution profile
  // must supply dated hypothetical fills. The source ledger checks economics.
  const accepted=ledger.reconcileC1ActualAccountFills({plan:review.plan,fills,observedAt});
  return {label:'Hypothetical research record; never a broker/account record',accepted,record:{date:review.plan.date,openingObservedAt:review.plan.observedAt,complete:true,
   ...(review.plan.completionPolicy?{completionPolicy:review.plan.completionPolicy}:{}),executionEvidence:review.plan,fills:accepted.fills}};
 }
 return {loader,project,record,decision:buildC1AccountDecision,continue:ledger.continueC1ActualAccount};
}
module.exports={createControlAdapter};
