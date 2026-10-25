import {createHash,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

// Production-only, staged owner enrollment. Observation never changes access.
// No credential, fingerprint, account path, request body or holdings enter logs.
export function rejectUnauthorizedC1Owner(res,{key,environment,surface}){
 if(environment!=='production')return false;
 const mode=process.env.C1_OWNER_ACCESS_MODE||'off';
 if(mode==='off')return false;
 const fingerprint=process.env.C1_OWNER_ACCOUNT_SHA256;
 let code;
 if(!['observe','enforce'].includes(mode))code='OWNER_ACCESS_MODE_INVALID';
 else if(!fingerprint)code='OWNER_IDENTITY_UNCONFIGURED';
 else if(!/^[a-f0-9]{64}$/.test(fingerprint))code='OWNER_IDENTITY_CONFIG_INVALID';
 else{
  const actual=createHash('sha256').update(key).digest();
  code=timingSafeEqual(actual,Buffer.from(fingerprint,'hex'))?'OWNER_IDENTITY_MATCH':'OWNER_IDENTITY_MISMATCH';
 }
 try{console.info('C1_OWNER_ACCESS',JSON.stringify({mode:['observe','enforce'].includes(mode)?mode:'invalid',surface:surface==='account'?'account':'portfolio',code}));}catch{}
 if(mode!=='enforce'||code==='OWNER_IDENTITY_MATCH')return false;
 if(code==='OWNER_IDENTITY_MISMATCH')res.status(403).json({error:'This saved account is not authorized for this deployment.',code:'OWNER_ACCOUNT_NOT_AUTHORIZED'});
 else res.status(503).json({error:'Owner access verification is unavailable.',code:'OWNER_ACCESS_UNAVAILABLE'});
 return true;
}
