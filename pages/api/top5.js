// pages/api/top5.js
// Broad opportunity engine: score -> standalone expert decision -> event risk -> relative capital decision.

import {
  compositeScore, calcFundamentalScore, calcTechnicalScore, calcMomentumScore,
  calcRelativeStrengthScore, calcAsymmetryScore, calcTriggerScore,
  getRecommendation, buildTechnicalSnapshot, buildFundamentalSnapshot,
} from "../../lib/scoring";
import { applyExpertDecision } from "../../lib/expertDecision";
import { fetchEventRiskMap, applyEventRiskGate } from "../../lib/eventRisk";
import { projectedFullDayVolume } from "../../lib/marketSession";
import { finalizeBroadOpportunityDecisions, relativeCapitalScore } from "../../lib/opportunityDecision";
import { fetchFmpFundamentals, mergeFundamentals } from "../../lib/fmpFundamentals";

const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const uniqueSymbols=a=>[...new Set((a||[]).map(normalizeSymbol).filter(Boolean))];

// Strong Buy is intentionally stateful. Earning Strong Buy uses the strict expert gates;
// retaining it uses a slightly wider band so small quote/score movement does not create
// whipsaw. The state lives in an HttpOnly browser cookie rather than Vercel process memory,
// so it survives serverless instance changes. It expires if the app is not refreshed for days.
const SIGNAL_COOKIE="screener_strong_buy_state_v1";
const SIGNAL_STATE_MAX_AGE_MS=5*24*60*60*1000;
const SIGNAL_COOKIE_MAX_AGE_SECONDS=7*24*60*60;
function readCookie(req,name){const raw=String(req?.headers?.cookie||"");for(const part of raw.split(";")){const i=part.indexOf("=");if(i<0)continue;if(part.slice(0,i).trim()===name)return part.slice(i+1).trim()}return""}
function readStrongBuyState(req,now=Date.now()){
  const raw=readCookie(req,SIGNAL_COOKIE);if(!raw)return{};
  try{const parsed=JSON.parse(decodeURIComponent(raw)),out={};for(const[symbol,ts]of Object.entries(parsed||{})){const t=Number(ts),key=normalizeSymbol(symbol);if(key&&Number.isFinite(t)&&t>0&&now-t<=SIGNAL_STATE_MAX_AGE_MS)out[key]=t}return out}catch{return{}}
}
function writeStrongBuyState(res,state={}){
  const entries=Object.entries(state).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,25),compact=Object.fromEntries(entries);
  res.setHeader("Set-Cookie",`${SIGNAL_COOKIE}=${encodeURIComponent(JSON.stringify(compact))}; Path=/; Max-Age=${SIGNAL_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`);
}
function strongBuyRetentionEligible(s={}){
  const r=s?.recommendation&&typeof s.recommendation==="object"?s.recommendation:{},e=r?.expertDecision||s?.expertDecision||{},m=e?.metrics||{},d=s?.finalDecision||{};
  if(!["Strong Buy","Buy","Watch"].includes(String(d.action||"")))return false;
  const event=s?.eventRisk||s?.preTradeCheck||r?.eventRisk||r?.preTradeCheck||{},eventStatus=String(event?.status||"").toLowerCase();
  if(event?.blockNewCapital||event?.manualCheckRequired||["blocked","manual","caution"].includes(eventStatus))return false;
  if(m.quoteFreshnessPass===false||m.fundamentalsPass===false)return false;
  if(e.trendStatus&&e.trendStatus!=="Confirmed")return false;
  if(m.below50||m.below200)return false;
  const rv=m.relativeVolume;if(rv!==null&&rv!==undefined&&Number.isFinite(Number(rv))&&Number(rv)<.4)return false;
  const rr=Number(m.payoffRatio);if(Number.isFinite(rr)&&rr>0&&rr<1.5)return false;
  const vs50=m.vs50===null||m.vs50===undefined?null:Number(m.vs50),day=Number(m.day||0),extension=Number(m.extension??50);
  if(extension>=65||(Number.isFinite(vs50)&&vs50>20)||day>8)return false;
  const thesis=Number(r.thesisScore??s.thesisScore??e.thesisScore??s.fundamentalScore??0),trade=Number(r.tradeSetupScore??s.tradeSetupScore??e.tradeSetupScore??0),capital=Number(r.capitalScore??s.capitalScore??e.capitalScore??0),raw=Number(s.score??s.compositeScore??r.score??0),technical=Number(m.technical??s.technicalScore??r.technicalScore??0),leadership=Number(m.leadership??s.relativeStrengthScore??r.relativeStrengthScore??0),momentum=Number(m.momentum??s.momentumScore??r.momentumScore??0),entry=Number(m.entry??r.entryQualityScore??s.entryQualityScore??0),risk=Number(m.risk??r.riskScore??s.riskScore??100);
  return thesis>=74&&trade>=82&&capital>=79&&raw>=72&&technical>=62&&leadership>=64&&momentum>=52&&entry>=52&&risk<=70;
}
function applyStrongBuyHysteresis(rows=[],priorState={},now=Date.now()){
  const state={...priorState};
  let adjusted=rows.map(s=>{
    const symbol=normalizeSymbol(s.symbol||s.ticker),d=s?.finalDecision||{},strictStrong=d.action==="Strong Buy"&&d.source!=="strong-buy-retention";
    if(strictStrong){state[symbol]=now;return{...s,finalDecision:{...d,hysteresisProtected:false,strongBuyState:"earned"}}}
    const recent=Number(state[symbol])>0&&now-Number(state[symbol])<=SIGNAL_STATE_MAX_AGE_MS;
    if(recent&&strongBuyRetentionEligible(s)){
      state[symbol]=now;
      const e=s?.recommendation?.expertDecision||s?.expertDecision||{},first=Array.isArray(e?.failures)?e.failures[0]:"";
      return{...s,finalDecision:{...d,action:"Strong Buy",timing:"Now",size:"Full",priority:"Retained Strong Buy",reason:`Strong Buy retained: the setup remains inside the high-conviction retention band and no hard safety gate has failed.${first?` Current softened factor: ${first}`:""}`,source:"strong-buy-retention",hysteresisProtected:true,strongBuyState:"retained"}};
    }
    if(recent)delete state[symbol];
    return{...s,finalDecision:{...d,hysteresisProtected:false,strongBuyState:"none"}};
  });
  const rank=a=>a==="Strong Buy"?4:a==="Buy"?3:a==="Watch"?1:0;
  adjusted=adjusted.sort((a,b)=>{const ar=rank(b?.finalDecision?.action)-rank(a?.finalDecision?.action);if(ar)return ar;return relativeCapitalScore(b)-relativeCapitalScore(a)});
  return{rows:adjusted,state};
}

