import {randomUUID} from 'node:crypto';

// Callers supply fixed public messages only. Never accept the caught exception,
// provider URL, request body, symbol list or credentials into this boundary.
export function sendPublicApiFailure(res,{status,code,stage,error,detail}){
 const requestId=randomUUID();
 res.setHeader('X-C1-Request-Id',requestId);
 try{console.warn('PUBLIC_API_FAILURE',JSON.stringify({requestId,status,code,stage}));}catch{}
 return res.status(status).json({error,detail});
}
