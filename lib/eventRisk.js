// lib/eventRisk.js
// Pre-trade event check plus cross-name material catalyst awareness.
import {easternMarketClock} from './marketSession';
import {createHash} from 'node:crypto';
import {C1_CURRENT_EVENT_EVIDENCE_CONTRACT,readC1CurrentEventEvidence} from './c1CurrentEventEvidence';
import {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';
function normalizeSymbol(value){return String(value||"").replace("-", ".").toUpperCase().trim();}
function isoDate(date){return easternMarketClock(date)?.key||date.toISOString().slice(0,10);}
function addDays(date,days){const next=new Date(date);next.setUTCDate(next.getUTCDate()+days);return next;}
function daysFromToday(dateText){const key=isoDate(new Date()),a=new Date(`${key}T00:00:00Z`),d=new Date(`${String(dateText).slice(0,10)}T00:00:00Z`);return Number.isNaN(d.getTime())?null:Math.round((d.getTime()-a.getTime())/86400000);}
const EVENT_CACHE_KEY='__screenerEventRiskCacheV2',EVENT_INFLIGHT_KEY='__screenerEventRiskInflightV2',EVENT_COOLDOWN_KEY='__screenerEventRiskCooldownV2';
function eventPolicy(url){if(url.includes('/news/'))return{fresh:5*60*1000,stale:2*60*60*1000};if(url.includes('earnings-calendar'))return{fresh:15*60*1000,stale:6*60*60*1000};if(url.includes('mergers-acquisitions'))return{fresh:60*60*1000,stale:24*60*60*1000};return{fresh:30*60*1000,stale:12*60*60*1000};}
function markFeed(data,status,fetchedAt){const copy=Array.isArray(data)?[...data]:data&&typeof data==='object'?{...data}:data;if(copy&&typeof copy==='object')Object.defineProperties(copy,{__screenerFeedStatus:{value:status,enumerable:false},__screenerFeedAsOf:{value:new Date(fetchedAt).toISOString(),enumerable:false}});return copy;}
async function fetchJsonDiagnosticTask(url,{fetcher=top5Fetch,deadlineMs=Infinity}={}){
 assertTop5Active();
 const cache=globalThis[EVENT_CACHE_KEY]||(globalThis[EVENT_CACHE_KEY]=new Map()),inflight=globalThis[EVENT_INFLIGHT_KEY]||(globalThis[EVENT_INFLIGHT_KEY]=new Map()),cooldown=globalThis[EVENT_COOLDOWN_KEY]||(globalThis[EVENT_COOLDOWN_KEY]=new Map()),key=String(url).replace(/([?&]apikey=)[^&]+/,'$1[redacted]'),policy=eventPolicy(url),now=Date.now(),prior=cache.get(key);
 if(prior&&now-prior.ts<policy.fresh){top5Count('events.fresh-hit');return markFeed(prior.data,'fresh-cache',prior.ts);}
 if(inflight.has(key))return inflight.get(key);
 if((cooldown.get(key)||0)>now){if(prior&&now-prior.ts<policy.stale)return markFeed(prior.data,'stale-verified',prior.ts);throw new Error('Event-risk feed is in a bounded retry cooldown.');}
 if(Date.now()>=deadlineMs)throw new Error('Event verification deadline exceeded');
 const request=(async()=>{try{const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadlineMs-Date.now())))});assertTop5Active();if(!response.ok)throw new Error(`Event-risk request failed: ${response.status}`);const data=await response.json(),ts=Date.now();assertTop5Active();cache.set(key,{ts,data});while(cache.size>24)cache.delete(cache.keys().next().value);cooldown.delete(key);return markFeed(data,'live',ts);}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();cooldown.set(key,Date.now()+30000);if(prior&&Date.now()-prior.ts<policy.stale)return markFeed(prior.data,'stale-verified',prior.ts);throw error;}finally{inflight.delete(key);}})();
 inflight.set(key,request);return request;
}
function asArray(value){return Array.isArray(value)?value:value&&typeof value==="object"?[value]:[];}
const KNOWN_DEALS={IRDM:{acquirer:"Rocket Lab",acquirerSymbol:"RKLB",target:"Iridium Communications",announcedDate:"2026-06-28",expectedCloseDate:"2027-06-30",expectedCloseLabel:"mid-2027",referenceValue:54,cashPerShare:27,stockReferenceValue:27,collarLow:67.50,collarHigh:112.50,lowExchangeRatio:.4000,highExchangeRatio:.2400,structure:"$27 cash plus RKLB shares; the stock exchange ratio adjusts inside the $67.50-$112.50 RKLB collar.",source:"Definitive merger agreement"}};
function knownDeal(symbol){return KNOWN_DEALS[normalizeSymbol(symbol)]||null;}
function baseRisk(symbol){const deal=knownDeal(symbol);return{symbol,status:deal?"Blocked":"Clear",label:deal?"Pre-Trade: M&A Event":"Pre-Trade Check: Passed",detail:deal?"This company is subject to a definitive acquisition agreement. Treat it as a deal/spread position rather than a normal standalone fresh-capital setup.":"No near-term earnings, target-company M&A, or material company-news event was found.",blockNewCapital:Boolean(deal),reduceConviction:false,earningsDate:null,daysToEarnings:null,mergerEvent:deal?{...deal}:null,materialCatalysts:[],materialNews:[],checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:Boolean(deal),newsCheckComplete:false,manualCheckRequired:false};}
const FACTOR_BELLWETHERS={"AI Capex & Data Center":["NVDA","AVGO"],"Semiconductor Cycle":["NVDA","AVGO"],"Hardware Cycle":["NVDA"],"AI Networking":["NVDA","AVGO"]};
const AI_CAPEX_EXPOSURE=new Set(["NVDA","AMD","AVGO","ARM","MU","SMCI","DELL","HPE","ANET","MRVL","COHR","DLR","NVT","VRT","ETN","FIX","EME","TER","GEV","PWR","WTS","ORCL"]);
const MACRO_PATTERNS=[
 {re:/\b(?:fed|fomc) interest rate decision\b|\bfederal funds rate\b/i,label:"Federal Reserve decision"},
 {re:/\bconsumer price index\b|\bcpi(?: m\/m| y\/y| index)?\b/i,label:"CPI inflation report"},
 {re:/\bpersonal consumption expenditures price index\b|\bpce price index\b/i,label:"PCE inflation report"},
 {re:/\bnon[- ]?farm payrolls?\b|\bemployment situation\b/i,label:"U.S. employment report"}
];
function isUsMacro(row={}){const country=String(row.country||row.region||row.currency||'').trim().toUpperCase();return ['US','USA','USD','UNITED STATES','UNITED STATES OF AMERICA'].includes(country);}
function isHighImpactMacro(row={}){const raw=String(row.impact||row.importance||row.priority||'').trim();if(!raw)return true;return /high|major|\b3\b/i.test(raw);}
const HARD_NEWS_PATTERNS=[
 {re:/\bfda\b.*(recall|early alert|safety|warning)|(?:recall|early alert|safety alert|warning letter).*\bfda\b/i,label:"FDA safety/recall event"},
 {re:/class i recall|serious injur|patient death|fatalit|clinical hold/i,label:"Serious product/clinical safety event"},
 {re:/guidance (?:cut|lowered|reduced|withdrawn)|cuts? (?:full[- ]year )?guidance|withdraws? guidance/i,label:"Guidance reduction"},
 {re:/accounting irregular|restatement|material weakness|auditor resign|fraud/i,label:"Accounting/governance event"},
 {re:/\bsec\b.*(?:investigat|subpoena)|\bdoj\b.*(?:investigat|subpoena)|criminal investig/i,label:"Regulatory/legal investigation"},
 {re:/bankruptcy|chapter 11|going concern/i,label:"Solvency event"}
];
const CAUTION_NEWS_PATTERNS=[
 {re:/product recall|voluntary recall|safety notice/i,label:"Product recall/safety notice"},
 {re:/data breach|cybersecurity incident|ransomware/i,label:"Cybersecurity incident"},
 {re:/lawsuit|litigation|antitrust/i,label:"Material legal development"},
 {re:/secondary offering|public offering|share offering|convertible notes/i,label:"Capital-raising/dilution event"}
];
function eventTiming(row={}){return String(row.time||row.timing||row.when||row.reportTime||row.releaseTime||"").trim();}
function addCatalyst(map,symbol,catalyst){const current=map.get(symbol);if(!current)return;const prior=Array.isArray(current.materialCatalysts)?current.materialCatalysts:[];if(prior.some(x=>x.label===catalyst.label&&x.date===catalyst.date))return;map.set(symbol,{...current,materialCatalysts:[...prior,catalyst]});}
function factorWeights(position={}){return position.factorWeights&&typeof position.factorWeights==="object"?position.factorWeights:{};}
function newsText(row={}){return `${row.title||row.headline||''} ${row.text||row.content||row.summary||''}`.replace(/\s+/g,' ').trim();}
function newsDate(row={}){return String(row.publishedDate||row.date||row.datetime||'').slice(0,10);}
function newsUrl(row={}){return String(row.url||row.link||'');}
function applyNewsRisk(map,row={}){
 const symbol=normalizeSymbol(row.symbol);if(!map.has(symbol))return;
 const text=newsText(row);if(!text)return;
 const hard=HARD_NEWS_PATTERNS.find(x=>x.re.test(text)),caution=!hard&&CAUTION_NEWS_PATTERNS.find(x=>x.re.test(text));if(!hard&&!caution)return;
 const current=map.get(symbol),date=newsDate(row),item={type:'Company News',date,label:(hard||caution).label,title:String(row.title||row.headline||'Material company news').slice(0,240),url:newsUrl(row),material:true,severity:hard?'high':'elevated'};
 const prior=Array.isArray(current.materialNews)?current.materialNews:[];if(prior.some(x=>x.title===item.title&&x.date===item.date))return;
 const detail=hard?`${item.label} detected in recent company news. Do not initiate or add capital until the event is reviewed and the market impact is understood.`:`${item.label} detected in recent company news. Reduce conviction and review the event before using full size.`;
 map.set(symbol,{...current,status:hard?'Blocked':current.status==='Blocked'?'Blocked':'Caution',label:hard?`Pre-Trade: ${item.label}`:current.label==='Pre-Trade Check: Passed'?`Pre-Trade: ${item.label}`:current.label,detail:hard?detail:current.blockNewCapital?current.detail:detail,blockNewCapital:Boolean(current.blockNewCapital||hard),reduceConviction:Boolean(current.reduceConviction||caution),material:true,requiresReview:true,materialNews:[...prior,item],materialCatalysts:[...(current.materialCatalysts||[]),item]});
}
export async function fetchMaterialCatalystMap(positions=[]){assertTop5Active();const apiKey=process.env.FMP_API_KEY,map=new Map(),today=new Date(),from=isoDate(today),to=isoDate(addDays(today,2)),clean=(positions||[]).map(p=>({symbol:normalizeSymbol(p.symbol||p.ticker),factorWeights:factorWeights(p)})).filter(p=>p.symbol);for(const p of clean)map.set(p.symbol,[]);if(!apiKey||!clean.length)return map;let earnings=[];try{earnings=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));assertTop5Active();}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();}for(const p of clean){const relevant=[];for(const[factor,weightRaw]of Object.entries(p.factorWeights||{})){const weight=Number(weightRaw)||0;if(weight<.50)continue;const leaders=FACTOR_BELLWETHERS[factor]||[];for(const row of earnings){const leader=normalizeSymbol(row.symbol);if(!leaders.includes(leader)||leader===p.symbol)continue;const days=daysFromToday(row.date);if(days===null||days<0||days>1)continue;relevant.push({type:"Bellwether Earnings",symbol:leader,factor,factorWeight:weight,date:String(row.date).slice(0,10),days,timing:eventTiming(row),label:`${leader} earnings${days===0?" today":" tomorrow"}`,detail:`${leader} is a high-impact bellwether for ${factor}. Its results/guidance can materially change the factor read for ${p.symbol}.`,material:true});}}map.set(p.symbol,relevant);}return map;}
const CURRENT_CACHE_KEY='__screenerCurrentEventEvidenceV1';
const feedSpecs={EARNINGS:{endpoint:'earnings-calendar',limit:4000,ttl:15*60*1000,stale:6*60*60*1000},MERGERS:{endpoint:'mergers-acquisitions-latest',limit:1000,ttl:60*60*1000,stale:24*60*60*1000},NEWS:{endpoint:'news/stock',limit:500,ttl:5*60*1000,stale:2*60*60*1000}};
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
// Calendar/M&A feeds are global: numeric-leading foreign listing symbols are
// valid provider rows even though C1's requested entry symbols are U.S. names.
const symbolShape=value=>typeof value==='string'&&/^[A-Z0-9][A-Z0-9.^-]{0,31}$/i.test(value);
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function validFeedRow(kind,row,from,to,symbols){
 if(!row||typeof row!=='object'||Array.isArray(row))return false;
 if(kind==='EARNINGS')return symbolShape(row.symbol)&&validDay(row.date);
 if(kind==='MERGERS')return validDay(row.transactionDate)&&Object.hasOwn(row,'targetedSymbol')&&(row.targetedSymbol===null||symbolShape(row.targetedSymbol));
 return symbolShape(row.symbol)&&symbols.has(normalizeSymbol(row.symbol))&&validDay(newsDate(row))&&Boolean(newsText(row));
}
function contradictoryEarnings(rows){
 const identities=new Map();
 for(const row of rows){const period=row.periodEnding||row.fiscalYear&&row.fiscalPeriod&&String(row.fiscalYear)+':'+String(row.fiscalPeriod);if(!period)continue;
  const key=row.symbol+':'+period,prior=identities.get(key);if(prior&&prior!==row.date)return true;identities.set(key,row.date);}
 return false;
}
async function readCurrentFeed(kind,params,options,symbols){
 const spec=feedSpecs[kind],receipt={kind,endpoint:spec.endpoint,fetchedAt:null,expiresAt:null,complete:false,reason:'UNAVAILABLE'},rows=[],pages=new Set(),seenRows=new Set(),newsVersions=new Map();
 const finish=reason=>({rows,receipt:{...receipt,complete:reason==='OK',reason}});
 for(let page=0;page<(kind==='EARNINGS'?1:10);page++){
  if(Date.now()>=options.deadlineMs)return finish('DEADLINE_EXCEEDED');
  let body;
  try{const query=new URLSearchParams({...params,...(kind==='EARNINGS'?{}:{page:String(page),limit:String(spec.limit)}),apikey:options.apiKey});body=await fetchJson('https://financialmodelingprep.com/stable/'+spec.endpoint+'?'+query,options);assertTop5Active();}
  catch(error){if(isTop5Deadline(error))throw error;return finish(Date.now()>=options.deadlineMs?'DEADLINE_EXCEEDED':'PROVIDER_UNAVAILABLE');}
  const fetched=Date.parse(body?.__screenerFeedAsOf),until=fetched+spec.ttl;
  if(Number.isFinite(fetched)){
   if(!receipt.fetchedAt||fetched<Date.parse(receipt.fetchedAt))receipt.fetchedAt=new Date(fetched).toISOString();
   if(!receipt.expiresAt||until<Date.parse(receipt.expiresAt))receipt.expiresAt=new Date(until).toISOString();
  }
  if(!Array.isArray(body))return finish('MALFORMED_RESPONSE');
  if(!Number.isFinite(fetched)||fetched>Date.now()||until<=Date.now()||!['live','fresh-cache'].includes(body.__screenerFeedStatus))return finish('STALE_RESPONSE');
  if(body.some(row=>!validFeedRow(kind,row,params.from,params.to,symbols)))return finish('MALFORMED_RESPONSE');
  // Nullable target symbols are a legitimate FMP schema, not proof that a
  // requested issuer is absent. Neither the acquirer nor a name guess resolves it.
  if(kind==='MERGERS'&&body.some(row=>row.targetedSymbol===null))return finish('TARGET_IDENTITY_UNAVAILABLE');
  if(kind!=='MERGERS'&&body.some(row=>{const day=kind==='NEWS'?newsDate(row):row.date;return day<params.from||day>params.to;})){
   if(kind==='EARNINGS')rows.push(...body.filter(row=>row.date>=params.from&&row.date<=params.to));
   return finish('OUT_OF_RANGE');
  }
  const signature=fingerprint(body.map(row=>fingerprint(row)).sort());
  if(body.length&&pages.has(signature))return finish('REPEATED_PAGE');
  if(page&&body.some(row=>seenRows.has(fingerprint(row))))return finish('PAGINATION_OVERLAP');
  for(const row of body){
   seenRows.add(fingerprint(row));
   if(kind==='NEWS'){
    const key=normalizeSymbol(row.symbol)+':'+String(row.publishedDate||row.date||row.datetime)+':'+String(row.url||row.link||row.title||row.headline||'');
    const version=newsText(row),prior=newsVersions.get(key);if(prior&&prior!==version)return finish('CONTRADICTORY_RESPONSE');newsVersions.set(key,version);
   }
  }
  pages.add(signature);rows.push(...body);
  if(kind==='EARNINGS'){if(contradictoryEarnings(rows))return finish('CONTRADICTORY_RESPONSE');return finish(body.length>=spec.limit?'TRUNCATED_RESPONSE':'OK');}
  if(body.length<spec.limit)return finish('OK');
 }
 return finish('PAGINATION_LIMIT');
}
async function readCurrentEarnings(params,options,symbols){
 const initial=await readCurrentFeed('EARNINGS',params,options,symbols);
 if(initial.receipt.complete||!['TRUNCATED_RESPONSE','OUT_OF_RANGE'].includes(initial.receipt.reason))return initial;
 // FMP's full calendar can hit its provider cap. Partition the identical
 // policy window into dated queries; never infer coverage from missing rows.
 const days=[];for(let day=params.from;day<=params.to;){days.push(day);const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);day=next.toISOString().slice(0,10);}
 const results=new Array(days.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(3,days.length)},async()=>{while(cursor<days.length){const index=cursor++;results[index]=await readCurrentFeed('EARNINGS',{...params,from:days[index],to:days[index]},options,symbols);}}));
 const rows=results.flatMap(result=>result.rows),failed=results.find(result=>!result.receipt.complete),sources=results.map(result=>result.receipt);
 const earliest=field=>sources.every(source=>Number.isFinite(Date.parse(source[field])))?new Date(Math.min(...sources.map(source=>Date.parse(source[field])))).toISOString():null;
 const contradictsInitial=initial.rows.some(row=>symbols.has(normalizeSymbol(row.symbol))&&!rows.some(current=>current.symbol===row.symbol&&current.date===row.date));
 const reason=failed?'DAILY_'+failed.receipt.reason:contradictsInitial||contradictoryEarnings(rows)?'CONTRADICTORY_RESPONSE':'OK';
 return {rows,receipt:{kind:'EARNINGS',endpoint:'earnings-calendar',fetchedAt:earliest('fetchedAt'),expiresAt:earliest('expiresAt'),complete:reason==='OK',reason}};
}
function retainVerification(map,now){
 const cache=globalThis[CURRENT_CACHE_KEY]||(globalThis[CURRENT_CACHE_KEY]=new Map());
 for(const [symbol,saved]of cache)if(saved.retainUntil<=now)cache.delete(symbol);
 for(const [symbol,risk]of map){
  const evidence=risk.eventVerification,prior=cache.get(symbol);
  if(readC1CurrentEventEvidence(risk,new Date(now))!=='UNVERIFIED'){
   const snapshot=JSON.parse(JSON.stringify(evidence));delete snapshot.lastVerified;
   const retainUntil=Math.min(...snapshot.sources.map(source=>Date.parse(source.fetchedAt)+feedSpecs[source.kind].stale));
   cache.delete(symbol);cache.set(symbol,{retainUntil,evidence:snapshot});
  }else if(prior)evidence.lastVerified=JSON.parse(JSON.stringify(prior.evidence));
 }
 while(cache.size>512)cache.delete(cache.keys().next().value);
}
async function fetchEventRiskMapDiagnosticTask(symbols=[],{apiKey=process.env.FMP_API_KEY,fetcher=top5Fetch,deadlineMs=Date.now()+30000}={}){
 assertTop5Active();
 const clean=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],map=new Map(clean.map(symbol=>[symbol,baseRisk(symbol)]));if(!clean.length)return map;
 const started=new Date(),from=isoDate(addDays(started,-2)),to=isoDate(addDays(started,7)),options={apiKey,fetcher,deadlineMs},wanted=new Set(clean);
 let feeds;
 if(apiKey){
  // Required coverage uses canonical calendar dates. Optional report-time
  // enrichment can rewrite dates after provider filtering and invalidate a day.
  feeds=await Promise.all([readCurrentEarnings({from,to},options,wanted),readCurrentFeed('MERGERS',{},options,wanted),readCurrentFeed('NEWS',{symbols:clean.map(s=>s.replace('.','-')).sort().join(','),from,to:isoDate(started)},options,wanted)]);
 }else feeds=Object.entries(feedSpecs).map(([kind,spec])=>({rows:[],receipt:{kind,endpoint:spec.endpoint,fetchedAt:null,expiresAt:null,complete:false,reason:'PROVIDER_NOT_CONFIGURED'}}));
 const [earnings,mergers,news]=feeds,day=isoDate(started),daysFrom=date=>Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(day+'T00:00:00Z'))/86400000);
 // Preserve the existing definitions, aggregating severity instead of allowing
 // a later caution row to erase an already observed critical earnings event.
 for(const row of earnings.rows){const symbol=normalizeSymbol(row.symbol);if(!map.has(symbol))continue;const days=daysFrom(row.date);if(days< -2||days>7)continue;
  const current=map.get(symbol),critical=days>=-1&&days<=2,blocked=Boolean(current.blockNewCapital||critical),label=days===0?'Earnings Today':days===-1?'Earnings Just Reported':days>0?`Earnings in ${days} day${days===1?'':'s'}`:'Recent Earnings';
  if(current.blockNewCapital&&!critical)continue;
  map.set(symbol,{...current,status:blocked?'Blocked':'Caution',label:`Pre-Trade: ${label}`,detail:blocked?'Do not initiate new capital until the market has digested the earnings event.':'Near-term earnings risk lowers conviction. A normal partial Buy can remain valid, but a full-size Strong Buy should be reduced until the event passes.',blockNewCapital:blocked,reduceConviction:!blocked,earningsDate:row.date,daysToEarnings:days});
 }
 for(const row of mergers.rows){const target=normalizeSymbol(row.targetedSymbol);if(!map.has(target))continue;const current=map.get(target),known=knownDeal(target);map.set(target,{...current,status:'Blocked',label:'Pre-Trade: M&A Event',detail:'This company appears as an acquisition target. Treat it as an event/deal trade rather than a normal fresh-capital setup.',blockNewCapital:true,reduceConviction:false,mergerEvent:known?{...known}:{acquirer:row.companyName||row.symbol||'Acquirer',target:row.targetedCompanyName||target,transactionDate:row.transactionDate||null}});}
 for(const row of news.rows)applyNewsRisk(map,row);
 // Bellwether and macro observations remain informational, not required feeds.
 for(const row of earnings.rows){const leader=normalizeSymbol(row.symbol),days=daysFrom(row.date);if(!['NVDA','AVGO'].includes(leader)||days<0||days>1)continue;for(const target of clean)if(target!==leader&&AI_CAPEX_EXPOSURE.has(target))addCatalyst(map,target,{type:'Bellwether Earnings',symbol:leader,factor:'AI Capex & Data Center',date:row.date,days,timing:eventTiming(row),label:`${leader} earnings${days===0?' today':' tomorrow'}`,detail:`${leader} is a high-impact bellwether for AI infrastructure demand. Its results and guidance can materially change the factor read for ${target}.`,material:true});}
 if(apiKey&&Date.now()<deadlineMs)try{const econ=asArray(await fetchJson(`https://financialmodelingprep.com/stable/economic-calendar?from=${day}&to=${isoDate(addDays(started,1))}&apikey=${apiKey}`,options));assertTop5Active();for(const row of econ){if(!isUsMacro(row)||!isHighImpactMacro(row))continue;const match=MACRO_PATTERNS.find(x=>x.re.test(String(row.event||row.name||row.title||''))),days=daysFrom(String(row.date||'').slice(0,10));if(!match||days<0||days>1||!Number.isFinite(days))continue;for(const target of clean)addCatalyst(map,target,{type:'Macro',date:String(row.date).slice(0,10),days,timing:eventTiming(row),label:`${match.label}${days===0?' today':' tomorrow'}`,detail:`Scheduled ${match.label} can materially change market risk appetite; separate that factor move from stock-specific evidence.`,material:true});}}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();}
 const now=Date.now(),observedAt=new Date(now).toISOString();
 const sources=feeds.map(feed=>({...feed.receipt,...(feed.receipt.complete&&Date.parse(feed.receipt.expiresAt)<=now?{complete:false,reason:'EXPIRED_DURING_VERIFICATION'}:{})}));
 const complete=sources.every(source=>source.complete),expiration=sources.every(source=>Number.isFinite(Date.parse(source.expiresAt)))?new Date(Math.min(...sources.map(source=>Date.parse(source.expiresAt)))).toISOString():null;
 for(const symbol of clean){const current=map.get(symbol),state=complete?(current.blockNewCapital?'VERIFIED_BLOCKED':'VERIFIED_CLEAR'):'UNVERIFIED';
  const risk={...current,...(!complete&&!current.blockNewCapital?{status:'Manual',label:'Pre-Trade: Manual Check Required',detail:'Automated event-risk verification was incomplete. Do not deploy new capital until earnings, M&A, and major-news risk is manually verified.'}:{}),
   blockNewCapital:!complete||current.blockNewCapital,checkComplete:complete,earningsCheckComplete:sources[0].complete,mergerCheckComplete:sources[1].complete,newsCheckComplete:sources[2].complete,manualCheckRequired:!complete,eventRiskVerified:complete,
   eventVerification:{contract:C1_CURRENT_EVENT_EVIDENCE_CONTRACT,state,observedAt,expiresAt:expiration,provider:'FMP',sources:sources.map(source=>({...source})),reasons:sources.filter(source=>!source.complete).map(source=>source.kind+'_'+source.reason)}};
  if(readC1CurrentEventEvidence(risk,new Date(now))==='UNVERIFIED'){risk.eventRiskVerified=false;risk.eventVerification.state='UNVERIFIED';risk.blockNewCapital=true;risk.checkComplete=false;}
  map.set(symbol,risk);
 }
 retainVerification(map,now);return map;
}