const THEMES={
  "AI Compute & Platforms":["NVDA","AMD","AVGO","ARM","MU","SMCI","DELL","HPE","PLTR","ORCL","MSFT","GOOGL","GOOG","META","AMZN","AAPL"],
  "AI Networking":["ANET","CSCO","NTAP","JNPR","FFIV","CIEN","MRVL","COHR","AAOI"],
  Cybersecurity:["CRWD","PANW","NET","ZS","DDOG","SNOW","MDB"],
  "Power & Electrification":["ETN","PWR","VRT","FIX","EME","GEV","CEG","VST","NRG","TLN"],
  "Digital Infrastructure":["EQIX","DLR","AMT","XYL","WTS","HUBB","NVT"],
  "Nuclear / Baseload":["CCJ","UEC","UUUU","LEU","BWXT","SMR","OKLO","NNE","NXE","DNN"],
  "BTC / Digital Assets":["MSTR","MARA","RIOT","CLSK","IREN","WULF","HUT","BTDR","CIFR","BITF","COIN","HOOD","SQ"],
  "Space & Satellites":["RKLB","ASTS","RDW","BKSY","IRDM"],
  "Defense & National Security":["RTX","LHX","NOC","LMT","HII","GD","KTOS"],
  "Autonomy & Drones":["AVAV","ONDS"],
  "Robotics & Automation":["ROK","TER","CGNX","SYM","ISRG"],
  "Industrial Software":["ADSK","PTC","SNPS","CDNS"],
  "Quantum Computing":["IONQ","RGTI","QBTS","QUBT","ARQQ","IBM","HON"],
  "Platform Biotech":["MRNA","RXRX","SDGR","CRSP","BEAM","IOVA","VKTX","ALMS","HIMS"],
};
const PRIMARY_THEME_BY_SYMBOL=Object.fromEntries(Object.entries(THEMES).flatMap(([theme,symbols])=>symbols.map(s=>[s,theme])));
const CORE_OPPORTUNITY_SYMBOLS=Object.keys(PRIMARY_THEME_BY_SYMBOL),EXCLUDED=new Set(["ABB","ABBNY"]);
const THEME_CONFIG={
  opportunities:{name:"Best Opportunities",description:"Fresh-capital screen using absolute qualification followed by relative capital ranking. Theme-aligned REITs compete on the same setup and capital-ranking rules; only non-executable/mismatched symbols are excluded.",symbols:CORE_OPPORTUNITY_SYMBOLS},
  broad:{name:"Best Opportunities",description:"Fresh-capital screen using absolute qualification followed by relative capital ranking. Theme-aligned REITs compete on the same setup and capital-ranking rules; only non-executable/mismatched symbols are excluded.",symbols:CORE_OPPORTUNITY_SYMBOLS},
  ai_compute:{name:"AI Compute & Platforms",symbols:THEMES["AI Compute & Platforms"]},ai_networking:{name:"AI Networking",symbols:THEMES["AI Networking"]},cybersecurity:{name:"Cybersecurity",symbols:THEMES.Cybersecurity},power:{name:"Power & Electrification",symbols:THEMES["Power & Electrification"]},digital_infra:{name:"Digital Infrastructure",symbols:THEMES["Digital Infrastructure"]},nuclear:{name:"Nuclear / Baseload",symbols:THEMES["Nuclear / Baseload"]},btc:{name:"BTC / Digital Assets",symbols:THEMES["BTC / Digital Assets"]},defense:{name:"Defense & National Security",symbols:THEMES["Defense & National Security"]},space:{name:"Space & Satellites",symbols:THEMES["Space & Satellites"]},drones:{name:"Autonomy & Drones",symbols:THEMES["Autonomy & Drones"]},robotics:{name:"Robotics & Automation",symbols:THEMES["Robotics & Automation"]},industrial_software:{name:"Industrial Software",symbols:THEMES["Industrial Software"]},quantum:{name:"Quantum Computing",symbols:THEMES["Quantum Computing"]},biotech:{name:"Platform Biotech",symbols:THEMES["Platform Biotech"]}
};
const getThemeConfig=k=>THEME_CONFIG[String(k||"opportunities").toLowerCase()]||THEME_CONFIG.opportunities;
const toNumber=(v,f=null)=>{if(v==null||v==="")return f;const n=Number(typeof v==="string"?v.replace("%","").replace(/,/g,"").trim():v);return Number.isFinite(n)?n:f};
const toPositiveNumber=(v,f=null)=>{const n=toNumber(v,f);return n!=null&&n>0?n:f};
function normalizeDailyPct({price,previousClose,change,rawPct}){let pct=toNumber(rawPct);if(price&&previousClose){const x=((price-previousClose)/previousClose)*100;if(pct===null||Math.abs(pct)>25||Math.abs(pct-x)>5)pct=x}if(pct===null&&change!=null&&previousClose)pct=(change/previousClose)*100;return pct}
function normalizeQuote(r={}){const symbol=normalizeSymbol(r.symbol),price=toPositiveNumber(r.price),previousClose=toPositiveNumber(r.previousClose),change=toNumber(r.change),dayChangePct=normalizeDailyPct({price,previousClose,change,rawPct:r.changesPercentage??r.changePercentage??r.changePercent});return{...r,symbol,ticker:symbol,name:r.name||r.companyName||symbol,companyName:r.companyName||r.name||symbol,price,currentPrice:price,lastPrice:price,close:price,previousClose,change,dayChangePct,changesPercentage:dayChangePct,changePercent:dayChangePct,marketCap:toPositiveNumber(r.marketCap),volume:toPositiveNumber(r.volume),avgVolume:toPositiveNumber(r.avgVolume),priceAvg50:toPositiveNumber(r.priceAvg50),fiftyDayAverage:toPositiveNumber(r.priceAvg50??r.fiftyDayAverage),priceAvg200:toPositiveNumber(r.priceAvg200),twoHundredDayAverage:toPositiveNumber(r.priceAvg200??r.twoHundredDayAverage),yearHigh:toPositiveNumber(r.yearHigh),yearLow:toPositiveNumber(r.yearLow),eps:toNumber(r.eps),pe:toNumber(r.pe),beta:toNumber(r.beta,null),exchange:r.exchange||r.exchangeShortName||"",timestamp:r.timestamp||null}}
async function fetchJson(url){const r=await fetch(url);if(!r.ok){const text=await r.text().catch(()=>"");throw new Error(`FMP request failed: ${r.status}${text?` - ${text}`:""}`)}return r.json()}
const asQuoteArray=data=>Array.isArray(data)?data.filter(Boolean):data&&typeof data==="object"?[data]:[];
function chunks(a,size=20){const out=[];for(let i=0;i<a.length;i+=size)out.push(a.slice(i,i+size));return out}
async function fetchQuoteChunk(symbols,key){if(!symbols.length)return[];const joined=symbols.map(toFmpSymbol).join(","),stable=`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(joined)}&apikey=${key}`,legacy=`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(joined)}?apikey=${key}`;try{const rows=asQuoteArray(await fetchJson(stable));if(rows.length>=Math.min(symbols.length,2))return rows}catch{}try{const rows=asQuoteArray(await fetchJson(legacy));if(rows.length>=Math.min(symbols.length,2))return rows}catch{}const rows=[];for(const symbol of symbols){const clean=toFmpSymbol(symbol);for(const url of[`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${key}`,`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(clean)}?apikey=${key}`]){try{const one=asQuoteArray(await fetchJson(url));if(one.length){rows.push(one[0]);break}}catch{}}}return rows}
async function fetchFmpQuotes(symbols=[]){const key=process.env.FMP_API_KEY;if(!key)throw new Error("Missing FMP_API_KEY in environment variables.");const requested=uniqueSymbols(symbols),all=[];for(const c of chunks(requested,20))all.push(...await fetchQuoteChunk(c,key));const bySymbol=new Map();for(const row of all){const symbol=normalizeSymbol(row?.symbol);if(symbol&&!bySymbol.has(symbol))bySymbol.set(symbol,row)}return[...bySymbol.values()]}

