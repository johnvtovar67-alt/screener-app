import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';
import {fetchEventRiskMap} from './eventRisk';
import {normalizeHistoricalBars} from './fmpPriceBars';
import {c1LiveMembers,C1_LIVE_UNIVERSES} from './c1LiveInput';
import {easternMarketClock,marketExecutionState,marketSessionDistance} from './marketSession';

// Explicit share-class aliases; do not rewrite arbitrary security identifiers.
const canonicalSymbol=symbol=>({'BF-B':'BF.B','BRK-B':'BRK.B'}[symbol]||symbol);
const providerSymbol=symbol=>({'BF.B':'BF-B','BRK.B':'BRK-B'}[symbol]||symbol);

// Opening plans use observed opens, never the current quote mislabeled as open.
// Rechecking the previous adjusted close detects changes to the adopted basis.
export function validateC1OpeningObservations({baseline,symbols,membersBefore,membersAfter,observations,allowPriceRevisionReview=false,now=new Date()}={}){
 const clock=easternMarketClock(now);
 if(!marketExecutionState(now).isOpen||marketSessionDistance(baseline.date,clock.key)!==1)throw new Error('A current regular-session opening and prior completed account session are required');
 membersBefore=membersBefore.map(p=>({...p,symbol:canonicalSymbol(p.symbol)}));
 membersAfter=membersAfter.map(p=>({...p,symbol:canonicalSymbol(p.symbol)}));
 if([membersBefore,membersAfter].some(rows=>new Set(rows.map(p=>p.symbol)).size!==rows.length))throw new Error('Duplicate index membership after share-class normalization');
 const membership=rows=>rows.map(p=>p.symbol).sort().join('|');
 const previousMembers=new Set(baseline.universeSymbols),currentMembers=new Set(membersBefore.map(p=>p.symbol));
 if(membership(membersBefore)!==[...previousMembers].sort().join('|')){
  const added=[...currentMembers].filter(s=>!previousMembers.has(s)),removed=[...previousMembers].filter(s=>!currentMembers.has(s));
  // An addition alone does not invalidate the accepted prior-close account universe.
  // Keep its original membership for planning; new members are not admitted here.
  // Both independently collected provider membership snapshots must still agree.
  if(removed.length)throw new Error(`Index membership changed: added ${added.join(',')||'none'}; removed ${removed.join(',')||'none'}`);
 }
 if(membership(membersBefore)!==membership(membersAfter))throw new Error('Index membership changed during opening quote collection');
 // Display names and response ordering do not define index or sector identity.
 const beforeSectors=new Map(membersBefore.map(p=>[p.symbol,p.sector]));
 const sectorChanges=membersAfter.filter(p=>beforeSectors.get(p.symbol)!==p.sector).map(p=>p.symbol);
 if(sectorChanges.length)throw new Error('Index sector classification changed during collection: '+sectorChanges.join(','));
 const prior=new Map(baseline.prices.map(p=>[p.symbol,p]));
 const sectors=new Map([...(baseline.positionSignals||[]),...(baseline.signals||[])].map(p=>[p.symbol,p.sector]));
 const prices=[],priceBasisRevisions=[];
 for(const symbol of symbols){
  const entry=observations[symbol],quote=entry?.quote,anchor=entry?.anchor,stamp=new Date(Number(quote?.timestamp)*1000),qclock=easternMarketClock(stamp);
  if(canonicalSymbol(quote?.symbol)!==symbol||qclock?.key!==clock.key||qclock.minutes<570||stamp>now||now-stamp>120000||!Number.isFinite(quote.open)||quote.open<=0||!Number.isFinite(quote.price)||quote.price<=0)throw new Error('Fresh opening quote missing for '+symbol);
  if(anchor?.date!==baseline.date||!Number.isFinite(anchor.close)||anchor.close<=0||!prior.has(symbol))throw new Error('Adjusted account price basis changed for '+symbol);
  if(Math.abs(anchor.close-prior.get(symbol).close)>1e-8*Math.max(1,anchor.close)){
   if(!allowPriceRevisionReview)throw new Error('Adjusted account price basis changed for '+symbol+' ('+baseline.date+': saved '+prior.get(symbol).close+', provider '+anchor.close+')');
   if(!['open','high','low','close'].every(k=>Number.isFinite(anchor[k])&&anchor[k]>0&&anchor[k]===entry.anchorRecheck?.[k])||entry.anchorRecheck.date!==baseline.date)throw new Error('Adjusted price revision is not stable for '+symbol);
   priceBasisRevisions.push({symbol,savedClose:prior.get(symbol).close,observedBar:anchor,rechecked:true});
  }
  const member=membersAfter.find(p=>p.symbol===symbol);
  if(member&&sectors.has(symbol)&&sectors.get(symbol)!==member.sector)throw new Error('Account sector classification changed for '+symbol);
  prices.push({symbol,open:quote.open,adjusted:true,observedPrice:quote.price,observedAt:stamp.toISOString()});
 }
 return {date:clock.key,universeSymbols:[...baseline.universeSymbols],corporateActions:[],prices,priceBasisRevisions,
  receipt:{provider:'FMP',observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:priceBasisRevisions.length===0,quoteMaximumAgeSeconds:120,symbolConvention:'explicit-BF.B-BRK.B-share-class-aliases'}};
}
export async function collectC1AccountOpening({baseline,symbols,now=new Date(),allowPriceRevisionReview=false,resolveSymbols,fetcher=fetch,apiKey=fmpApiKey({allowLegacy:true}),collectEvents=fetchEventRiskMap}={}){
 if(!apiKey)throw new Error('Market data provider is not configured');
 if(!marketExecutionState(now).isOpen)return null;
 const started=Date.now(),deadline=started+30000;
 async function request(endpoint,params={}){
  const query=new URLSearchParams({...params,apikey:apiKey});let r,body;
  try{r=await fetchFmpResponse('https://financialmodelingprep.com/stable/'+endpoint+'?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))},{fetcher});if(!r.ok)throw new Error();body=await readFmpJsonResponse(r);}catch{throw new Error('Opening market-data request failed');}
  const rows=Array.isArray(body)?body:body?.historical;if(!Array.isArray(rows)||!rows.length)throw new Error('Opening market-data response was empty');return rows;
 }
 const membersBefore=c1LiveMembers('sp500',await request(C1_LIVE_UNIVERSES.sp500.endpoint)),membersBeforeAt=Date.now();
 const observations={},required=[...new Set(symbols)];
 // FMP provides one authoritative multi-symbol quote endpoint. Fetch the
 // current opening observations together instead of serializing one quote
 // request per candidate. Prior-close anchors remain independently adjusted.
 const quoteRows=await request('batch-quote',{symbols:required.map(providerSymbol).join(',')}),quotesAt=Date.now();
 const quotes=new Map(quoteRows.map(row=>[canonicalSymbol(row.symbol),row]));
 async function collectAnchors(targets){
 let cursor=0;const workers=[];
 for(let worker=0;worker<Math.min(8,targets.length);worker++)workers.push((async()=>{while(cursor<targets.length){const symbol=targets[cursor++];
  const bars=normalizeHistoricalBars(await request('historical-price-eod/dividend-adjusted',{symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date}),{sourceAdjusted:true});
  observations[symbol]={quote:quotes.get(symbol),anchor:bars.find(b=>b.date===baseline.date)};
  const anchor=observations[symbol].anchor,saved=baseline.prices.find(p=>p.symbol===symbol)?.close;
  if(allowPriceRevisionReview&&Number.isFinite(anchor?.close)&&Number.isFinite(saved)&&Math.abs(anchor.close-saved)>1e-8*Math.max(1,anchor.close)){
   const repeat=normalizeHistoricalBars(await request('historical-price-eod/dividend-adjusted',{symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date}),{sourceAdjusted:true});
   observations[symbol].anchorRecheck=repeat.find(b=>b.date===baseline.date);
  }
 }})());
 const results=await Promise.allSettled(workers);const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;
 }
 await collectAnchors(required);
 if(resolveSymbols){
  // Each new symbol is acquired once. At most two bounded expansions allow
  // the comparison's added names to contribute their own corrected anchors.
  // A changing requirement set never produces partial purchase authority.
  for(let pass=0;pass<3;pass++){
   const priceBasisRevisions=required.flatMap(symbol=>{
    const entry=observations[symbol],anchor=entry?.anchor,saved=baseline.prices.find(p=>p.symbol===symbol)?.close;
    if(!Number.isFinite(anchor?.close)||!Number.isFinite(saved)||Math.abs(anchor.close-saved)<=1e-8*Math.max(1,anchor.close))return [];
    if(!allowPriceRevisionReview||!['open','high','low','close'].every(k=>Number.isFinite(anchor[k])&&anchor[k]>0&&anchor[k]===entry.anchorRecheck?.[k])||entry.anchorRecheck?.date!==baseline.date)throw new Error('Adjusted price revision is not stable for '+symbol);
    return [{symbol,savedClose:saved,observedBar:anchor,rechecked:true}];
   });
   const requested=resolveSymbols({priceBasisRevisions});
   if(!Array.isArray(requested)||requested.some(symbol=>typeof symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)))throw new Error('Invalid opening quote requirements');
   const missing=[...new Set(requested)].filter(symbol=>!required.includes(symbol));
   if(!missing.length)break;
   if(pass===2)throw new Error('Opening quote requirements did not stabilize');
   const extra=await request('batch-quote',{symbols:missing.map(providerSymbol).join(',')});
   for(const row of extra){const symbol=canonicalSymbol(row.symbol);if(missing.includes(symbol))quotes.set(symbol,row);}
   required.push(...missing);
   await collectAnchors(missing);
  }
 }

 const anchorsAt=Date.now(),membersAfter=c1LiveMembers('sp500',await request(C1_LIVE_UNIVERSES.sp500.endpoint)),finished=Date.now();
 console.info('C1_OPENING_TIMING',JSON.stringify({symbols:required.length,membershipBeforeMs:membersBeforeAt-started,batchQuoteMs:quotesAt-membersBeforeAt,anchorsMs:anchorsAt-quotesAt,membershipAfterMs:finished-anchorsAt,totalMs:finished-started}));
 const opening=validateC1OpeningObservations({baseline,symbols:required,membersBefore,membersAfter,observations,allowPriceRevisionReview,now:new Date()});
 // Current event evidence is request-local. It never changes accepted prices,
 // the native queue, recorded fills or the opening observation's quote list.
 try{
  const risks=await collectEvents(required.filter(symbol=>!['SPY','QQQ'].includes(symbol)),{apiKey,fetcher,deadlineMs:Date.now()+30000});
  opening.currentEventEvidence=risks instanceof Map?[...risks.values()]:[];
 }catch{opening.currentEventEvidence=[];}
 return {...validateC1OpeningObservations({baseline,symbols:required,membersBefore,membersAfter,observations,allowPriceRevisionReview,now:new Date()}),currentEventEvidence:opening.currentEventEvidence};
}
