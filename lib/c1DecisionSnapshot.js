import { latestCompletedMarketSessionDay } from './marketSession';

export const C1_DECISION_CONTRACT='c1-shared-model-decision-v1';

// A single model interpretation for Opportunities, Portfolio and the API.
// Close-generated queue entries are conditional model candidates, never
// executable orders or target weights for an existing brokerage account.
export function buildC1DecisionSnapshot({model,inputArchive,sourceSessionDate,now=new Date()}={}) {
  const required=latestCompletedMarketSessionDay(now),issues=[];
  const current=sourceSessionDate===required && model?.sourceSessionDate===required;
  const inputVerified=inputArchive?.status==='captured' && inputArchive.sessionDate===required &&
    /^[a-f0-9]{64}$/.test(inputArchive.observedHash||'') && inputArchive.firstHash===inputArchive.observedHash;
  if(!current)issues.push({code:'MODEL_SESSION',message:'The model does not have a current completed session.'});
  if(!inputVerified)issues.push({code:'INPUT_IDENTITY',message:'The current input record is missing or has changed.'});
  if(model?.status!=='paper-only' || model?.paperExecution?.status==='blocked')
    issues.push({code:'MODEL_REPLAY',message:model?.error||model?.paperExecution?.reason||'The model replay is unavailable.'});
  const datedIndex = ['nasdaq','sp500'].includes(model?.cohort);
  if(datedIndex) issues.push({code:'HISTORICAL_PROVENANCE',message:'This is the observed '+model.cohort+' index. Historical sector provenance and model-selection limitations remain unresolved.'});
  else if(inputArchive?.sourcePointInTime!==true)
    issues.push({code:'PRODUCTION_UNIVERSE',message:'The live data cohort is not the historical index universe used in the C1 tests.'});
  issues.push({code:'RELEASE_ACCEPTANCE',message:'The complete live recommendation path has not earned C1 trading authority.'});
  const combined=model?.combinedPortfolio,queue=model?.modelQueue;
  const usable=current&&inputVerified&&model?.status==='paper-only'&&model?.paperExecution?.status!=='blocked' &&
    combined?.contract==='c1-combined-holdings-v1'&&Array.isArray(combined.positions)&&Array.isArray(queue);
  const bySymbol=new Map();
  if(usable){
    for(const position of combined.positions)bySymbol.set(position.symbol,{symbol:position.symbol,
      modelPresence:'present',observedWeightPct:position.observedWeightPct,pending:[]});
    for(const order of queue){
      if(!bySymbol.has(order.symbol))bySymbol.set(order.symbol,{symbol:order.symbol,modelPresence:'absent',observedWeightPct:0,pending:[]});
      bySymbol.get(order.symbol).pending.push({sleeve:order.sleeve,sequence:order.sequence,side:order.side});
    }
  }
  return {contract:C1_DECISION_CONTRACT,
    decisionId:[C1_DECISION_CONTRACT,sourceSessionDate||'missing',inputArchive?.observedHash||'missing',model?.modelIdentity||'missing',model?.modelRevision??'missing'].join(':'),
    status:usable?'diagnostic-only':'unavailable',sourceSessionDate:sourceSessionDate||null,requiredSessionDate:required,
    executable:false,activationAuthorized:false,eligibleForLiveCapital:false,orders:[],
    modelSource:'c1FrozenSimulator',universe:datedIndex?model.cohort:'current-production-compiler-paper-model',
    issues,positions:usable?combined.positions:[],cashWeightPct:usable?combined.cashWeightPct:null,
    symbols:[...bySymbol.values()].sort((a,b)=>a.symbol.localeCompare(b.symbol)),
    earliestExecutionSession:usable?model.pendingDecisions?.earliestExecutionSession||null:null,
    recovery:model?.recovery||null,
    explanation:usable?'These are the frozen engine’s diagnostic holdings and next-session queue. They are not trade instructions.':
      'No current model decision is available. An empty recommendation list does not establish that the strategy chose cash.'};
}

export function c1SymbolModelView(decision,symbol) {
  if(decision?.contract!==C1_DECISION_CONTRACT || decision.status!=='diagnostic-only')
    return {decisionId:decision?.decisionId||null,modelPresence:'unknown',pending:[],executable:false};
  const row=decision.symbols.find(row=>row.symbol===symbol);
  return {decisionId:decision.decisionId,modelPresence:row?.modelPresence||'absent',pending:row?.pending||[],executable:false};
}
