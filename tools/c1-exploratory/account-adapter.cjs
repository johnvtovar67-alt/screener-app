// Separate exploratory copy of repaired source orchestration; strict adapter unchanged.
// Research-only orchestration of unchanged production projection and accounting.
// No network/storage; callers must explicitly supply evidence and hypothetical fills.
const {createResearchModuleLoader}=require('../c1-research/module-loader.cjs');
function createControlAdapter(root,{costBps=12,policyMode='production-dated',transform=(file,source)=>source}={}){
 if(![12,25,50].includes(costBps))throw Error('Cost must be frozen 12/25/50bps');
 if(!['production-dated','retrospective-current'].includes(policyMode))throw Error('Explicit qualified policy mode required');
 const seams=[];
 const loader=createResearchModuleLoader(root,(file,source)=>{
  source=transform(file,source);
  if(file==='lib/c1FrozenOptions.js'&&costBps!==12){
   const from='"slippageBps": 12';
   if(source.split(from).length!==4)throw Error('Cost seam changed: expected three frozen sleeves');
   source=source.replaceAll(from,'"slippageBps": '+costBps);seams.push({file,kind:'common-research-cost',costBps});
  }
  if(file==='lib/c1RecentMomentumLivePolicy.js'&&policyMode==='retrospective-current'){
   const from="C1_RECENT_MOMENTUM_LIVE_SOURCE_DATE='2026-10-14'";
   if(source.split(from).length!==2)throw Error('October activation seam changed');
   source=source.replace(from,"C1_RECENT_MOMENTUM_LIVE_SOURCE_DATE='1900-01-01'");
   seams.push({file,kind:'explicit-current-policy-retrospective-activation',historicalDeploymentClaim:false});
  }
  return source;
 });
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
  // Production executionView caps the full projection BEFORE the component's
  // screen intersection. A rejected display buy must not release its budget.
  const strategyCash=Object.values(rawPlan.openingBooks).reduce((s,b)=>s+b.cash,0);
  const authorityPlan=capC1ExecutionCash({plan:rawPlan,account:{...account,records},strategyCash,now:new Date(observedAt)});
  const evidence=resolveC1ScreenEvidence(screen),allowed=new Set(evidence.buySymbols);
  const screenBlockedOrders=authorityPlan.orders.filter(o=>o.side==='buy'&&!allowed.has(o.symbol));
  const plan={...authorityPlan,orders:authorityPlan.orders.filter(o=>o.side!=='buy'||allowed.has(o.symbol))};
  return {label:'Research-only source projection; no live execution authority',rawPlan,authorityPlan,screenEvidence:evidence,screenBlockedOrders,plan};
 }
 function record({review,fills,observedAt}){
  // No fabricated execution selection: a separate, audited execution profile
  // must supply dated hypothetical fills. The source ledger checks economics.
  const permitted=new Map(review.plan.orders.map(o=>[o.id,o])),quantities=new Map(),seen=new Map();
  for(const fill of fills){
   if(seen.has(fill.id)){if(JSON.stringify(seen.get(fill.id))!==JSON.stringify(fill))throw Error('Conflicting actual fill ID');continue;}
   seen.set(fill.id,fill);
   const order=permitted.get(fill.orderId),quantity=(quantities.get(fill.orderId)||0)+fill.shares;
   if(!order||order.side!==fill.side||order.symbol!==fill.symbol||quantity>order.shares)throw Error('Research fill is outside the screen-permitted source authority');
   quantities.set(fill.orderId,quantity);
  }
  const accepted=ledger.reconcileC1ActualAccountFills({plan:review.authorityPlan,fills,observedAt});
  return {label:'Hypothetical research record; never a broker/account record',accepted,record:{date:review.plan.date,openingObservedAt:review.plan.observedAt,complete:true,
   ...(review.plan.completionPolicy?{completionPolicy:review.plan.completionPolicy}:{}),executionEvidence:review.authorityPlan,fills:accepted.fills}};
 }
 return {loader,project,record,policyProfile:{policyMode,costBps,seams},decision:buildC1AccountDecision,continue:ledger.continueC1ActualAccount};
}
module.exports={createControlAdapter};
