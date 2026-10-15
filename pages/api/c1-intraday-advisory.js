import {validateC1IntradaySymbols} from '../../lib/c1IntradayAdvisory';
import {fetchC1IntradayQuotes} from '../../lib/c1IntradayAdvisoryProvider';

// This route receives public symbols only. It reads no account or sync key and
// cannot save state, build an order, change rankings or collect historical bars.
export async function handleC1IntradayAdvisory(req,res,fetchQuotes=fetchC1IntradayQuotes){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'){
  res.setHeader('Allow','GET');return res.status(405).json({error:'Only a manual GET quote refresh is supported.'});
 }
 let symbols;
 try{
  if(typeof req.query?.symbols!=='string'||Object.keys(req.query||{}).some(key=>key!=='symbols'))throw new Error('Invalid symbol request.');
  symbols=validateC1IntradaySymbols(req.query.symbols);
 }catch{return res.status(400).json({error:'Request 1 to 32 valid comma-separated quote symbols.'});}
 try{return res.status(200).json(await fetchQuotes(symbols));}
 catch{return res.status(503).json({error:'Intraday quotes are unavailable; refresh later.'});}
}

export default function handler(req,res){return handleC1IntradayAdvisory(req,res);}
