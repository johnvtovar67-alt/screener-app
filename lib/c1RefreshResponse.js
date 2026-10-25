const stages=new Set(['account-read','account-refresh','conflict-recovery','opening-review','screen-response']);
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
export async function readC1AccountResponse(response,{stage='account-read'}={}){
 let data,timer;
 const message='The saved account response could not be verified. Reload the saved account before retrying any changes.';
 // Match the existing account-read budget for a body stalled after headers.
 // Expiry stops waiting only: it never aborts/repeats a possibly committed POST.
 try{data=await Promise.race([Promise.resolve().then(()=>response.json()),new Promise((_,reject)=>{
  timer=setTimeout(()=>{const error=new Error(message);error.name='C1AccountBodyTimeout';reject(error);},90000);
 })]);}
 catch(error){throw c1RefreshResponseError(response,{message,stage,code:error?.name==='C1AccountBodyTimeout'?'ACCOUNT_RESPONSE_TIMEOUT':error?.name==='SyntaxError'?'ACCOUNT_RESPONSE_JSON_INVALID':'ACCOUNT_RESPONSE_INTERRUPTED'});}
 finally{clearTimeout(timer);}
 if(response.ok&&(!record(data)||!decisionShape(data.decision)||(data.executionDecision!=null&&!decisionShape(data.executionDecision))))
  throw c1RefreshResponseError(response,{message,stage,code:'ACCOUNT_RESPONSE_INVALID'});
 return data;
}
