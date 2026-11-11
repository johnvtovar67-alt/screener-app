import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';
import {fetchEventRiskMap} from './eventRisk';
import {normalizeHistoricalBars} from './fmpPriceBars';
import {c1LiveMembers,C1_LIVE_UNIVERSES} from './c1LiveInput';
import {easternMarketClock,marketExecutionState,marketSessionDistance} from './marketSession';
import {createHash} from 'node:crypto';
import {c1FullUniverseSelectionApplies} from './c1QualifiedSelection';
import {collectC1OpeningAnchorScan} from './c1UniverseVerification';
import {createC1OpeningAnchorStore} from './c1OpeningAnchorStore';

// Explicit share-class aliases; do not rewrite arbitrary security identifiers.
const canonicalSymbol=symbol=>({'BF-B':'BF.B','BRK-B':'BRK.B'}[symbol]||symbol);
const providerSymbol=symbol=>({'BF.B':'BF-B','BRK.B':'BRK-B'}[symbol]||symbol);

// Opening plans use observed opens, never the current quote mislabeled as open.
// Rechecking the previous adjusted close detects changes to the adopted basis.
export function validateC1OpeningObservations({baseline,symbols,membersBefore,membersAfter,observations,allowPriceRevisionReview=false,essentialSymbols,now=new Date()}={}){
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
 const prices=[],priceBasisRevisions=[],candidateDisqualifications=[];
 const optionalCandidates=c1FullUniverseSelectionApplies(baseline.date)&&Array.isArray(essentialSymbols),essential=new Set(essentialSymbols||symbols);
 for(const symbol of symbols){
  const entry=observations[symbol],quote=entry?.quote,anchor=entry?.anchor,stamp=new Date(Number(quote?.timestamp)*1000),qclock=easternMarketClock(stamp);
  if(canonicalSymbol(quote?.symbol)!==symbol||qclock?.key!==clock.key||qclock.minutes<570||stamp>now||now-stamp>120000||!Number.isFinite(quote.open)||quote.open<=0||!Number.isFinite(quote.price)||quote.price<=0){
   if(optionalCandidates&&!essential.has(symbol)){candidateDisqualifications.push({symbol,reason:'current-quote-unverified'});continue;}
   throw new Error('Fresh opening quote missing for '+symbol);
  }
  if(anchor?.date!==baseline.date||!Number.isFinite(anchor.close)||anchor.close<=0||!prior.has(symbol)){
   if(optionalCandidates&&!essential.has(symbol)){candidateDisqualifications.push({symbol,reason:'adjusted-history-unverified'});continue;}
   throw new Error('Adjusted account price basis changed for '+symbol);
  }
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
  ...(optionalCandidates?{candidateDisqualifications}:{}),
  receipt:{provider:'FMP',observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:priceBasisRevisions.length===0,quoteMaximumAgeSeconds:120,symbolConvention:'explicit-BF.B-BRK.B-share-class-aliases'}};
}
export async function collectC1AccountOpening({baseline,symbols,now=new Date(),allowPriceRevisionReview=false,resolveSymbols,essentialSymbols,anchorStore,fetcher=fetch,apiKey=fmpApiKey({allowLegacy:true}),collectEvents=fetchEventRiskMap}={}){
 if(!apiKey)throw new Error('Market data provider is not configured');
 if(!marketExecutionState(now).isOpen)return null;
 const started=Date.now(),deadline=started+30000;
 async function request(endpoint,params={},options={}){
  const query=new URLSearchParams({...params,apikey:apiKey});let r,body;
  try{r=await fetchFmpResponse('https://financialmodelingprep.com/stable/'+endpoint+'?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))},{fetcher});if(!r.ok)throw new Error();body=await readFmpJsonResponse(r);}catch{throw new Error('Opening market-data request failed');}
  const rows=Array.isArray(body)?body:body?.historical;if(!Array.isArray(rows)||(!rows.length&&!options.allowEmpty))throw new Error('Opening market-data response was empty');return rows;
 }
 const membersBefore=c1LiveMembers('sp500',await request(C1_LIVE_UNIVERSES.sp500.endpoint)),membersBeforeAt=Date.now();
 const observations={},required=[...new Set([...symbols,...(essentialSymbols||[])])],fullUniverse=c1FullUniverseSelectionApplies(baseline.date);
 const essentials=Array.isArray(essentialSymbols)?essentialSymbols:required;
 const anchorIdentity=createHash('sha256').update(JSON.stringify([baseline.date,baseline.prices,Boolean(allowPriceRevisionReview)])).digest('hex');
 const sharedAnchors=fullUniverse?(anchorStore===undefined&&['production','preview'].includes(process.env.VERCEL_ENV)?createC1OpeningAnchorStore():anchorStore):null;
 const anchorContext=()=>({sourceIdentity:anchorIdentity,sourceSessionDate:baseline.date,allowedSymbols:baseline.prices.map(row=>row.symbol),now:new Date()});
 async function quoteBatch(targets){
  if(!fullUniverse)return request('batch-quote',{symbols:targets.map(providerSymbol).join(',')});
  const batches=[];for(let i=0;i<targets.length;i+=100)batches.push(targets.slice(i,i+100));
  const rows=[];for(let i=0;i<batches.length;i+=3){
   const part=await Promise.all(batches.slice(i,i+3).map(batch=>request('batch-quote',{symbols:batch.map(providerSymbol).join(',')},{allowEmpty:true})));
   rows.push(...part.flat());
  }return rows;
 }
 // FMP provides one authoritative multi-symbol quote endpoint. Fetch the
 // current opening observations together instead of serializing one quote
 // request per candidate. Prior-close anchors remain independently adjusted.
 const quoteRows=await quoteBatch(required),quotesAt=Date.now();
 const quotes=new Map(quoteRows.map(row=>[canonicalSymbol(row.symbol),row]));
 async function collectAnchor(symbol){
  const bars=normalizeHistoricalBars(await request('historical-price-eod/dividend-adjusted',{symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date}),{sourceAdjusted:true});
  const result={anchor:bars.find(b=>b.date===baseline.date)};
  const anchor=result.anchor,saved=baseline.prices.find(p=>p.symbol===symbol)?.close;
  if(allowPriceRevisionReview&&Number.isFinite(anchor?.close)&&Number.isFinite(saved)&&Math.abs(anchor.close-saved)>1e-8*Math.max(1,anchor.close)){
   const repeat=normalizeHistoricalBars(await request('historical-price-eod/dividend-adjusted',{symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date}),{sourceAdjusted:true});
   result.anchorRecheck=repeat.find(b=>b.date===baseline.date);
  }
  return result;
 }
 async function collectAnchors(targets){
  if(fullUniverse){
   const retained=sharedAnchors?await sharedAnchors.read(anchorContext()):null;
   const restoredCount=retained?.size||0;
   const restoredTargets=targets.filter(symbol=>retained?.has(symbol)).length;
   const cache=retained?new Map([[anchorIdentity,{anchors:retained,expiresAt:Date.now()+300000}]]):undefined;
   let collected=await collectC1OpeningAnchorScan({sourceIdentity:anchorIdentity,symbols:targets,cache,collect:async symbol=>{try{return await collectAnchor(symbol);}catch(error){if(!essentials.includes(symbol))return {unverified:true};throw error;}}});
   if(sharedAnchors&&collected.scan.completed>restoredTargets){
    const committed=await sharedAnchors.write({...anchorContext(),anchors:collected.anchors});
    const pending=targets.filter(symbol=>!committed.has(symbol));
    collected={anchors:new Map(targets.filter(symbol=>committed.has(symbol)).map(symbol=>[symbol,committed.get(symbol)])),
     scan:{...collected.scan,completed:targets.length-pending.length,remaining:pending.length,complete:pending.length===0,
      nextCursor:pending.length?targets.indexOf(pending[0]):null,status:pending.length?'incomplete':'complete'}};
   }
   console.info('C1_OPENING_SCAN',JSON.stringify({sourceSessionDate:baseline.date,total:collected.scan.total,completed:collected.scan.completed,
    remaining:collected.scan.remaining,complete:collected.scan.complete,shared:Boolean(sharedAnchors),restored:restoredCount,elapsedMs:Date.now()-started}));
   for(const [symbol,anchor]of collected.anchors)observations[symbol]={...anchor,quote:quotes.get(symbol)};
   if(!collected.scan.complete){const error=new Error('Full dated-universe opening scan is incomplete; refresh continues remaining candidates.');error.code='C1_SCAN_INCOMPLETE';error.scan={...collected.scan,sourceSessionDate:baseline.date};throw error;}
   return;
  }
  // Keep the original pre-activation await boundaries and worker ordering.
  // The prospective anchor helper adds one microtask; routing old recordings
  // through it would change their independently pinned provider lineage.
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
 // Fast anchor batches share one account review. Slow batches retain their
 // committed progress for read-only HTTP continuation. Admission uses the
 // observed batch cost; the original provider deadline remains authoritative.
 const collectWithinBudget=sharedAnchors?async targets=>{
  let completed=-1;
  for(;;){
   const batchStarted=Date.now();
   try{return await collectAnchors(targets);}
   catch(error){
    const scan=error?.scan,batchMs=Date.now()-batchStarted,count=scan?.completed;
    if(error?.code!=='C1_SCAN_INCOMPLETE'||scan.sourceIdentity!==anchorIdentity||scan.total!==targets.length||
     !Number.isSafeInteger(count)||count<=completed||count>=targets.length||
     deadline-Date.now()<=Math.max(10000,2*batchMs+1000))throw error;
    completed=count;
   }
  }
 }:collectAnchors;
 await collectWithinBudget(required);
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
   const extra=await quoteBatch(missing);
   for(const row of extra){const symbol=canonicalSymbol(row.symbol);if(missing.includes(symbol))quotes.set(symbol,row);}
   required.push(...missing);
   await collectWithinBudget(missing);
  }
 }

 const anchorsAt=Date.now(),membersAfter=c1LiveMembers('sp500',await request(C1_LIVE_UNIVERSES.sp500.endpoint)),finished=Date.now();
 console.info('C1_OPENING_TIMING',JSON.stringify({symbols:required.length,membershipBeforeMs:membersBeforeAt-started,batchQuoteMs:quotesAt-membersBeforeAt,anchorsMs:anchorsAt-quotesAt,membershipAfterMs:finished-anchorsAt,totalMs:finished-started}));
 const opening=validateC1OpeningObservations({baseline,symbols:required,membersBefore,membersAfter,observations,allowPriceRevisionReview,essentialSymbols:fullUniverse?essentials:undefined,now:new Date()});
 // Current event evidence is request-local. It never changes accepted prices,
 // the native queue, recorded fills or the opening observation's quote list.
 try{
  const risks=await collectEvents(required.filter(symbol=>!['SPY','QQQ'].includes(symbol)),{apiKey,fetcher,deadlineMs:Date.now()+30000});
  opening.currentEventEvidence=risks instanceof Map?[...risks.values()]:[];
 }catch{opening.currentEventEvidence=[];}
 return {...validateC1OpeningObservations({baseline,symbols:required,membersBefore,membersAfter,observations,allowPriceRevisionReview,essentialSymbols:fullUniverse?essentials:undefined,now:new Date()}),currentEventEvidence:opening.currentEventEvidence,...(fullUniverse?{scan:{contract:'c1-dated-universe-scan-v1',sourceIdentity:anchorIdentity,sourceSessionDate:baseline.date,total:required.length,completed:required.length,remaining:0,complete:true,nextCursor:null,status:'complete'}}:{})};
}
