import {normalizeHistoricalBars} from './fmpResearchBacktest';
import {latestCompletedMarketSessionDay} from './marketSession';

const cash=new Set(['CASH','SWVXX','VMFXX','SPAXX','FDRXX','MMF']);
const providerSymbol=s=>({'BRK.B':'BRK-B','BF.B':'BF-B'}[s]||s);
export function missingC1HoldingPrices(portfolio,baseline){
 if(!Array.isArray(portfolio)||portfolio.length>100)throw new Error('Valid current portfolio required');
 const prices=new Map((baseline?.prices||[]).map(p=>[p.symbol,p]));
 const symbols=[];
 for(const p of portfolio){
  if(p.role!=='Swing'||cash.has(p.symbol)||p.symbol==='MSTR'||Number(p.shares)===0)continue;
  if(!/^[A-Z][A-Z0-9.-]{0,15}$/.test(p.symbol)||!Number.isFinite(Number(p.shares))||Number(p.shares)<0)throw new Error('Invalid held security');
  const row=prices.get(p.symbol);
  if(row?.adjusted!==true||!Number.isFinite(row.close)||row.close<=0)symbols.push(p.symbol);
 }
 return [...new Set(symbols)].sort();
}

// Account valuation coverage is separate from index membership and signal
// eligibility. Never mutate the accepted index book with these observations.
export async function collectC1HoldingCoverage({portfolio,baseline,now=new Date(),fetcher=fetch,
 apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY}={}){
 if(baseline?.date!==latestCompletedMarketSessionDay(now))throw new Error('Current completed session required for holding valuations');
 const symbols=missingC1HoldingPrices(portfolio,baseline);
 if(symbols.length>20)throw new Error('Holding valuation request exceeds the bounded collection limit');
 if(symbols.length&&!apiKey)throw new Error('Market data provider is not configured');
 const deadline=Date.now()+20000,rows=[];let cursor=0;
 const workers=Array.from({length:Math.min(3,symbols.length)},async()=>{
  while(cursor<symbols.length){
   const symbol=symbols[cursor++];
   const params=new URLSearchParams({symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date,apikey:apiKey});
   try{
    const response=await fetcher('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+params,
     {cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});
    if(!response.ok)throw new Error('provider');
    const body=await response.json(),raw=Array.isArray(body)?body:body?.historical;
    if(!Array.isArray(raw)||raw.length!==1||raw[0].date!==baseline.date)throw new Error('date');
    if(raw[0].symbol&&![symbol,providerSymbol(symbol)].includes(raw[0].symbol))throw new Error('symbol');
    const bars=normalizeHistoricalBars(raw,{sourceAdjusted:true}),bar=bars.find(b=>b.date===baseline.date);
    if(!bar||bar.adjusted!==true||!['open','high','low','close'].every(k=>Number.isFinite(bar[k])&&bar[k]>0)||
      bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))throw new Error('bar');
    rows.push({symbol,status:'verified',date:baseline.date,price:{...bar,symbol},
     inDecisionUniverse:baseline.universeSymbols?.includes(symbol)===true,
     source:{provider:'FMP',endpoint:'historical-price-eod/dividend-adjusted',observedAt:new Date().toISOString()}});
   }catch{
    // Do not expose credential-bearing request URLs or provider response bodies.
    rows.push({symbol,status:'unavailable',date:baseline.date,inDecisionUniverse:baseline.universeSymbols?.includes(symbol)===true});
   }
  }
 });
 await Promise.all(workers);
 return {contract:'c1-held-price-coverage-v1',sourceSessionDate:baseline.date,rows:rows.sort((a,b)=>a.symbol.localeCompare(b.symbol)),
  executable:false,indexMembershipChanged:false};
}
