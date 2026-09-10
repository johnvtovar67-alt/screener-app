import { getV11ProductionSnapshot } from '../../../lib/v11ProductionSnapshot';
import { compareC1Holdings } from '../../../lib/c1HoldingsComparison';
export const config = {maxDuration:60, api:{bodyParser:{sizeLimit:'100kb'}}};
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  // Validate before loading the model. Never persist or log submitted holdings.
  try { compareC1Holdings(req.body?.holdings,null); }
  catch(error){return res.status(400).json({error:error.message,executable:false,orders:[]});}
  try {
    const snapshot=await getV11ProductionSnapshot({refreshIfStale:true});
    return res.status(200).json(compareC1Holdings(req.body.holdings,snapshot.forwardAccounting));
  } catch(error) {
    return res.status(503).json({status:'unavailable',executable:false,orders:[],error:'Paper model unavailable'});
  }
}