function scoreQuote(n={}){
  const scoringInput={...n,volume:projectedFullDayVolume(n)};
  const score=compositeScore(scoringInput),fundamentalScore=calcFundamentalScore(scoringInput),technicalScore=calcTechnicalScore(scoringInput),momentumScore=calcMomentumScore(scoringInput),relativeStrengthScore=calcRelativeStrengthScore(scoringInput),asymmetryScore=calcAsymmetryScore(scoringInput),triggerScore=calcTriggerScore(scoringInput),technicalSnapshot=buildTechnicalSnapshot(scoringInput),fundamentalSnapshot=buildFundamentalSnapshot(scoringInput);
  const raw=getRecommendation({...scoringInput,score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore});
  const recommendation=applyExpertDecision({...n,score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore},raw);
  return{...n,score,compositeScore:score,heatScore:score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,asymmetryScore,triggerScore,primaryTheme:PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other",theme:PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other",recommendation,riskPlan:recommendation.riskPlan??raw.riskPlan??null,technicalSnapshot,fundamentalSnapshot,expertDecision:recommendation.expertDecision,expertOverride:recommendation.expertOverride,expertOverrideReason:recommendation.expertOverrideReason,thesisScore:recommendation.thesisScore,tradeSetupScore:recommendation.tradeSetupScore,capitalScore:recommendation.capitalScore};
}
function buildThemeLeadership(rows=[]){const map=new Map();for(const r of rows){const t=r.primaryTheme||"Other";if(!map.has(t))map.set(t,{theme:t,total:0,strongBuy:0,buy:0,watch:0,avoid:0,scoreTotal:0,bestSymbol:r.symbol,bestRank:-1});const b=map.get(t),a=r.finalDecision?.action||"Avoid";b.total++;if(a==="Strong Buy")b.strongBuy++;else if(a==="Buy")b.buy++;else if(a==="Watch")b.watch++;else b.avoid++;b.scoreTotal+=Number(r.tradeSetupScore||r.score||0);const rank=(a==="Strong Buy"?4:a==="Buy"?3:a==="Watch"?1:0)*1000+relativeCapitalScore(r);if(rank>b.bestRank){b.bestRank=rank;b.bestSymbol=r.symbol}}return[...map.values()].map(b=>({...b,score:Math.round(b.scoreTotal/Math.max(1,b.total)),status:b.strongBuy||b.buy?"Leading":b.watch?"Mixed":"Weak"})).sort((a,b)=>b.score-a.score)}

