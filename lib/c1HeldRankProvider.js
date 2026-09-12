import {createHash} from 'node:crypto';
import {normalizeHistoricalBars} from './fmpResearchBacktest';
import {compileC1HeldRankReview} from './c1HeldRankReview';
import {latestCompletedMarketSessionDay} from './marketSession';

export async function collectC1HeldRankReviews({baseline,sourceHash,symbols,now=new Date(),fetcher=fetch,apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY,report=details=>console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify(details))}={}){
 if(baseline?.date!==latestCompletedMarketSessionDay(now)||symbols.length>20)throw new Error('Current bounded holding review required');
 if(symbols.length&&!apiKey)throw new Error('Holding momentum data provider is not configured');
 const from=new Date(baseline.date+'T00:00:00Z');from.setUTCDate(from.getUTCDate()-400);
 const rows=[],unavailable=[],deadline=Date.now()+20000;
 // One request per existing outside holding. No research routes, alternate
 // providers, index recollection, retry loop or historical simulation.
 for(const symbol of symbols){
  let stage='request',providerStatus=null,receivedRows=null,normalizedRows=null;
  try{
   if(Date.now()>=deadline)throw new Error('Holding review time budget reached');
   const providerSymbol=({'BRK.B':'BRK-B','BF.B':'BF-B'}[symbol]||symbol);
   const query=new URLSearchParams({symbol:providerSymbol,from:from.toISOString().slice(0,10),to:baseline.date,apikey:apiKey});
   const response=await fetcher('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});
   providerStatus=Number.isInteger(response.status)?response.status:null;
   if(!response.ok)throw new Error('Holding history provider unavailable');
   stage='response';
   const body=await response.json(),raw=Array.isArray(body)?body:body?.historical;
   receivedRows=Array.isArray(raw)?raw.length:null;
   stage='identity';
   if(!Array.isArray(raw)||raw.some(b=>b.symbol&&![symbol,providerSymbol].includes(b.symbol))||new Set(raw.map(b=>b.date)).size!==raw.length||raw.some(b=>b.date>baseline.date))throw new Error('Holding history identity mismatch');
   const history=normalizeHistoricalBars(raw,{sourceAdjusted:true});
   normalizedRows=history.length;stage='compile';
   rows.push({...compileC1HeldRankReview({baseline,sourceHash,symbol,history,observedAt:now.toISOString()}),historyHash:createHash('sha256').update(JSON.stringify(history.slice(-253))).digest('hex'),provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted'});
  }catch(error){
   // Only allow-listed categories and aggregate counts reach logs. Never log
   // the symbol, credentials, account identity, prices, URLs or response body.
   const known={
    'Holding review time budget reached':'TIME_BUDGET',
    'Holding history provider unavailable':'PROVIDER_HTTP',
    'Holding history identity mismatch':'RESPONSE_IDENTITY',
    'Dated outside holding and source identity required':'SOURCE_IDENTITY',
    'Complete adjusted holding history required: row count':'HISTORY_ROW_COUNT',
    'Complete adjusted holding history required: latest session':'HISTORY_LATEST_SESSION',
    'Complete adjusted holding history required: invalid bar':'HISTORY_INVALID_BAR',
    'Complete adjusted holding history required: session gap':'HISTORY_SESSION_GAP',
    'Holding history differs from the accepted account close':'ACCEPTED_PRICE_MISMATCH',
    'Dated momentum reference inputs unavailable':'REFERENCE_INPUTS'
   };
   const code=(Object.hasOwn(known,error?.message)?known[error.message]:null)||(['TimeoutError','AbortError'].includes(error?.name)?'PROVIDER_TIMEOUT':stage==='compile'?'COMPILER_FAILURE':stage==='response'?'RESPONSE_DECODE':'PROVIDER_NETWORK');
   try{report({code,stage,providerStatus,receivedRows,normalizedRows});}catch{}
   unavailable.push({symbol,code,reason:'Current momentum history could not be verified against the saved account close.'});
  }
 }
 return {sourceSessionDate:baseline.date,sourceHash,rows,unavailable,observedAt:now.toISOString()};
}
