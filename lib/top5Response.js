import {c1RefreshResponseError} from './c1RefreshResponse';

function top5Failure(response){
 const reason=[408,504].includes(Number(response?.status))?'Broad screen update timed out.':'Broad screen update is temporarily unavailable.';
 return reason+' Existing portfolio analysis remains available; new capital is paused until refresh succeeds.';
}

// Public server errors share the existing controlled client fallback wording.
// Accept only a timeout boolean: no provider Error/message/body can be copied.
export function buildTop5UnavailableResponse(timeout=false){
 const timedOut=timeout===true;
 return {error:'Trade screen temporarily unavailable.',detail:top5Failure({status:timedOut?504:503}),
  retryable:true,...(timedOut?{code:'TOP5_TIMEOUT'}:{})};
}

export function parseTop5Response(body,response={ok:true,status:200}){
 let data;
 try{data=JSON.parse(body);}catch{throw c1RefreshResponseError(response,{message:top5Failure(response),stage:'screen-response',code:'SCREEN_RESPONSE_JSON_INVALID'});}
 if(!data||typeof data!=='object'||Array.isArray(data))throw c1RefreshResponseError(response,{message:top5Failure(response),stage:'screen-response',code:'SCREEN_RESPONSE_INVALID'});
 if(!response.ok){
  const message=data.detail||data.error;
  throw c1RefreshResponseError(response,{message:typeof message==='string'&&message.trim()?message:top5Failure(response),stage:'screen-response',code:'SCREEN_HTTP_FAILED'});
 }
 if(!Array.isArray(data.stocks)||data.stocks.some(row=>!row||typeof row!=='object'||Array.isArray(row))||!data.meta||typeof data.meta!=='object'||Array.isArray(data.meta))throw c1RefreshResponseError(response,{message:top5Failure(response),stage:'screen-response',code:'SCREEN_RESPONSE_INVALID'});
 return data;
}

export async function readTop5Response(response){
 let body;
 try{body=await response.text();}catch{throw c1RefreshResponseError(response,{message:top5Failure(response),stage:'screen-response',code:'SCREEN_RESPONSE_INTERRUPTED'});}
 return parseTop5Response(body,response);
}
