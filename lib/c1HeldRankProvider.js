import {createHash} from 'node:crypto';
import {normalizeHistoricalBars} from './fmpResearchBacktest';
import {compileC1HeldRankReview} from './c1HeldRankReview';
import {latestCompletedMarketSessionDay} from './marketSession';

export async function collectC1HeldRankReviews({baseline,sourceHash,symbols,now=new Date(),fetcher=fetch,apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY}={}){
 if(baseline?.date!==latestCompletedMarketSessionDay(now)||symbols.length>20)throw new Error('Current bounded holding review required');
 if(symbols.length&&!apiKey)throw new Error('Holding momentum data provider is not configured');
 const from=new Date(baseline.date+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-400);
 const rows=[],unavailable=[];
 // One request per existing outside holding. No research routes, alternate
 // providers, index recollection, retry loop or historical simulation.
 for(const symbol of symbols){
  try{
   const providerSymbol=({'BRK.B':'BRK-B','BF.B':'BF-B'}[symbol]||symbol);
   const query=new URLSearchParams({symbol:providerSymbol,from:from.toISOString().slice(0,10),to:baseline.date,apikey:apiKey});
   const response=await fetcher('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+query,{cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw new Error('Holding history provider unavailable');
   const body=await response.json(),raw=Array.isArray(body)?body:body?.historical;
   if(!Array.isArray(raw)||raw.some(b=>b.symbol&&![symbol,providerSymbol].includes(b.symbol))||new Set(raw.map(b=>b.date)).size!==raw.length||raw.some(b=>b.date>baseline.date))throw new Error('Holding history identity mismatch');
   const history=normalizeHistoricalBars(raw,{sourceAdjusted:true});
   rows.push({...compileC1HeldRankReview({baseline,sourceHash,symbol,history,observedAt:now.toISOString()}),historyHash:createHash('sha256').update(JSON.stringify(history.slice(-253))).digest('hex'),provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted'});
  }catch(error){unavailable.push({symbol,reason:/* Never expose a provider URL or body. */ 'Current momentum history could not be verified against the saved account close.'});}
 }
 return {sourceSessionDate:baseline.date,sourceHash,rows,unavailable,observedAt:now.toISOString()};
}