const CACHE_KEY="__screenerBroadOpportunityCacheV2";
const CACHE_MS=30000;
async function buildBroadSnapshot(){
  const now=Date.now(),cached=globalThis[CACHE_KEY];
  if(cached?.rows&&now-cached.ts<CACHE_MS)return cached.rows;
  if(cached?.promise)return cached.promise;
  const promise=(async()=>{
    const broadSymbols=CORE_OPPORTUNITY_SYMBOLS.filter(s=>!EXCLUDED.has(s));
    const quotes=await fetchFmpQuotes([...broadSymbols,"SPY","QQQ"]),normalized=quotes.map(normalizeQuote).filter(q=>q.symbol&&q.price),spy=normalized.find(q=>q.symbol==="SPY"),qqq=normalized.find(q=>q.symbol==="QQQ");
    const broadQuotes=normalized.filter(q=>broadSymbols.includes(q.symbol));
    const fundamentalMap=await fetchFmpFundamentals(broadQuotes.map(q=>q.symbol));
    let rows=broadQuotes.map(q=>scoreQuote(mergeFundamentals({...q,spyDayChangePct:spy?.dayChangePct??null,qqqDayChangePct:qqq?.dayChangePct??null},fundamentalMap)));
    const eventRiskMap=await fetchEventRiskMap(rows.map(r=>r.symbol));
    rows=rows.map(r=>applyEventRiskGate(r,eventRiskMap.get(r.symbol)));
    rows=finalizeBroadOpportunityDecisions(rows);
    globalThis[CACHE_KEY]={ts:Date.now(),rows,promise:null};
    return rows;
  })();
  globalThis[CACHE_KEY]={ts:cached?.ts||0,rows:cached?.rows||null,promise};
  try{return await promise}catch(err){globalThis[CACHE_KEY]={ts:cached?.ts||0,rows:cached?.rows||null,promise:null};throw err}
}

