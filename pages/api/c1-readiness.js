import {readC1Readiness} from '../../lib/c1ReadinessStore';
import {c1OperationalReadinessView} from '../../lib/c1OperationalReadiness';

// Aggregate service diagnostics, without owner identifiers, portfolio details,
// orders, keys or provider bodies. GET performs private diagnostic reads only.
export function createC1ReadinessHandler({read=readC1Readiness,clock=()=>new Date(),commit=process.env.VERCEL_GIT_COMMIT_SHA||'local'}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  let receipt=null;try{receipt=await read();}catch{}
  const report=c1OperationalReadinessView(receipt,{now:clock(),commit});
  return res.status(200).json(report);
 };
}
export default createC1ReadinessHandler();
