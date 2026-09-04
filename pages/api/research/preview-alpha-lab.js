import {finalizePointInTimeNasdaqDistinctAlphaDevelopment} from "../../../lib/fmpResearchBacktest";
export const config={maxDuration:800};
export default async function handler(req,res){
 if(process.env.VERCEL_ENV==="production")return res.status(404).json({error:"Not found"});
 res.setHeader("Cache-Control","no-store");
 try{return res.status(200).json({report:await finalizePointInTimeNasdaqDistinctAlphaDevelopment()});}
 catch(error){return res.status(500).json({status:"failed",productionChanged:false,error:String(error?.message||error).slice(0,500)});}
}
