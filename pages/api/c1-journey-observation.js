import {verifyC1JourneyObservation} from '../../lib/c1JourneyObservation';

const seen=new Map();
export const config={api:{bodyParser:{sizeLimit:'4kb'}}};
export function createC1JourneyObservationHandler({verify=verifyC1JourneyObservation,clock=()=>new Date(),emit=(...args)=>console.info(...args)}={}){
 return function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  let origin;try{origin=new URL(req.headers.origin);}catch{return res.status(403).json({error:'Observation origin required'});}
  if(origin.host!==req.headers.host||!['https:','http:'].includes(origin.protocol))return res.status(403).json({error:'Observation origin mismatch'});
  const now=clock(),attestation=verify(req.body?.token,{now});
  if(!attestation||!['PUBLISHED','PAUSED'].includes(req.body?.outcome)||
   !Number.isSafeInteger(req.body?.generation)||req.body.generation<0||req.body.generation>1000000)return res.status(400).json({error:'Invalid observation'});
  const key=attestation.requestId;
  if((seen.get(key)||0)>now.getTime())return res.status(200).json({recorded:true});
  seen.set(key,Date.parse(attestation.expiresAt));for(const[k,until]of seen)if(until<=now.getTime()||seen.size>512)seen.delete(k);
  const report={contract:'c1-normal-journey-observation-v1',observedAt:now.toISOString(),serverObservedAt:attestation.observedAt,
   commit:attestation.commit,sourceSessionDate:attestation.sourceSessionDate,operation:attestation.operation,
   serverCode:attestation.code,browserReportedOutcome:req.body.outcome,generation:req.body.generation,
   executable:false,privateAccountParity:'NOT_VERIFIED',browserAcceptance:'REPORTED_NOT_CERTIFIED'};
  try{emit('C1_JOURNEY_OBSERVED',JSON.stringify(report));}catch{}
  return res.status(200).json({recorded:true});
 };
}
export default createC1JourneyObservationHandler();
