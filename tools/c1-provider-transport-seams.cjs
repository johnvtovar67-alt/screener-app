// Exact inversions preserve all earlier production source/oracle pins.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const changes={
  "lib/fmpQuotes.js": {
    "hash": "d06e4be495f11892c1acf4b72db130eb9981dd42",
    "parts": [
      [
        "// retry storms when multiple app surfaces ask for the same symbol together.\nimport {toFmpSymbol as norm} from './fmpSymbols';\nimport {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nconst CACHE_KEY='__screenerFmpQuoteCacheV1';\nconst INFLIGHT_KEY='__screenerFmpQuoteInflightV1';\n",
        "// retry storms when multiple app surfaces ask for the same symbol together.\nimport {toFmpSymbol as norm} from './fmpSymbols';\nconst CACHE_KEY='__screenerFmpQuoteCacheV1';\nconst INFLIGHT_KEY='__screenerFmpQuoteInflightV1';\n"
      ],
      [
        "\nexport async function fetchFmpQuote(symbol,{timeoutMs=8000,forceRefresh=false}={}){\n  const apiKey=fmpApiKey();if(!apiKey)throw new Error('Missing FMP_API_KEY in environment variables.');\n  const clean=norm(symbol);if(!clean)throw new Error('Missing quote symbol.');\n  const{cache,inflight,cooldown,attempts}=stores(),now=Date.now(),cached=cache.get(clean);\n",
        "\nexport async function fetchFmpQuote(symbol,{timeoutMs=8000,forceRefresh=false}={}){\n  const apiKey=process.env.FMP_API_KEY;if(!apiKey)throw new Error('Missing FMP_API_KEY in environment variables.');\n  const clean=norm(symbol);if(!clean)throw new Error('Missing quote symbol.');\n  const{cache,inflight,cooldown,attempts}=stores(),now=Date.now(),cached=cache.get(clean);\n"
      ],
      [
        "  const request=(async()=>{\n    try{\n      const url=`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${apiKey}`,response=await fetchFmpResponse(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});\n      if(!response.ok)throw new Error(`FMP stable quote failed: ${response.status}`);\n      const body=await readFmpJsonResponse(response),row=Array.isArray(body)?body[0]:body;if(!usable(row,clean))throw new Error(`No matching usable stable quote returned for ${clean}.`);\n      const priorStamp=Number(cached?.row.timestamp),nextStamp=Number(row.timestamp);\n      const priorMs=priorStamp>1e12?priorStamp:priorStamp*1000,nextMs=nextStamp>1e12?nextStamp:nextStamp*1000;\n",
        "  const request=(async()=>{\n    try{\n      const url=`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${apiKey}`,response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(timeoutMs)});\n      if(!response.ok)throw new Error(`FMP stable quote failed: ${response.status}`);\n      const body=await response.json(),row=Array.isArray(body)?body[0]:body;if(!usable(row,clean))throw new Error(`No matching usable stable quote returned for ${clean}.`);\n      const priorStamp=Number(cached?.row.timestamp),nextStamp=Number(row.timestamp);\n      const priorMs=priorStamp>1e12?priorStamp:priorStamp*1000,nextMs=nextStamp>1e12?nextStamp:nextStamp*1000;\n"
      ]
    ]
  },
  "lib/fmpFundamentals.js": {
    "hash": "3999de8e1b6fa4225aa46858c9669f174c47f92a",
    "parts": [
      [
        "\nimport {put,list,get} from '@vercel/blob';\nimport {toFmpSymbol,fromFmpSymbol as normalizeSymbol} from './fmpSymbols';\nimport {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nimport {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';\n\n",
        "\nimport {put,list,get} from '@vercel/blob';\nimport {toFmpSymbol} from './fmpSymbols';\nimport {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';\n\n"
      ],
      [
        "const FUNDAMENTAL_STORE=\"fmp-fundamentals-cache-v1.json\";\n\nconst asArray=v=>Array.isArray(v)?v:v&&typeof v===\"object\"?[v]:[];\nconst num=(v,f=null)=>{if(v===null||v===undefined||v===\"\")return f;const n=Number(v);return Number.isFinite(n)?n:f;};\n",
        "const FUNDAMENTAL_STORE=\"fmp-fundamentals-cache-v1.json\";\n\nconst normalizeSymbol=s=>String(s||\"\").replace(\"-\", \".\").toUpperCase().trim();\nconst asArray=v=>Array.isArray(v)?v:v&&typeof v===\"object\"?[v]:[];\nconst num=(v,f=null)=>{if(v===null||v===undefined||v===\"\")return f;const n=Number(v);return Number.isFinite(n)?n:f;};\n"
      ],
      [
        "    let nonRetryableResponse=false;\n    try{\n      const r=await fetchFmpResponse(url,{signal:controller.signal},{fetcher:top5Fetch});assertTop5Active();\n      if(r.ok){const data=await readFmpJsonResponse(r);assertTop5Active();return data;}\n      const text=await r.text().catch(()=>\"\");\n      assertTop5Active();\n",
        "    let nonRetryableResponse=false;\n    try{\n      const r=await top5Fetch(url,{signal:controller.signal});assertTop5Active();\n      if(r.ok){const data=await r.json();assertTop5Active();return data;}\n      const text=await r.text().catch(()=>\"\");\n      assertTop5Active();\n"
      ],
      [
        "  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);\n  try{\n    const response=await fetchFmpResponse(url,{signal:controller.signal},{fetcher:top5Fetch});assertTop5Active();\n    if(!response.ok){const text=await response.text().catch(()=>\"\");assertTop5Active();const error=new Error(`FMP bulk fundamentals request failed: ${response.status}${text?` - ${text.slice(0,140)}`:\"\"}`);error.status=response.status;throw error;}\n    const data=await readFmpJsonResponse(response),rows=asArray(data).filter(row=>row&&typeof row==='object'&&normalizeSymbol(row.symbol));\n    assertTop5Active();\n    if(!rows.length)throw new Error('FMP bulk fundamentals returned no symbol rows');\n",
        "  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);\n  try{\n    const response=await top5Fetch(url,{signal:controller.signal});assertTop5Active();\n    if(!response.ok){const text=await response.text().catch(()=>\"\");assertTop5Active();const error=new Error(`FMP bulk fundamentals request failed: ${response.status}${text?` - ${text.slice(0,140)}`:\"\"}`);error.status=response.status;throw error;}\n    const data=await response.json(),rows=asArray(data).filter(row=>row&&typeof row==='object'&&normalizeSymbol(row.symbol));\n    assertTop5Active();\n    if(!rows.length)throw new Error('FMP bulk fundamentals returned no symbol rows');\n"
      ],
      [
        "async function fetchFmpFundamentalsDiagnosticTask(symbols=[]){\n  assertTop5Active();\n  const key=fmpApiKey(),requested=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],result=new Map();if(!requested.length)return result;\n  if(!key){for(const symbol of requested)result.set(symbol,unavailableRow(symbol));return result;}\n  await hydratePersistentCache();\n",
        "async function fetchFmpFundamentalsDiagnosticTask(symbols=[]){\n  assertTop5Active();\n  const key=process.env.FMP_API_KEY,requested=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],result=new Map();if(!requested.length)return result;\n  if(!key){for(const symbol of requested)result.set(symbol,unavailableRow(symbol));return result;}\n  await hydratePersistentCache();\n"
      ],
      [
        "export async function refreshAllFmpFundamentalsBulk(requestedSymbols=[]){\n  assertTop5Active();\n  const key=fmpApiKey({allowLegacy:true});\n  if(!key)throw new Error('FMP_API_KEY is required for bulk fundamental refresh');\n  // Six stable bulk requests replace thousands of per-symbol requests: one TTM\n",
        "export async function refreshAllFmpFundamentalsBulk(requestedSymbols=[]){\n  assertTop5Active();\n  const key=process.env.FMP_API_KEY||process.env.FMP_KEY;\n  if(!key)throw new Error('FMP_API_KEY is required for bulk fundamental refresh');\n  // Six stable bulk requests replace thousands of per-symbol requests: one TTM\n"
      ]
    ]
  },
  "lib/eventRisk.js": {
    "hash": "b6a606289a8d5e52dcbfa0dcd1d9cd0ad9cfa948",
    "parts": [
      [
        "// Pre-trade event check plus cross-name material catalyst awareness.\nimport {easternMarketClock} from './marketSession';\nimport {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nimport {fromFmpSymbol as normalizeSymbol} from './fmpSymbols';\nimport {createHash} from 'node:crypto';\nimport {C1_CURRENT_EVENT_EVIDENCE_CONTRACT,readC1CurrentEventEvidence} from './c1CurrentEventEvidence';\nimport {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';\nfunction isoDate(date){return easternMarketClock(date)?.key||date.toISOString().slice(0,10);}\nfunction addDays(date,days){const next=new Date(date);next.setUTCDate(next.getUTCDate()+days);return next;}\n",
        "// Pre-trade event check plus cross-name material catalyst awareness.\nimport {easternMarketClock} from './marketSession';\nimport {createHash} from 'node:crypto';\nimport {C1_CURRENT_EVENT_EVIDENCE_CONTRACT,readC1CurrentEventEvidence} from './c1CurrentEventEvidence';\nimport {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';\nfunction normalizeSymbol(value){return String(value||\"\").replace(\"-\", \".\").toUpperCase().trim();}\nfunction isoDate(date){return easternMarketClock(date)?.key||date.toISOString().slice(0,10);}\nfunction addDays(date,days){const next=new Date(date);next.setUTCDate(next.getUTCDate()+days);return next;}\n"
      ],
      [
        " if((cooldown.get(key)||0)>now){if(prior&&now-prior.ts<policy.stale)return markFeed(prior.data,'stale-verified',prior.ts);throw new Error('Event-risk feed is in a bounded retry cooldown.');}\n if(Date.now()>=deadlineMs)throw new Error('Event verification deadline exceeded');\n const request=(async()=>{try{const response=await fetchFmpResponse(url,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadlineMs-Date.now())))},{fetcher});assertTop5Active();if(!response.ok)throw new Error(`Event-risk request failed: ${response.status}`);const data=await readFmpJsonResponse(response),ts=Date.now();assertTop5Active();cache.set(key,{ts,data});while(cache.size>24)cache.delete(cache.keys().next().value);cooldown.delete(key);return markFeed(data,'live',ts);}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();cooldown.set(key,Date.now()+30000);if(prior&&Date.now()-prior.ts<policy.stale)return markFeed(prior.data,'stale-verified',prior.ts);throw error;}finally{inflight.delete(key);}})();\n inflight.set(key,request);return request;\n}\n",
        " if((cooldown.get(key)||0)>now){if(prior&&now-prior.ts<policy.stale)return markFeed(prior.data,'stale-verified',prior.ts);throw new Error('Event-risk feed is in a bounded retry cooldown.');}\n if(Date.now()>=deadlineMs)throw new Error('Event verification deadline exceeded');\n const request=(async()=>{try{const response=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadlineMs-Date.now())))});assertTop5Active();if(!response.ok)throw new Error(`Event-risk request failed: ${response.status}`);const data=await response.json(),ts=Date.now();assertTop5Active();cache.set(key,{ts,data});while(cache.size>24)cache.delete(cache.keys().next().value);cooldown.delete(key);return markFeed(data,'live',ts);}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();cooldown.set(key,Date.now()+30000);if(prior&&Date.now()-prior.ts<policy.stale)return markFeed(prior.data,'stale-verified',prior.ts);throw error;}finally{inflight.delete(key);}})();\n inflight.set(key,request);return request;\n}\n"
      ],
      [
        " map.set(symbol,{...current,status:hard?'Blocked':current.status==='Blocked'?'Blocked':'Caution',label:hard?`Pre-Trade: ${item.label}`:current.label==='Pre-Trade Check: Passed'?`Pre-Trade: ${item.label}`:current.label,detail:hard?detail:current.blockNewCapital?current.detail:detail,blockNewCapital:Boolean(current.blockNewCapital||hard),reduceConviction:Boolean(current.reduceConviction||caution),material:true,requiresReview:true,materialNews:[...prior,item],materialCatalysts:[...(current.materialCatalysts||[]),item]});\n}\nexport async function fetchMaterialCatalystMap(positions=[]){assertTop5Active();const apiKey=fmpApiKey(),map=new Map(),today=new Date(),from=isoDate(today),to=isoDate(addDays(today,2)),clean=(positions||[]).map(p=>({symbol:normalizeSymbol(p.symbol||p.ticker),factorWeights:factorWeights(p)})).filter(p=>p.symbol);for(const p of clean)map.set(p.symbol,[]);if(!apiKey||!clean.length)return map;let earnings=[];try{earnings=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));assertTop5Active();}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();}for(const p of clean){const relevant=[];for(const[factor,weightRaw]of Object.entries(p.factorWeights||{})){const weight=Number(weightRaw)||0;if(weight<.50)continue;const leaders=FACTOR_BELLWETHERS[factor]||[];for(const row of earnings){const leader=normalizeSymbol(row.symbol);if(!leaders.includes(leader)||leader===p.symbol)continue;const days=daysFromToday(row.date);if(days===null||days<0||days>1)continue;relevant.push({type:\"Bellwether Earnings\",symbol:leader,factor,factorWeight:weight,date:String(row.date).slice(0,10),days,timing:eventTiming(row),label:`${leader} earnings${days===0?\" today\":\" tomorrow\"}`,detail:`${leader} is a high-impact bellwether for ${factor}. Its results/guidance can materially change the factor read for ${p.symbol}.`,material:true});}}map.set(p.symbol,relevant);}return map;}\nconst CURRENT_CACHE_KEY='__screenerCurrentEventEvidenceV1';\nconst feedSpecs={EARNINGS:{endpoint:'earnings-calendar',limit:4000,ttl:15*60*1000,stale:6*60*60*1000},MERGERS:{endpoint:'mergers-acquisitions-latest',limit:1000,ttl:60*60*1000,stale:24*60*60*1000},NEWS:{endpoint:'news/stock',limit:500,ttl:5*60*1000,stale:2*60*60*1000}};\n",
        " map.set(symbol,{...current,status:hard?'Blocked':current.status==='Blocked'?'Blocked':'Caution',label:hard?`Pre-Trade: ${item.label}`:current.label==='Pre-Trade Check: Passed'?`Pre-Trade: ${item.label}`:current.label,detail:hard?detail:current.blockNewCapital?current.detail:detail,blockNewCapital:Boolean(current.blockNewCapital||hard),reduceConviction:Boolean(current.reduceConviction||caution),material:true,requiresReview:true,materialNews:[...prior,item],materialCatalysts:[...(current.materialCatalysts||[]),item]});\n}\nexport async function fetchMaterialCatalystMap(positions=[]){assertTop5Active();const apiKey=process.env.FMP_API_KEY,map=new Map(),today=new Date(),from=isoDate(today),to=isoDate(addDays(today,2)),clean=(positions||[]).map(p=>({symbol:normalizeSymbol(p.symbol||p.ticker),factorWeights:factorWeights(p)})).filter(p=>p.symbol);for(const p of clean)map.set(p.symbol,[]);if(!apiKey||!clean.length)return map;let earnings=[];try{earnings=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));assertTop5Active();}catch(error){if(isTop5Deadline(error))throw error;assertTop5Active();}for(const p of clean){const relevant=[];for(const[factor,weightRaw]of Object.entries(p.factorWeights||{})){const weight=Number(weightRaw)||0;if(weight<.50)continue;const leaders=FACTOR_BELLWETHERS[factor]||[];for(const row of earnings){const leader=normalizeSymbol(row.symbol);if(!leaders.includes(leader)||leader===p.symbol)continue;const days=daysFromToday(row.date);if(days===null||days<0||days>1)continue;relevant.push({type:\"Bellwether Earnings\",symbol:leader,factor,factorWeight:weight,date:String(row.date).slice(0,10),days,timing:eventTiming(row),label:`${leader} earnings${days===0?\" today\":\" tomorrow\"}`,detail:`${leader} is a high-impact bellwether for ${factor}. Its results/guidance can materially change the factor read for ${p.symbol}.`,material:true});}}map.set(p.symbol,relevant);}return map;}\nconst CURRENT_CACHE_KEY='__screenerCurrentEventEvidenceV1';\nconst feedSpecs={EARNINGS:{endpoint:'earnings-calendar',limit:4000,ttl:15*60*1000,stale:6*60*60*1000},MERGERS:{endpoint:'mergers-acquisitions-latest',limit:1000,ttl:60*60*1000,stale:24*60*60*1000},NEWS:{endpoint:'news/stock',limit:500,ttl:5*60*1000,stale:2*60*60*1000}};\n"
      ],
      [
        "  if(!Array.isArray(body))return finish('MALFORMED_RESPONSE');\n  if(!Number.isFinite(fetched)||fetched>Date.now()||until<=Date.now()||!['live','fresh-cache'].includes(body.__screenerFeedStatus))return finish('STALE_RESPONSE');\n  // A queried news issuer accepted by the existing canonicalizer and valid in-window\n  // date can lose only its own content verification. Everything that establishes\n  // acquisition coverage below still runs on the entire raw page, including these\n  // rows. Unknown identities/dates and all global-calendar defects remain global.\n  const localMalformed=row=>kind==='NEWS'&&row&&typeof row==='object'&&!Array.isArray(row)&&symbolShape(row.symbol)&&symbols.has(normalizeSymbol(row.symbol))&&validDay(newsDate(row))&&newsDate(row)>=params.from&&newsDate(row)<=params.to&&!newsText(row);\n  if(body.some(row=>!validFeedRow(kind,row,params.from,params.to,symbols)&&!localMalformed(row)))return finish('MALFORMED_RESPONSE');\n  for(const row of body)if(localMalformed(row)){malformedIssuers.add(normalizeSymbol(row.symbol));receipt.quarantinedRowCount=(receipt.quarantinedRowCount||0)+1;}\n  // Global M&A records are actionable only through a valid target symbol. Keep\n  // every non-attributable row auditable without converting one provider defect\n",
        "  if(!Array.isArray(body))return finish('MALFORMED_RESPONSE');\n  if(!Number.isFinite(fetched)||fetched>Date.now()||until<=Date.now()||!['live','fresh-cache'].includes(body.__screenerFeedStatus))return finish('STALE_RESPONSE');\n  // A queried news issuer with an exact canonical identity and valid in-window\n  // date can lose only its own content verification. Everything that establishes\n  // acquisition coverage below still runs on the entire raw page, including these\n  // rows. Unknown identities/dates and all global-calendar defects remain global.\n  const localMalformed=row=>kind==='NEWS'&&row&&typeof row==='object'&&!Array.isArray(row)&&symbolShape(row.symbol)&&symbols.has(row.symbol)&&validDay(newsDate(row))&&newsDate(row)>=params.from&&newsDate(row)<=params.to&&!newsText(row);\n  if(body.some(row=>!validFeedRow(kind,row,params.from,params.to,symbols)&&!localMalformed(row)))return finish('MALFORMED_RESPONSE');\n  for(const row of body)if(localMalformed(row)){malformedIssuers.add(row.symbol);receipt.quarantinedRowCount=(receipt.quarantinedRowCount||0)+1;}\n  // Global M&A records are actionable only through a valid target symbol. Keep\n  // every non-attributable row auditable without converting one provider defect\n"
      ],
      [
        " while(cache.size>512)cache.delete(cache.keys().next().value);\n}\nasync function fetchEventRiskMapDiagnosticTask(symbols=[],{apiKey=fmpApiKey(),fetcher=top5Fetch,deadlineMs=Date.now()+30000}={}){\n assertTop5Active();\n const clean=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],map=new Map(clean.map(symbol=>[symbol,baseRisk(symbol)]));if(!clean.length)return map;\n",
        " while(cache.size>512)cache.delete(cache.keys().next().value);\n}\nasync function fetchEventRiskMapDiagnosticTask(symbols=[],{apiKey=process.env.FMP_API_KEY,fetcher=top5Fetch,deadlineMs=Date.now()+30000}={}){\n assertTop5Active();\n const clean=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],map=new Map(clean.map(symbol=>[symbol,baseRisk(symbol)]));if(!clean.length)return map;\n"
      ]
    ]
  },
  "lib/fmpSymbols.js": {
    "hash": "3f2da9a57015924801b08c977da3830abec4ee98",
    "parts": [
      [
        "  return String(value || '').replace('.', '-').toUpperCase().trim();\n}\n\n// Existing response-side spelling, distinct from account share-class aliases.\nexport function fromFmpSymbol(value) {\n  return String(value || '').replace('-', '.').toUpperCase().trim();\n}\n",
        "  return String(value || '').replace('.', '-').toUpperCase().trim();\n}\n"
      ]
    ]
  },
  "lib/entryTiming.js": {
    "hash": "561ff778208aa017770bac69efe56892ed3c667f",
    "parts": [
      [
        "import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\n// Historical entry-timing engine. Stock quality and entry timing are deliberately separate.\n// Fresh capital must pass this layer after quality qualification; quality never overrides a bad entry.\n\nimport {toFmpSymbol as fmp,fromFmpSymbol as norm} from './fmpSymbols';\nimport {latestCompletedMarketSessionDay} from './marketSession';\nimport {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';\n",
        "// Historical entry-timing engine. Stock quality and entry timing are deliberately separate.\n// Fresh capital must pass this layer after quality qualification; quality never overrides a bad entry.\n\nimport {latestCompletedMarketSessionDay} from './marketSession';\nimport {top5Phase,top5Fetch,top5Count,assertTop5Active,isTop5Deadline} from './top5Diagnostics';\n"
      ],
      [
        "const CACHE_KEY='__entryTimingCacheV3',INFLIGHT_KEY='__entryTimingInflightV2',COOLDOWN_KEY='__entryTimingCooldownUntilV1',TTL_MS=4*60*60*1000,STALE_MS=2*24*60*60*1000,LIQUIDITY_LOOKBACK_SESSIONS=20,MIN_LIQUIDITY_SESSIONS=15,MIN_AVG_DOLLAR_VOLUME=10_000_000;\nconst n=(v,f=null)=>{const x=Number(v);return Number.isFinite(x)?x:f};\nconst pct=(a,b)=>a>0&&b>0?(a/b-1)*100:null;\nconst mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;\n",
        "const CACHE_KEY='__entryTimingCacheV3',INFLIGHT_KEY='__entryTimingInflightV2',COOLDOWN_KEY='__entryTimingCooldownUntilV1',TTL_MS=4*60*60*1000,STALE_MS=2*24*60*60*1000,LIQUIDITY_LOOKBACK_SESSIONS=20,MIN_LIQUIDITY_SESSIONS=15,MIN_AVG_DOLLAR_VOLUME=10_000_000;\nconst n=(v,f=null)=>{const x=Number(v);return Number.isFinite(x)?x:f};\nconst norm=s=>String(s||'').replace('-','.').toUpperCase().trim();\nconst fmp=s=>String(s||'').replace('.','-').toUpperCase().trim();\nconst pct=(a,b)=>a>0&&b>0?(a/b-1)*100:null;\nconst mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;\n"
      ],
      [
        "    const c=new AbortController(),t=setTimeout(()=>c.abort(),6500);\n    try{\n      const r=await fetchFmpResponse(url,{signal:c.signal},{fetcher:top5Fetch});assertTop5Active();\n      if(r.ok){const data=await readFmpJsonResponse(r);assertTop5Active();return data;}\n      const e=new Error(`history ${r.status}`);e.status=r.status;\n      if(r.status===429){const retryAfter=Number(r.headers.get('retry-after'));setCooldown(Number.isFinite(retryAfter)&&retryAfter>0?Math.max(30000,retryAfter*1000):60000);throw e;}\n",
        "    const c=new AbortController(),t=setTimeout(()=>c.abort(),6500);\n    try{\n      const r=await top5Fetch(url,{signal:c.signal});assertTop5Active();\n      if(r.ok){const data=await r.json();assertTop5Active();return data;}\n      const e=new Error(`history ${r.status}`);e.status=r.status;\n      if(r.status===429){const retryAfter=Number(r.headers.get('retry-after'));setCooldown(Number.isFinite(retryAfter)&&retryAfter>0?Math.max(30000,retryAfter*1000):60000);throw e;}\n"
      ],
      [
        "async function fetchEntryTimingMapDiagnosticTask(symbols=[]){\n  assertTop5Active();\n  const key=fmpApiKey(),out=new Map(),store=cache(),requested=[...new Set(symbols.map(norm).filter(Boolean))],unique=[...new Set([...requested,'SPY','QQQ'])],now=Date.now();\n  if(!key){for(const s of requested)out.set(s,{symbol:s,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Market-data key unavailable; fresh capital is paused.'});return out;}\n  const missing=[];for(const s of unique){const hit=store.get(s);if(hit&&now-hit.ts<TTL_MS)out.set(s,hit.data);else missing.push(s);}\n",
        "async function fetchEntryTimingMapDiagnosticTask(symbols=[]){\n  assertTop5Active();\n  const key=process.env.FMP_API_KEY,out=new Map(),store=cache(),requested=[...new Set(symbols.map(norm).filter(Boolean))],unique=[...new Set([...requested,'SPY','QQQ'])],now=Date.now();\n  if(!key){for(const s of requested)out.set(s,{symbol:s,available:false,pass:false,strongPass:false,status:'Historical timing unavailable',reason:'Market-data key unavailable; fresh capital is paused.'});return out;}\n  const missing=[];for(const s of unique){const hit=store.get(s);if(hit&&now-hit.ts<TTL_MS)out.set(s,hit.data);else missing.push(s);}\n"
      ]
    ]
  },
  "lib/c1AccountOpeningProvider.js": {
    "hash": "9d3a9ce2b42d0d88b188dfd1883c429a480ac9e5",
    "parts": [
      [
        "import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nimport {fetchEventRiskMap} from './eventRisk';\nimport {normalizeHistoricalBars} from './fmpPriceBars';\n",
        "import {fetchEventRiskMap} from './eventRisk';\nimport {normalizeHistoricalBars} from './fmpPriceBars';\n"
      ],
      [
        "  receipt:{provider:'FMP',observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:priceBasisRevisions.length===0,quoteMaximumAgeSeconds:120,symbolConvention:'explicit-BF.B-BRK.B-share-class-aliases'}};\n}\nexport async function collectC1AccountOpening({baseline,symbols,now=new Date(),allowPriceRevisionReview=false,fetcher=fetch,apiKey=fmpApiKey({allowLegacy:true}),collectEvents=fetchEventRiskMap}={}){\n if(!apiKey)throw new Error('Market data provider is not configured');\n if(!marketExecutionState(now).isOpen)return null;\n",
        "  receipt:{provider:'FMP',observedAt:now.toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:priceBasisRevisions.length===0,quoteMaximumAgeSeconds:120,symbolConvention:'explicit-BF.B-BRK.B-share-class-aliases'}};\n}\nexport async function collectC1AccountOpening({baseline,symbols,now=new Date(),allowPriceRevisionReview=false,fetcher=fetch,apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY,collectEvents=fetchEventRiskMap}={}){\n if(!apiKey)throw new Error('Market data provider is not configured');\n if(!marketExecutionState(now).isOpen)return null;\n"
      ],
      [
        " async function request(endpoint,params={}){\n  const query=new URLSearchParams({...params,apikey:apiKey});let r,body;\n  try{r=await fetchFmpResponse('https://financialmodelingprep.com/stable/'+endpoint+'?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))},{fetcher});if(!r.ok)throw new Error();body=await readFmpJsonResponse(r);}catch{throw new Error('Opening market-data request failed');}\n  const rows=Array.isArray(body)?body:body?.historical;if(!Array.isArray(rows)||!rows.length)throw new Error('Opening market-data response was empty');return rows;\n }\n",
        " async function request(endpoint,params={}){\n  const query=new URLSearchParams({...params,apikey:apiKey});let r,body;\n  try{r=await fetcher('https://financialmodelingprep.com/stable/'+endpoint+'?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-Date.now())))});if(!r.ok)throw new Error();body=await r.json();}catch{throw new Error('Opening market-data request failed');}\n  const rows=Array.isArray(body)?body:body?.historical;if(!Array.isArray(rows)||!rows.length)throw new Error('Opening market-data response was empty');return rows;\n }\n"
      ]
    ]
  },
  "lib/c1LiveInputProvider.js": {
    "hash": "0d1499f5be0ac11fcbb6f4584966bc76ceb4fdf2",
    "parts": [
      [
        "import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nimport { createHash } from 'node:crypto';\nimport { normalizeHistoricalBars } from './fmpPriceBars';\n",
        "import { createHash } from 'node:crypto';\nimport { normalizeHistoricalBars } from './fmpPriceBars';\n"
      ],
      [
        "// production portfolio. The deadline and concurrency limit bound a manual check.\nexport async function collectC1LiveInput({ universe = 'nasdaq', now = new Date(), fetcher = fetch,\n  apiKey = fmpApiKey({allowLegacy:true}), budgetMs = 100000 } = {}) {\n  const spec = Object.hasOwn(C1_LIVE_UNIVERSES, universe) && C1_LIVE_UNIVERSES[universe];\n  if (!spec) throw new Error('Select a tested index universe: nasdaq or sp500');\n",
        "// production portfolio. The deadline and concurrency limit bound a manual check.\nexport async function collectC1LiveInput({ universe = 'nasdaq', now = new Date(), fetcher = fetch,\n  apiKey = process.env.FMP_API_KEY || process.env.FMP_KEY, budgetMs = 100000 } = {}) {\n  const spec = Object.hasOwn(C1_LIVE_UNIVERSES, universe) && C1_LIVE_UNIVERSES[universe];\n  if (!spec) throw new Error('Select a tested index universe: nasdaq or sp500');\n"
      ],
      [
        "    // Never echo a provider URL/body: either can contain a credential.\n    let response;\n    try { response = await fetchFmpResponse('https://financialmodelingprep.com/stable/' + endpoint + '?' + query,\n      { cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) },{fetcher}); }\n    catch { failed = true; throw new Error('Market data provider request failed or timed out'); }\n    if (!response.ok) { failed = true; throw new Error('Market data provider returned HTTP ' + response.status); }\n    let body;\n    try { body = await readFmpJsonResponse(response); }\n    catch { failed = true; throw new Error('Market data provider returned invalid JSON'); }\n    const rows = Array.isArray(body) ? body : body?.historical;\n",
        "    // Never echo a provider URL/body: either can contain a credential.\n    let response;\n    try { response = await fetcher('https://financialmodelingprep.com/stable/' + endpoint + '?' + query,\n      { cache: 'no-store', signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))) }); }\n    catch { failed = true; throw new Error('Market data provider request failed or timed out'); }\n    if (!response.ok) { failed = true; throw new Error('Market data provider returned HTTP ' + response.status); }\n    let body;\n    try { body = await response.json(); }\n    catch { failed = true; throw new Error('Market data provider returned invalid JSON'); }\n    const rows = Array.isArray(body) ? body : body?.historical;\n"
      ]
    ]
  },
  "lib/c1HeldRankProvider.js": {
    "hash": "79b84adb03f7bd061c39ad6860a40df5778b78e5",
    "parts": [
      [
        "import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nimport {createHash} from 'node:crypto';\nimport {normalizeHistoricalBars} from './fmpPriceBars';\n",
        "import {createHash} from 'node:crypto';\nimport {normalizeHistoricalBars} from './fmpPriceBars';\n"
      ],
      [
        "import {latestCompletedMarketSessionDay} from './marketSession';\n\nexport async function collectC1HeldRankReviews({baseline,sourceHash,symbols,now=new Date(),fetcher=fetch,apiKey=fmpApiKey({allowLegacy:true}),report=details=>console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify(details))}={}){\n if(baseline?.date!==latestCompletedMarketSessionDay(now)||symbols.length>20)throw new Error('Current bounded holding review required');\n if(symbols.length&&!apiKey)throw new Error('Holding momentum data provider is not configured');\n",
        "import {latestCompletedMarketSessionDay} from './marketSession';\n\nexport async function collectC1HeldRankReviews({baseline,sourceHash,symbols,now=new Date(),fetcher=fetch,apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY,report=details=>console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify(details))}={}){\n if(baseline?.date!==latestCompletedMarketSessionDay(now)||symbols.length>20)throw new Error('Current bounded holding review required');\n if(symbols.length&&!apiKey)throw new Error('Holding momentum data provider is not configured');\n"
      ],
      [
        "   const providerSymbol=({'BRK.B':'BRK-B','BF.B':'BF-B'}[symbol]||symbol);\n   const query=new URLSearchParams({symbol:providerSymbol,from:from.toISOString().slice(0,10),to:baseline.date,apikey:apiKey});\n   const response=await fetchFmpResponse('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))},{fetcher});\n   providerStatus=Number.isInteger(response.status)?response.status:null;\n   if(!response.ok)throw new Error('Holding history provider unavailable');\n   stage='response';\n   const body=await readFmpJsonResponse(response),raw=Array.isArray(body)?body:body?.historical;\n   receivedRows=Array.isArray(raw)?raw.length:null;\n   stage='identity';\n",
        "   const providerSymbol=({'BRK.B':'BRK-B','BF.B':'BF-B'}[symbol]||symbol);\n   const query=new URLSearchParams({symbol:providerSymbol,from:from.toISOString().slice(0,10),to:baseline.date,apikey:apiKey});\n   const response=await fetcher('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+query,{cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});\n   providerStatus=Number.isInteger(response.status)?response.status:null;\n   if(!response.ok)throw new Error('Holding history provider unavailable');\n   stage='response';\n   const body=await response.json(),raw=Array.isArray(body)?body:body?.historical;\n   receivedRows=Array.isArray(raw)?raw.length:null;\n   stage='identity';\n"
      ]
    ]
  },
  "lib/c1HoldingCoverage.js": {
    "hash": "d73064470496cb826ec74cec5425f181ef30cd74",
    "parts": [
      [
        "import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\nimport {normalizeHistoricalBars} from './fmpPriceBars';\nimport {latestCompletedMarketSessionDay,isUsMarketSessionDay} from './marketSession';\n",
        "import {normalizeHistoricalBars} from './fmpPriceBars';\nimport {latestCompletedMarketSessionDay,isUsMarketSessionDay} from './marketSession';\n"
      ],
      [
        "// eligibility. Never mutate the accepted index book with these observations.\nexport async function collectC1HoldingCoverage({portfolio,baseline,now=new Date(),fetcher=fetch,\n apiKey=fmpApiKey({allowLegacy:true})}={}){\n if(!isUsMarketSessionDay(baseline?.date)||baseline.date>latestCompletedMarketSessionDay(now))throw new Error('Current completed session required for holding valuations');\n const symbols=missingC1HoldingPrices(portfolio,baseline);\n",
        "// eligibility. Never mutate the accepted index book with these observations.\nexport async function collectC1HoldingCoverage({portfolio,baseline,now=new Date(),fetcher=fetch,\n apiKey=process.env.FMP_API_KEY||process.env.FMP_KEY}={}){\n if(!isUsMarketSessionDay(baseline?.date)||baseline.date>latestCompletedMarketSessionDay(now))throw new Error('Current completed session required for holding valuations');\n const symbols=missingC1HoldingPrices(portfolio,baseline);\n"
      ],
      [
        "   const params=new URLSearchParams({symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date,apikey:apiKey});\n   try{\n    const response=await fetchFmpResponse('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+params,\n     {cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))},{fetcher});\n    if(!response.ok)throw new Error('provider');\n    const body=await readFmpJsonResponse(response),raw=Array.isArray(body)?body:body?.historical;\n    if(!Array.isArray(raw)||raw.length!==1||raw[0].date!==baseline.date)throw new Error('date');\n    if(raw[0].symbol&&![symbol,providerSymbol(symbol)].includes(raw[0].symbol))throw new Error('symbol');\n",
        "   const params=new URLSearchParams({symbol:providerSymbol(symbol),from:baseline.date,to:baseline.date,apikey:apiKey});\n   try{\n    const response=await fetcher('https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?'+params,\n     {cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});\n    if(!response.ok)throw new Error('provider');\n    const body=await response.json(),raw=Array.isArray(body)?body:body?.historical;\n    if(!Array.isArray(raw)||raw.length!==1||raw[0].date!==baseline.date)throw new Error('date');\n    if(raw[0].symbol&&![symbol,providerSymbol(symbol)].includes(raw[0].symbol))throw new Error('symbol');\n"
      ],
      [
        "    let classification=null;\n    if(!baseline.universeSymbols?.includes(symbol)){\n     const response=await fetchFmpResponse('https://financialmodelingprep.com/stable/profile?'+new URLSearchParams({symbol:providerSymbol(symbol),apikey:apiKey}),\n      {cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))},{fetcher});\n     if(!response.ok)throw new Error('profile');\n     const profiles=await readFmpJsonResponse(response),profile=Array.isArray(profiles)&&profiles.find(p=>[symbol,providerSymbol(symbol)].includes(p.symbol));\n     if(!profile||typeof profile.sector!=='string'||!profile.sector.trim()||!profile.cik)throw new Error('classification');\n     classification={symbol,sector:profile.sector,issuer:String(profile.cik),provider:'FMP',endpoint:'profile',observedAt:new Date().toISOString()};\n",
        "    let classification=null;\n    if(!baseline.universeSymbols?.includes(symbol)){\n     const response=await fetcher('https://financialmodelingprep.com/stable/profile?'+new URLSearchParams({symbol:providerSymbol(symbol),apikey:apiKey}),\n      {cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(8000,deadline-Date.now())))});\n     if(!response.ok)throw new Error('profile');\n     const profiles=await response.json(),profile=Array.isArray(profiles)&&profiles.find(p=>[symbol,providerSymbol(symbol)].includes(p.symbol));\n     if(!profile||typeof profile.sector!=='string'||!profile.sector.trim()||!profile.cik)throw new Error('classification');\n     classification={symbol,sector:profile.sector,issuer:String(profile.cik),provider:'FMP',endpoint:'profile',observedAt:new Date().toISOString()};\n"
      ]
    ]
  },
  "lib/fullMarketDiscovery.js": {
    "hash": "7919413b947cbbf074ea4e8276e5dfb802221080",
    "parts": [
      [
        "import {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from './fmpTransport';\n// Daily, bounded full-market discovery for the live opportunity engine.\n//\n",
        "// Daily, bounded full-market discovery for the live opportunity engine.\n//\n"
      ],
      [
        "    const timer = setTimeout(() => controller.abort(), timeoutMs);\n    try {\n      const response = await fetchFmpResponse(url, { signal: controller.signal },{fetcher:top5Fetch});\n      assertTop5Active();\n      if (response.ok) {\n        const data = await readFmpJsonResponse(response);\n        assertTop5Active();\n        return data;\n",
        "    const timer = setTimeout(() => controller.abort(), timeoutMs);\n    try {\n      const response = await top5Fetch(url, { signal: controller.signal });\n      assertTop5Active();\n      if (response.ok) {\n        const data = await response.json();\n        assertTop5Active();\n        return data;\n"
      ],
      [
        "async function refreshFullMarketDiscoveryDiagnosticTask({ apiKey, now = Date.now() } = {}) {\n  assertTop5Active();\n  const key = apiKey || fmpApiKey({allowLegacy:true});\n  const config = fullMarketDiscoveryConfig();\n  if (!config.enabled)\n",
        "async function refreshFullMarketDiscoveryDiagnosticTask({ apiKey, now = Date.now() } = {}) {\n  assertTop5Active();\n  const key = apiKey || process.env.FMP_API_KEY || process.env.FMP_KEY;\n  const config = fullMarketDiscoveryConfig();\n  if (!config.enabled)\n"
      ]
    ]
  },
  "pages/api/lookup.js": {
    "hash": "c1c3becf3035071e51d9a833f911d05ba2baee60",
    "parts": [
      [
        "import {sendPublicApiFailure} from '../../lib/publicApiFailure';\nimport {fetchFmpResponse,readFmpJsonResponse,fmpApiKey} from '../../lib/fmpTransport';\n// pages/api/lookup.js\n\n",
        "// pages/api/lookup.js\n\n"
      ],
      [
        "\nasync function fetchQuote(symbol) {\n  const apiKey = fmpApiKey();\n\n  if (!apiKey) {\n",
        "\nasync function fetchQuote(symbol) {\n  const apiKey = process.env.FMP_API_KEY;\n\n  if (!apiKey) {\n"
      ],
      [
        "\n  const response =\n    await fetchFmpResponse(url);\n\n  if (!response.ok) {\n",
        "\n  const response =\n    await fetch(url);\n\n  if (!response.ok) {\n"
      ],
      [
        "\n  const data =\n    await readFmpJsonResponse(response);\n\n  const quote =\n",
        "\n  const data =\n    await response.json();\n\n  const quote =\n"
      ],
      [
        "      stock: result,\n    });\n  } catch {\n    return sendPublicApiFailure(res,{status:500,code:'LOOKUP_UNAVAILABLE',stage:'lookup',error:'Lookup failed.'});\n  }\n}\n",
        "      stock: result,\n    });\n  } catch (err) {\n    console.error(\n      \"lookup error:\",\n      err\n    );\n\n    return res.status(500).json({\n      error:\n        err.message ||\n        \"Lookup failed.\",\n    });\n  }\n}\n"
      ]
    ]
  }
};
function restoreProviderTransport(file,source){
 const change=changes[file];assert(change,'Known provider source');
 for(const [after,before]of change.parts){assert.equal(source.split(after).length,2,'Unique complete transport inversion: '+file);source=source.replace(after,before);}
 const hash=createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
 assert.equal(hash,change.hash,'Entire pre-extraction production source recovered: '+file);
 return source;
}
function installProviderTransport(sandbox){
 const source=(fs.readFileSync('lib/fmpTransport.js','utf8')+'\n'+fs.readFileSync('lib/fmpSymbols.js','utf8')).replace(/export (async )?function /g,'$1function ');
 const run=new vm.Script('(function(){'+source+';return {fetchFmpResponse,readFmpJsonResponse,fmpApiKey,fromFmpSymbol};})()');
 const bindings=run.runInNewContext(sandbox);Object.assign(sandbox,bindings,{normalizeSymbol:bindings.fromFmpSymbol});return sandbox;
}
module.exports={restoreProviderTransport,installProviderTransport};
