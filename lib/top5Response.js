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
 try{data=JSON.parse(body);}catch{throw new Error(top5Failure(response));}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error(top5Failure(response));
 if(!response.ok){
  const message=data.detail||data.error;
  throw new Error(typeof message==='string'&&message.trim()?message:top5Failure(response));
 }
 if(!Array.isArray(data.stocks)||!data.meta||typeof data.meta!=='object'||Array.isArray(data.meta))throw new Error(top5Failure(response));
 return data;
}

export async function readTop5Response(response){
 let body;
 try{body=await response.text();}catch{throw new Error(top5Failure(response));}
 return parseTop5Response(body,response);
}