export default async function handler(req,res){
  try{
    res.setHeader("Cache-Control","no-store, max-age=0");
    const themeKey=String(req.query.theme||"opportunities").toLowerCase(),config=getThemeConfig(themeKey),now=Date.now();
    const snapshot=await buildBroadSnapshot(),priorState=readStrongBuyState(req,now),hysteresis=applyStrongBuyHysteresis(snapshot,priorState,now),broadRows=hysteresis.rows;
    writeStrongBuyState(res,hysteresis.state);
    const themeLeadership=buildThemeLeadership(broadRows);
    const isBroad=themeKey==="opportunities"||themeKey==="broad";
    const selectedSymbols=new Set(config.symbols.filter(s=>!EXCLUDED.has(s)));
    const rows=isBroad?broadRows:broadRows.filter(r=>selectedSymbols.has(r.symbol));
    const fundamentalsComplete=rows.filter(r=>r.fundamentalDataStatus==="complete").length;
    return res.status(200).json({stocks:rows,themeLeadership,selectedTheme:{key:themeKey,name:config.name,description:config.description||"Focused research list filtered from the authoritative broad opportunity decisions."},meta:{mode:"expert_decision_v9_stateful_strong_buy_hysteresis",universeSize:CORE_OPPORTUNITY_SYMBOLS.filter(s=>!EXCLUDED.has(s)).length,returned:rows.length,strongBuys:rows.filter(r=>r.finalDecision?.action==="Strong Buy").length,retainedStrongBuys:rows.filter(r=>r.finalDecision?.source==="strong-buy-retention").length,buys:rows.filter(r=>r.finalDecision?.action==="Buy").length,watches:rows.filter(r=>r.finalDecision?.action==="Watch").length,qualifiedWatches:rows.filter(r=>r.finalDecision?.priority==="Qualified Watch").length,fundamentalsComplete,fundamentalsIncomplete:rows.length-fundamentalsComplete}});
  }catch(err){console.error("api/top5 error:",err);return res.status(500).json({error:"Failed to load trade screen.",detail:err.message||"Unknown error."})}
}
