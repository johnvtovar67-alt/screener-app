const stages=new Set(['account-read','account-refresh','conflict-recovery','opening-review','screen-response','broker-cash-review']);
const codes=new Set(['ACCOUNT_RESPONSE_JSON_INVALID','ACCOUNT_RESPONSE_INTERRUPTED','ACCOUNT_RESPONSE_INVALID',
 'ACCOUNT_RESPONSE_TIMEOUT','SCREEN_RESPONSE_JSON_INVALID','SCREEN_RESPONSE_INTERRUPTED','SCREEN_RESPONSE_INVALID','SCREEN_HTTP_FAILED']);

// Fixed browser diagnostics only. Never log the response body, error/message,
// URL, request headers, account identity, holdings or provider details.
export function c1RefreshResponseError(response,{message,stage,code}){
 const safeStage=stages.has(stage)?stage:'account-read',safeCode=codes.has(code)?code:'ACCOUNT_RESPONSE_INVALID';
 let requestId=null;
 try{const id=response?.headers?.get('x-c1-request-id');if(/^(?:[a-f0-9]{10}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(id||''))requestId=id;}catch{}
 const status=Number.isInteger(response?.status)&&response.status>=100&&response.status<=599?response.status:null;
 try{console.warn('C1_REFRESH_FAILURE',JSON.stringify({stage:safeStage,code:safeCode,status,requestId}));}catch{}
 const error=new Error(message);error.code=safeCode;error.stage=safeStage;error.requestId=requestId;return error;
}

const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const rows=value=>Array.isArray(value)&&value.every(row=>record(row)&&typeof row.symbol==='string'&&row.symbol.length>0);
const records=value=>Array.isArray(value)&&value.every(record);
const positionShape=position=>records(position.stops)&&records(position.exits)&&records(position.reviewRules)&&
 ['entryReviews','recentMomentumReviews'].every(field=>position[field]==null||records(position[field]));
function decisionShape(decision){
 return record(decision)&&decision.contract==='c1-account-decision-v1'&&typeof decision.decisionId==='string'&&decision.decisionId.length>0&&
  Number.isSafeInteger(decision.revision)&&rows(decision.positions)&&decision.positions.every(positionShape)&&
  (decision.opportunities==null||rows(decision.opportunities))&&
  (decision.stockScreen?.candidates==null||rows(decision.stockScreen.candidates));
}

// Validate core decision/position collections before replacing a verified view.
// This is a structural boundary, not a complete economic or response schema.
// It never normalizes data, generates orders or relaxes economic gates.
async function readC1ResponseBody(response,{stage,message}){
 let data,timer;
 // Match the existing account-read budget for a body stalled after headers.
 // Expiry stops waiting only: it never aborts/repeats a possibly committed POST.
 try{data=await Promise.race([Promise.resolve().then(()=>response.json()),new Promise((_,reject)=>{
  timer=setTimeout(()=>{const error=new Error(message);error.name='C1AccountBodyTimeout';reject(error);},90000);
 })]);}
 catch(error){throw c1RefreshResponseError(response,{message,stage,code:error?.name==='C1AccountBodyTimeout'?'ACCOUNT_RESPONSE_TIMEOUT':error?.name==='SyntaxError'?'ACCOUNT_RESPONSE_JSON_INVALID':'ACCOUNT_RESPONSE_INTERRUPTED'});}
 finally{clearTimeout(timer);}
 return data;
}
export async function readC1AccountResponse(response,{stage='account-read'}={}){
 const message='The saved account response could not be verified. Reload the saved account before retrying any changes.';
 const data=await readC1ResponseBody(response,{stage,message});
 if(response.ok&&(!record(data)||!decisionShape(data.decision)||(data.executionDecision!=null&&!decisionShape(data.executionDecision))))
  throw c1RefreshResponseError(response,{message,stage,code:'ACCOUNT_RESPONSE_INVALID'});
 return data;
}

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const hexId=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const allocationIds=new Set(['base','cooldown15','sector40']);
const stringRows=value=>Array.isArray(value)&&value.every(row=>typeof row==='string');
const shareAllocations=value=>records(value)&&value.length>0&&value.length<=3&&new Set(value.map(row=>row.sleeve)).size===value.length&&
 value.every(row=>allocationIds.has(row.sleeve)&&Number.isSafeInteger(row.shares)&&row.shares>0);
function cashReviewShape(review,expectedRevision){
 if(!record(review)||review.contract!=='c1-broker-statement-review-v1'||review.status!=='review-only'||!hexId(review.reviewId)||
  !hexId(review.statementReviewId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||review.revision!==expectedRevision||review.financialValid!==true||
  !record(review.window)||!day(review.window.from)||!day(review.window.through)||review.window.from>review.window.through||
  !record(review.statement)||!Number.isSafeInteger(review.statement.rowCount)||review.statement.rowCount<1||
  !['originalLedgerCash','afterKnownEventsCash','externalCapitalNet','pnlCashNet','tradeCashAdjustment'].every(field=>finite(review[field])))return false;
 const residual=review.remainingRoundedBalanceAdjustment,preview=review.financialPreview,cash=review.currentBrokerAvailability;
 if(!record(residual)||residual.allowed!==true||residual.limit!==5||!finite(residual.amount)||Math.abs(residual.amount)>5||
  !record(cash)||cash.brokerageCashCurrent!==true||!finite(cash.brokerageCash)||cash.brokerageCash<0||
  !record(preview)||!day(preview.sourceSessionDate)||preview.valuationBasis!=='accepted-close-and-recorded-fills'||
  preview.capitalAttribution!=='proportional-marked-allocation-equity'||preview.capitalRiskTreatment!=='proportional-nav-no-reset'||
  !finite(preview.currentCash)||preview.currentCash<0||!finite(preview.accountingCash)||Math.abs(preview.currentCash-preview.accountingCash)>.0100001||
  Math.abs(preview.currentCash-cash.brokerageCash)>.0100001||!stringRows(preview.preserved)||
  !records(preview.allocations)||preview.allocations.length!==3||new Set(preview.allocations.map(row=>row.sleeve)).size!==3||
  !preview.allocations.every(row=>allocationIds.has(row.sleeve)&&finite(row.rawHistoricalPeak)&&row.rawHistoricalPeak>0&&
   finite(row.adjustedOperationalReference)&&row.adjustedOperationalReference>0&&finite(row.currentEquity)&&finite(row.currentDrawdownPct)&&
   typeof row.pendingCompletedExit==='boolean'&&Number.isSafeInteger(row.appliedEpochCount)&&row.appliedEpochCount>=0))return false;
 for(const field of ['externalCapitalFlows','pnlCashEvents'])if(!records(review[field])||!review[field].every(row=>day(row.date)&&typeof row.kind==='string'&&finite(row.netCash)))return false;
 for(const field of ['matchedTrades','matchedTradeNetCashAdjustments'])if(!records(review[field])||!review[field].every(row=>
  day(row.date)&&typeof row.symbol==='string'&&/^[A-Z][A-Z0-9.-]{0,15}$/.test(row.symbol)&&['buy','sell'].includes(row.side)&&
  Number.isSafeInteger(row.quantity)&&row.quantity>0&&finite(row.cashAdjustment)))return false;
 const proposal=review.plannedSaleCorrection;
 return proposal==null||record(proposal)&&hexId(proposal.proposalId)&&records(proposal.rows)&&proposal.rows.length>0&&proposal.rows.every(row=>
  typeof row.symbol==='string'&&/^[A-Z][A-Z0-9.-]{0,15}$/.test(row.symbol)&&Number.isSafeInteger(row.shares)&&row.shares>0&&
  Number.isSafeInteger(row.remainingShares)&&row.remainingShares>=0&&finite(row.basisBefore)&&row.basisBefore>=0&&finite(row.basisAfter)&&row.basisAfter>=0&&
  shareAllocations(row.allocationsBefore)&&shareAllocations(row.allocationsAfter)&&
  row.allocationsBefore.reduce((sum,part)=>sum+part.shares,0)===row.shares&&row.allocationsAfter.reduce((sum,part)=>sum+part.shares,0)===row.shares);
}

// A read-only proposal has no account decision. Its distinct response boundary
// must not weaken the decision checks used by account reads and mutations.
export async function readC1BrokerCashReviewResponse(response,{expectedRevision}={}){
 const stage='broker-cash-review',message='The brokerage cash review response could not be verified. Review the retained statement again.';
 const data=await readC1ResponseBody(response,{stage,message});
 if(response.ok&&(!record(data)||!cashReviewShape(data.cashReview,expectedRevision)))
  throw c1RefreshResponseError(response,{message,stage,code:'ACCOUNT_RESPONSE_INVALID'});
 return data;
}

// Only this read-only review operation uses the request deadline. Confirmation
// and trade mutations keep their existing uncertain-response handling.
export async function requestC1BrokerCashReview(key,{statementText,expectedRevision},fetcher=fetch){
 let timer,expired=false,lastResponse=null;
 const deadline=new Promise((_,reject)=>{
  timer=setTimeout(()=>{expired=true;reject(c1RefreshResponseError(lastResponse,{stage:'broker-cash-review',code:'ACCOUNT_RESPONSE_TIMEOUT',
   message:'The read-only brokerage cash review timed out. Your statement is retained; try reviewing it again.'}));},90000);
 });
 const request=async()=>{
  const response=await fetcher('/api/c1-account',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
   body:JSON.stringify({operation:'review-broker-cash-history',statementText,expectedRevision}),cache:'no-store'});
  if(expired)return;
  lastResponse=response;
  const value=await readC1BrokerCashReviewResponse(response,{expectedRevision});
  if(!expired)return {response,value};
 };
 try{return await Promise.race([request(),deadline]);}
 finally{clearTimeout(timer);}
}
