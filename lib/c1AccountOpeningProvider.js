import {normalizeHistoricalBars} from './fmpResearchBacktest';
import {c1LiveMembers,C1_LIVE_UNIVERSES} from './c1LiveInput';
import {easternMarketClock,marketExecutionState,marketSessionDistance} from './marketSession';

// Opening plans use observed opens, never the current quote mislabeled as open.
// Rechecking the previous adjusted close detects changes to the adopted basis.
export function validateC1OpeningObservations({baseline,symbols,membersBefore,membersAfter,observations,now=new Date()}={}){
 const clock=easternMarketClock(now);
 if(!marketExecutionState(now).isOpen||marketSessionDistance(baseline.date,clock.key)!==1)throw new Error('A current regular-session opening and prior completed account session are required');
 const membership=rows=>rows.map(p=>p.symbol).sort().join('|');
 const previousMembers=new Set(baseline.universeSymbols),currentMembers=new Set(membersBefore.map(p=>p.symbol));
 if(membership(membersBefore)!==[...previousMembers].sort().join('|')){
  const added=[...currentMembers].filter(s=>!previousMembers.has(s)),removed=[...previousMembers].filter(s=>!currentMembers.has(s));
  throw new Error(`Index membership changed: added ${added.join(',')||'none'}; removed ${removed.join(',')||'none'}`);
 }
 if(membership(membersBefore)!==membership(membersAfter))throw new Error('Index membership changed during opening quote collection');
 // Display names and response ordering do not define index or sector identity.
 const beforeSectors=new Map(membersBefore.map(p=>[p.symbol,p.sector]));
 const sectorChanges=membersAfter.filter(p=>beforeSectors.get(p.symbol)!==p.sector).map(p=>p.symbol);
 if(sectorChanges.length)throw new Error('Index sector classification changed during collection: '+sectorChanges.join(','));
 const prior=new Map(baseline.prices.map(p=>[p.symbol,p]));
 const sectors=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(p=>[p.symbol,p.sector]));
 const prices=[];
 for(const symbol of symbols){
  const entry=observations[symbol],quote=entry?.quote,anchor=entry?.anchor,stamp=new Date(Number(quote?.timestamp)*1000),qclock=easternMarketClock(stamp);
  if(quote?.symbol!==symbol||qclock?.key!==clock.key||qclock.minutes<570||stamp>now||now-stamp>120000||!Number.isFinite(quote.open)||quote.open<=0||!Number.isFinite(quote.price)||quote.price<=0)throw new Error('Fresh opening quote missing for '+symbol);
  if(anchor?.date!==baseline.date||!Number.isFinite(anchor.close)||Math.abs(anchor.close-prior.get(symbol)?.close)>1e-8*Math.max(1,anchor.close)||!prior.has(symbol))throw new Error('Adjusted account price basis changed for '+symbol);
  const member=membersAfter.find(p=>p.symbol===symbol);
  if(member&&sectors.has(symbol)&&sectors.get(symbol)!==member.sector)throw new Error('Account sector classification changed for '+symbol);
  prices.push({symbol,open:quote.open,adjusted:true,observedPrice:quote.price,observedAt:stamp.toISOString()});
 }
 return {date:clock.key,universeSymbols:[...baseline.universeSymbols],corporateActions:[],prices,
  receipt:{provider:'FMP',observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true,quoteMaximumAgeSeconds:120}};
}
export async function collectC1AccountOpening({baseline,symbols,now=new Date(),fetcher=fetch,apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY}={}){
 if(!apiKey)throw new Error('Market data provider is not configured');
 if(!marketExecutionState(now).isOpen)return null;
 const deadline=Date.now()+45000;
 async function request(endpoint,params={}){
  const query=new URLSearchParams({...params,apikey:apiKey});let r,body;
  try{r=await fetcher('https://financialmodelingprep.com/stable/'+endpoint+'?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});if(!r.ok)throw new Error();body=await r.json();}catch{throw new Error('Opening market-data request failed');}
  const rows=Array.isArray(body)?body:body?.historical;if(!Array.isArray(rows)||!rows.length)throw new Error('Opening market-data response was empty');return rows;
 }
 const membersBefore=c1LiveMembers('sp500',await request(C1_LIVE_UNIVERSES.sp500.endpoint));
 const observations={},required=[...new Set(symbols)],workers=[];let cursor=0;
 for(let worker=0;worker<3;worker++)workers.push((async()=>{while(cursor<required.length){const symbol=required[cursor++];
  const quotes=await request('quote',{symbol});
  const bars=normalizeHistoricalBars(await request('historical-price-eod/dividend-adjusted',{symbol,from:baseline.date,to:baseline.date}),{sourceAdjusted:true});
  observations[symbol]={quote:quotes.find(q=>q.symbol===symbol),anchor:bars.find(b=>b.date===baseline.date)};
 }})());
 const results=await Promise.allSettled(workers);const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 const membersAfter=c1LiveMembers('sp500',await request(C1_LIVE_UNIVERSES.sp500.endpoint));
 return validateC1OpeningObservations({baseline,symbols:required,membersBefore,membersAfter,observations,now:new Date()});
}
