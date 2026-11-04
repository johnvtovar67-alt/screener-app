import {fetchFmpQuote} from '../../lib/fmpQuotes';
import {verifyC1Quote} from '../../lib/c1QuoteVerification';
import {sendPublicApiFailure} from '../../lib/publicApiFailure';

// Public market evidence only. No account, screen, model, or storage access.
export function createC1StopQuoteHandler({fetchQuote=fetchFmpQuote,clock=()=>new Date(),timeoutMs=9000}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Use GET for quote verification.'});}
  const symbol=typeof req.query?.symbol==='string'?req.query.symbol.trim().toUpperCase().replace('-','.'):'';
  if(!/^[A-Z][A-Z0-9]{0,9}(?:\.[A-Z0-9]{1,3})?$/.test(symbol))return res.status(400).json({error:'A valid stock symbol is required.'});
  let timer;
  try{
   const row=await Promise.race([
    fetchQuote(symbol,{forceRefresh:true,timeoutMs:8000}),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Quote deadline exceeded')),timeoutMs);})
   ]);
   const stock={...row,symbol:String(row?.symbol||'').toUpperCase().replace('-','.'),price:Number(row?.price),timestamp:Number(row?.timestamp)};
   if(stock.symbol!==symbol||!Number.isFinite(stock.price)||stock.price<=0)throw new Error('Unusable quote');
   const now=clock();
   stock.quoteVerification=verifyC1Quote(stock,now);
   return res.status(200).json({contract:'c1-stop-quote-v1',stock,checkedAt:now.toISOString()});
  }catch{
   return sendPublicApiFailure(res,{status:503,code:'STOP_QUOTE_UNAVAILABLE',stage:'stop-quote',error:'Stop quote unavailable.',detail:'A current quote could not be verified. Retry Verify stop now.'});
  }finally{clearTimeout(timer);}
 };
}
export default createC1StopQuoteHandler();
