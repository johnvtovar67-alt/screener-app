import { getV11ProductionSnapshot } from '../../../lib/v11ProductionSnapshot';
export const config={maxDuration:60};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  try {
    const snapshot=await getV11ProductionSnapshot({refreshIfStale:true});
    const record=snapshot.forwardAccounting||{status:'unavailable',error:snapshot.error||'Forward accounting has not initialized'};
    return res.status(record.status==='paper-only'?200:202).json({...record,
      decisionSnapshot:snapshot.decisionSnapshot||null,
      scope:'Paper model only; not brokerage holdings or trade recommendations',
      executable:false,eligibleForLiveCapital:false,eligibleForAlphaClaim:false});
  }catch(error){return res.status(503).json({status:'unavailable',executable:false,error:String(error?.message||error).slice(0,240)});}
}
