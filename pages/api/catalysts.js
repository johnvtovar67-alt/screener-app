import {fetchMaterialCatalystMap} from '../../lib/eventRisk';
import {factorWeightsFor} from '../../lib/portfolioGovernor';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const positions=Array.isArray(req.body?.positions)?req.body.positions:[];
    const normalized=positions.map(p=>({...p,factorWeights:factorWeightsFor(p)}));
    const map=await fetchMaterialCatalystMap(normalized);
    const catalysts=Object.fromEntries([...map.entries()]);
    return res.status(200).json({catalysts,checkedAt:new Date().toISOString()});
  }catch(error){return res.status(500).json({error:'Catalyst check failed',detail:error?.message||String(error)});}
}
