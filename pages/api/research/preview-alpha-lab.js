import {finalizePointInTimeNasdaqDistinctAlphaDevelopment,runPointInTimeNasdaqDistinctAlphaWorker} from "../../../lib/fmpResearchBacktest";
import {pointInTimeNasdaqDistinctAlphaControls,pointInTimeNasdaqDistinctAlphaDefinitions} from "../../../lib/nasdaqDistinctAlphaResearch";
export const config={maxDuration:800};
export default async function handler(req,res){
 if(process.env.VERCEL_ENV==="production")return res.status(404).json({error:"Not found"});
 res.setHeader("Cache-Control","no-store");
 try{
  const units=[...pointInTimeNasdaqDistinctAlphaDefinitions(),...pointInTimeNasdaqDistinctAlphaControls()];
  const workers=await Promise.all(units.map(({id})=>runPointInTimeNasdaqDistinctAlphaWorker({candidateId:id})));
  const report=await finalizePointInTimeNasdaqDistinctAlphaDevelopment();
  return res.status(200).json({workers:workers.length,report});
 }catch(error){return res.status(500).json({status:"failed",productionChanged:false,error:String(error?.message||error).slice(0,500)});}
}
