const fs=require('fs');
const path='pages/api/top5.js';
let s=fs.readFileSync(path,'utf8');

if(!s.includes('marketCycleProxySymbols')){
  const anchor='import {fetchFmpFundamentals,mergeFundamentals} from "../../lib/fmpFundamentals";';
  if(!s.includes(anchor))throw new Error('market-cycle import anchor missing');
  s=s.replace(anchor,anchor+'\nimport {marketCycleProxySymbols,discoverMarketCycles} from "../../lib/marketCycleUniverse";');
}

const scoreOld='primaryTheme:PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other",theme:PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other"';
const scoreNew='primaryTheme:n.marketCycleTheme||PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other",theme:n.marketCycleTheme||PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other"';
if(s.includes(scoreOld))s=s.replace(scoreOld,scoreNew);else if(!s.includes('n.marketCycleTheme||PRIMARY_THEME_BY_SYMBOL'))throw new Error('theme scoring anchor missing');

const buildStart='const CACHE_KEY="__screenerBroadOpportunityCacheV3",CACHE_MS=30000;async function buildBroadSnapshot(){';
const startIx=s.indexOf(buildStart);
if(startIx<0&&!s.includes('__screenerBroadOpportunityCacheV4'))throw new Error('broad snapshot anchor missing');
if(startIx>=0){
  const endMarker='async function recordPerformance(req,rows)';
  const endIx=s.indexOf(endMarker,startIx);
  if(endIx<0)throw new Error('broad snapshot end anchor missing');
  const replacement=`const CACHE_KEY="__screenerBroadOpportunityCacheV4",CACHE_MS=30000;async function buildBroadSnapshot(){const now=Date.now(),cached=globalThis[CACHE_KEY];if(cached?.rows&&now-cached.ts<CACHE_MS)return cached;if(cached?.promise)return cached.promise;const promise=(async()=>{const strategicSymbols=CORE_OPPORTUNITY_SYMBOLS.filter(x=>!EXCLUDED.has(x)),proxySymbols=marketCycleProxySymbols(),seedQuotes=await fetchFmpQuotes([...strategicSymbols,...proxySymbols,"SPY","QQQ"]),seedNormalized=seedQuotes.map(normalizeQuote).filter(q=>q.symbol&&q.price),cycle=discoverMarketCycles(seedNormalized),dynamicSymbols=cycle.dynamicSymbols.filter(x=>!strategicSymbols.includes(x)&&!EXCLUDED.has(x)),dynamicRaw=dynamicSymbols.length?await fetchFmpQuotes(dynamicSymbols):[],dynamicTheme=new Map();for(const g of cycle.selected)for(const m of g.members)if(dynamicSymbols.includes(m))dynamicTheme.set(m,g.name);const dynamicNormalized=dynamicRaw.map(normalizeQuote).filter(q=>q.symbol&&q.price).map(q=>({...q,marketCycleTheme:dynamicTheme.get(q.symbol)||'Market Cycle'})),normalized=[...seedNormalized,...dynamicNormalized],spy=normalized.find(q=>q.symbol==="SPY"),qqq=normalized.find(q=>q.symbol==="QQQ"),broadSymbols=[...new Set([...strategicSymbols,...dynamicSymbols])],broadQuotes=normalized.filter(q=>broadSymbols.includes(q.symbol)),fundamentalMap=await fetchFmpFundamentals(broadQuotes.map(q=>q.symbol));let rows=broadQuotes.map(q=>scoreQuote(mergeFundamentals({...q,spyDayChangePct:spy?.dayChangePct??null,qqqDayChangePct:qqq?.dayChangePct??null},fundamentalMap)));const eventRiskMap=await fetchEventRiskMap(rows.map(r=>r.symbol));rows=rows.map(r=>applyEventRiskGate(r,eventRiskMap.get(r.symbol)));rows=finalizeBroadOpportunityDecisions(rows);const result={rows,cycle,strategicCount:strategicSymbols.length,dynamicCount:dynamicSymbols.length,universeSize:broadSymbols.length};globalThis[CACHE_KEY]={ts:Date.now(),...result,promise:null};return result;})();globalThis[CACHE_KEY]={ts:cached?.ts||0,rows:cached?.rows||null,promise};try{return await promise}catch(err){globalThis[CACHE_KEY]={ts:cached?.ts||0,rows:cached?.rows||null,promise:null};throw err}}\n`;
  s=s.slice(0,startIx)+replacement+s.slice(endIx);
}

const handlerOld='const themeKey=String(req.query.theme||"opportunities").toLowerCase(),config=getThemeConfig(themeKey),broadRows=await buildBroadSnapshot(),themeLeadership=buildThemeLeadership(broadRows),isBroad=themeKey==="opportunities"||themeKey==="broad",selectedSymbols=new Set(config.symbols.filter(s=>!EXCLUDED.has(s))),rows=isBroad?broadRows:broadRows.filter(r=>selectedSymbols.has(r.symbol));';
const handlerNew='const themeKey=String(req.query.theme||"opportunities").toLowerCase(),config=getThemeConfig(themeKey),broadSnapshot=await buildBroadSnapshot(),broadRows=broadSnapshot.rows,themeLeadership=buildThemeLeadership(broadRows),isBroad=themeKey==="opportunities"||themeKey==="broad",selectedSymbols=new Set(config.symbols.filter(s=>!EXCLUDED.has(s))),rows=isBroad?broadRows:broadRows.filter(r=>selectedSymbols.has(r.symbol));';
if(s.includes(handlerOld))s=s.replace(handlerOld,handlerNew);else if(!s.includes('broadSnapshot=await buildBroadSnapshot()'))throw new Error('handler snapshot anchor missing');

const metaOld='mode:"expert_decision_v10_discovery_audit",universeDesign:"curated thematic universe — repeated names are not proof of whole-market discovery",universeSize:CORE_OPPORTUNITY_SYMBOLS.filter(s=>!EXCLUDED.has(s)).length,quotesReceived:broadRows.length';
const metaNew='mode:"expert_decision_v11_market_cycle_radar",universeDesign:"strategic themes plus dynamic market-cycle sleeve; not yet a full all-listed-equities scan",universeSize:broadSnapshot.universeSize,strategicUniverseSize:broadSnapshot.strategicCount,dynamicUniverseSize:broadSnapshot.dynamicCount,marketCycleRadar:broadSnapshot.cycle.groups.map(g=>({name:g.name,proxy:g.proxy,state:g.state,score:g.score})),selectedMarketCycles:broadSnapshot.cycle.selected.map(g=>({name:g.name,proxy:g.proxy,state:g.state,score:g.score,members:g.members})),quotesReceived:broadRows.length';
if(s.includes(metaOld))s=s.replace(metaOld,metaNew);else if(!s.includes('expert_decision_v11_market_cycle_radar'))throw new Error('meta anchor missing');

fs.writeFileSync(path,s);
