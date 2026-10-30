import {latestCompletedMarketSessionDay,marketExecutionState,marketSessionCloseMinutes} from './marketSession';

const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000;
export const C1_READINESS_CONTRACT='c1-operational-readiness-v1';
export const C1_READINESS_MAX_AGE_MS=20*60*1000;
const codes=new Set(['CHECK_PASSED','WAITING_REGULAR_SESSION','WAITING_OPEN_QUOTES','CLOSING_UPDATE_PENDING',
 'SOURCE_NOT_CURRENT','INDEX_UPDATE_FAILED','EVENT_VERIFICATION_INCOMPLETE','QUOTE_VERIFICATION_INCOMPLETE',
 'PROBE_UNAVAILABLE','PROBE_SCOPE_INVALID','NOT_OBSERVED','RECEIPT_INVALID','CHECK_EXPIRED','DEPLOYMENT_NOT_CHECKED']);

// Operational evidence only. None of these statuses supplies a rating, order,
// quantity, current quote or permission to deploy capital.
export function buildC1OperationalReadiness({sourceSessionDate,observedAt=new Date(),commit='local',
 expectedCount=0,quoteCount=0,regularQuoteCount=0,eventCount=0,eventBlockedCount=0,
 indexFailed=false,probeFailed=false,scopeInvalid=false}={}){
 const now=new Date(observedAt),state=marketExecutionState(now),required=latestCompletedMarketSessionDay(now);
 const valid=[expectedCount,quoteCount,regularQuoteCount,eventCount,eventBlockedCount].every(count)&&expectedCount>0&&
  quoteCount<=expectedCount&&regularQuoteCount<=quoteCount&&eventCount<=expectedCount&&eventBlockedCount<=eventCount;
 let code='CHECK_PASSED',severity='healthy';
 if(!date(sourceSessionDate)||sourceSessionDate!==required){
  const clock=state.clock,closing=clock?.isSessionDay&&clock.minutes>=marketSessionCloseMinutes(clock.key)&&
   clock.minutes<marketSessionCloseMinutes(clock.key)+35;
  code=closing?'CLOSING_UPDATE_PENDING':indexFailed?'INDEX_UPDATE_FAILED':'SOURCE_NOT_CURRENT';severity=closing?'waiting':'error';
 }else if(scopeInvalid||!valid){code='PROBE_SCOPE_INVALID';severity='error';}
 else if(indexFailed){code='INDEX_UPDATE_FAILED';severity='error';}
 else if(probeFailed){code='PROBE_UNAVAILABLE';severity='error';}
 else if(eventCount!==expectedCount){code='EVENT_VERIFICATION_INCOMPLETE';severity='error';}
 else if(quoteCount!==expectedCount){code='QUOTE_VERIFICATION_INCOMPLETE';severity='error';}
 else if(!state.isOpen){code='WAITING_REGULAR_SESSION';severity='waiting';}
 else if(regularQuoteCount!==expectedCount){
  const opening=state.clock.minutes<573;
  code=opening?'WAITING_OPEN_QUOTES':'QUOTE_VERIFICATION_INCOMPLETE';severity=opening?'waiting':'error';
 }
 return {contract:C1_READINESS_CONTRACT,observedAt:now.toISOString(),commit:/^[a-f0-9]{7,40}$/.test(commit)?commit:'local',
  sourceSessionDate:date(sourceSessionDate)?sourceSessionDate:null,expectedSessionDate:required,
  marketPhase:state.phase,code,severity,expectedCount,quoteCount,regularQuoteCount,eventCount,eventBlockedCount,
  executable:false,privateAccountParity:'NOT_VERIFIED',browserAcceptance:'NOT_VERIFIED'};
}

export function c1OperationalReadinessView(receipt,{now=new Date(),commit='local'}={}){
 const required=latestCompletedMarketSessionDay(now),state=marketExecutionState(now);
 const empty=code=>({contract:C1_READINESS_CONTRACT,code,severity:'unknown',observedAt:null,
  expectedSessionDate:required,sourceSessionDate:null,marketPhase:state.phase,executable:false,
  privateAccountParity:'NOT_VERIFIED',browserAcceptance:'NOT_VERIFIED'});
 if(!receipt)return empty('NOT_OBSERVED');
 const at=Date.parse(receipt.observedAt),age=now.getTime()-at;
 if(receipt.contract!==C1_READINESS_CONTRACT||!codes.has(receipt.code)||
  !['healthy','waiting','error'].includes(receipt.severity)||receipt.executable!==false||
  !Number.isFinite(at)||age<0||!date(receipt.expectedSessionDate)||
  ![receipt.expectedCount,receipt.quoteCount,receipt.regularQuoteCount,receipt.eventCount,receipt.eventBlockedCount].every(count))return empty('RECEIPT_INVALID');
 if(receipt.quoteCount>receipt.expectedCount||receipt.regularQuoteCount>receipt.quoteCount||
  receipt.eventCount>receipt.expectedCount||receipt.eventBlockedCount>receipt.eventCount)return empty('RECEIPT_INVALID');
 const expectedSeverity=receipt.code==='CHECK_PASSED'?'healthy':
  ['WAITING_REGULAR_SESSION','WAITING_OPEN_QUOTES','CLOSING_UPDATE_PENDING'].includes(receipt.code)?'waiting':'error';
 if(receipt.severity!==expectedSeverity)return empty('RECEIPT_INVALID');
 if(receipt.commit!==commit)return empty('DEPLOYMENT_NOT_CHECKED');
 if(receipt.expectedSessionDate!==required){
  const clock=state.clock;
  if(clock?.isSessionDay&&clock.minutes>=marketSessionCloseMinutes(clock.key)&&clock.minutes<marketSessionCloseMinutes(clock.key)+35)
   return {...empty('CLOSING_UPDATE_PENDING'),severity:'waiting',observedAt:receipt.observedAt,sourceSessionDate:receipt.sourceSessionDate};
 }
 if(age>C1_READINESS_MAX_AGE_MS||receipt.expectedSessionDate!==required||receipt.marketPhase!==state.phase){
  if(state.isOpen&&state.clock.minutes<573)return {...empty('WAITING_OPEN_QUOTES'),severity:'waiting'};
  return empty('CHECK_EXPIRED');
 }
 if(['CHECK_PASSED','WAITING_REGULAR_SESSION','WAITING_OPEN_QUOTES'].includes(receipt.code)&&
  (receipt.sourceSessionDate!==required||receipt.expectedCount===0||receipt.eventCount!==receipt.expectedCount||receipt.quoteCount!==receipt.expectedCount))return empty('RECEIPT_INVALID');
 // Copy only this fixed aggregate schema, never arbitrary stored fields.
 return {contract:C1_READINESS_CONTRACT,code:receipt.code,severity:receipt.severity,observedAt:receipt.observedAt,
  expectedSessionDate:required,sourceSessionDate:receipt.sourceSessionDate,marketPhase:state.phase,
  expectedCount:receipt.expectedCount,quoteCount:receipt.quoteCount,regularQuoteCount:receipt.regularQuoteCount,
  eventCount:receipt.eventCount,eventBlockedCount:receipt.eventBlockedCount,ageMs:age,
  executable:false,privateAccountParity:'NOT_VERIFIED',browserAcceptance:'NOT_VERIFIED'};
}