export function applyEventRiskGate(stock={},eventRisk=null){const risk=eventRisk||{status:"Manual",label:"Pre-Trade: Manual Check Required",detail:"Event-risk data was unavailable. Do not deploy new capital until earnings, M&A, and major-news risk is manually verified.",blockNewCapital:true,reduceConviction:false,checkComplete:false,manualCheckRequired:true,materialCatalysts:[]},rec=stock.recommendation&&typeof stock.recommendation==="object"?stock.recommendation:{},current=String(rec.label||stock.action||"Avoid");let action=current;if(risk.blockNewCapital&&["Strong Buy","Buy"].includes(current))action="Watch";else if(risk.reduceConviction&&current==="Strong Buy")action="Buy";const downgraded=action!==current;let decisionWhy=rec.decisionWhy||rec.actionSummary||"";if(risk.mergerEvent)decisionWhy=`${risk.detail} New capital is blocked because standalone upside is no longer the correct decision framework.`;else if(risk.blockNewCapital&&downgraded)decisionWhy=`${risk.detail} Keep the setup on Watch until the event clears or verification is completed.`;else if(risk.reduceConviction&&downgraded)decisionWhy=`${risk.detail} Use partial size only until the event passes.`;else if(risk.manualCheckRequired&&["Strong Buy","Buy"].includes(current))decisionWhy=`${decisionWhy||"Actionable candidate."} Manual event verification is required before execution.`;return{...stock,action,eventRisk:risk,preTradeCheck:risk,materialCatalysts:risk.materialCatalysts||[],recommendation:{...rec,label:action,displayLabel:action,recommendation:action,tradeAction:action,decisionTiming:["Strong Buy","Buy"].includes(action)?"Now":"Wait for Trigger",positionSize:action==="Strong Buy"?"Full":action==="Buy"?"Partial":"None",decisionWhy,actionSummary:decisionWhy,blockedBuyNow:risk.blockNewCapital&&downgraded,blockedReason:risk.blockNewCapital?risk.detail:"",eventRisk:risk,preTradeCheck:risk}};}

export function fetchEventRiskMap(...args){return top5Phase('events.map',()=>fetchEventRiskMapDiagnosticTask(...args),{count:args[0]?.length||0});}

function fetchJson(...args){return top5Phase('events.endpoint',()=>fetchJsonDiagnosticTask(...args),{});}
