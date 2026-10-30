import {createHmac,timingSafeEqual} from 'node:crypto';

const codes=new Set(['ACCOUNT_RESPONSE_INCOMPLETE','ACCOUNT_SESSION_NOT_CURRENT','HOLDING_VERIFICATION_INCOMPLETE',
 'MARKET_CLOSED','ACCOUNT_ANALYSIS_ONLY','ACCOUNT_ACTIVITY_PENDING','OPENING_VERIFICATION_INCOMPLETE',
 'OPENING_REVIEW_NOT_CURRENT','CHECKED_BUY_ORDERS_PRESENT','CHECKED_ZERO_UNCONDITIONAL_BUY_ORDERS']);
const operations=new Set(['ANALYSIS','OPENING_REVIEW']);
const valid=row=>row?.contract==='c1-journey-observation-v1'&&codes.has(row.code)&&operations.has(row.operation)&&
 /^[a-f0-9-]{36}$/.test(row.requestId||'')&&/^[a-f0-9]{7,40}$/.test(row.commit||'')&&
 (row.sourceSessionDate===null||/^\d{4}-\d{2}-\d{2}$/.test(row.sourceSessionDate||''))&&
 Number.isFinite(Date.parse(row.observedAt))&&Number.isFinite(Date.parse(row.expiresAt));
// A short-lived diagnostic attestation, never an account/session credential.
// No holdings, cash, orders, prices, sync key or owner identifier is encoded.
export function signC1JourneyObservation(status,{now=new Date(),secret=process.env.CRON_SECRET}={}){
 if(!secret)return null;
 const row={contract:'c1-journey-observation-v1',operation:status.operation,code:status.code,
  requestId:status.requestId,commit:status.commit,sourceSessionDate:status.sourceSessionDate,
  observedAt:now.toISOString(),expiresAt:new Date(now.getTime()+300000).toISOString()};
 if(!valid(row))return null;
 const body=Buffer.from(JSON.stringify(row)).toString('base64url'),signature=createHmac('sha256',secret).update(body).digest('base64url');
 return 'c1jo1.'+body+'.'+signature;
}
export function verifyC1JourneyObservation(token,{now=new Date(),secret=process.env.CRON_SECRET,commit=process.env.VERCEL_GIT_COMMIT_SHA}={}){
 if(!secret||typeof token!=='string'||token.length>1800)return null;
 const parts=token.split('.');if(parts.length!==3||parts[0]!=='c1jo1'||!/^[-_A-Za-z0-9]+$/.test(parts[1])||!/^[-_A-Za-z0-9]{43}$/.test(parts[2]))return null;
 const expected=createHmac('sha256',secret).update(parts[1]).digest(),received=Buffer.from(parts[2],'base64url');
 if(received.length!==expected.length||!timingSafeEqual(received,expected))return null;
 let row;try{row=JSON.parse(Buffer.from(parts[1],'base64url').toString());}catch{return null;}
 if(!valid(row)||Object.keys(row).sort().join(',')!=='code,commit,contract,expiresAt,observedAt,operation,requestId,sourceSessionDate'||
  row.commit!==commit||Date.parse(row.observedAt)>now.getTime()||Date.parse(row.expiresAt)<=now.getTime()||
  Date.parse(row.expiresAt)-Date.parse(row.observedAt)!==300000)return null;
 return row;
}
