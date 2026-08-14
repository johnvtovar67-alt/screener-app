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

const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const uniqueSymbols=a=>[...new Set((a||[]).map(normalizeSymbol).filter(Boolean))];
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
  opportunities:{name:"Best Opportunities",description:"Fresh-capital screen using absolute qualification followed by relative capital ranking.",symbols:CORE_OPPORTUNITY_SYMBOLS},
  broad:{name:"Best Opportunities",description:"Fresh-capital screen using absolute qualification followed by relative capital ranking.",symbols:CORE_OPPORTUNITY_SYMBOLS},
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
  // Momentum/trigger scoring must compare a full-day-equivalent volume pace to avgVolume.
  // The expert hard gate still receives actual accumulated volume and applies its own paced ratio.
  const scoringInput={...n,volume:projectedFullDayVolume(n)};
  const score=compositeScore(scoringInput),fundamentalScore=calcFundamentalScore(scoringInput),technicalScore=calcTechnicalScore(scoringInput),momentumScore=calcMomentumScore(scoringInput),relativeStrengthScore=calcRelativeStrengthScore(scoringInput),asymmetryScore=calcAsymmetryScore(scoringInput),triggerScore=calcTriggerScore(scoringInput),technicalSnapshot=buildTechnicalSnapshot(scoringInput),fundamentalSnapshot=buildFundamentalSnapshot(scoringInput);
  const raw=getRecommendation({...scoringInput,score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore});
  const recommendation=applyExpertDecision({...n,score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore},raw);
  return{...n,score,compositeScore:score,heatScore:score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,asymmetryScore,triggerScore,primaryTheme:PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other",theme:PRIMARY_THEME_BY_SYMBOL[n.symbol]||"Other",recommendation,riskPlan:recommendation.riskPlan??raw.riskPlan??null,technicalSnapshot,fundamentalSnapshot,expertDecision:recommendation.expertDecision,expertOverride:recommendation.expertOverride,expertOverrideReason:recommendation.expertOverrideReason,thesisScore:recommendation.thesisScore,tradeSetupScore:recommendation.tradeSetupScore,capitalScore:recommendation.capitalScore};
}
function buildThemeLeadership(rows=[]){const map=new Map();for(const r of rows){const t=r.primaryTheme||"Other";if(!map.has(t))map.set(t,{theme:t,total:0,strongBuy:0,buy:0,watch:0,avoid:0,scoreTotal:0,bestSymbol:r.symbol,bestRank:-1});const b=map.get(t),a=r.finalDecision?.action||"Avoid";b.total++;if(a==="Strong Buy")b.strongBuy++;else if(a==="Buy")b.buy++;else if(a==="Watch")b.watch++;else b.avoid++;b.scoreTotal+=Number(r.tradeSetupScore||r.score||0);const rank=(a==="Strong Buy"?4:a==="Buy"?3:a==="Watch"?1:0)*1000+relativeCapitalScore(r);if(rank>b.bestRank){b.bestRank=rank;b.bestSymbol=r.symbol}}return[...map.values()].map(b=>({...b,score:Math.round(b.scoreTotal/Math.max(1,b.total)),status:b.strongBuy||b.buy?"Leading":b.watch?"Mixed":"Weak"})).sort((a,b)=>b.score-a.score)}

export default async function handler(req,res){
  try{
    res.setHeader("Cache-Control","no-store, max-age=0");
    const themeKey=String(req.query.theme||"opportunities").toLowerCase(),config=getThemeConfig(themeKey),symbols=config.symbols.filter(s=>!EXCLUDED.has(s));
    const quotes=await fetchFmpQuotes([...symbols,"SPY","QQQ"]),normalized=quotes.map(normalizeQuote).filter(q=>q.symbol&&q.price),spy=normalized.find(q=>q.symbol==="SPY"),qqq=normalized.find(q=>q.symbol==="QQQ");
    let rows=normalized.filter(q=>symbols.includes(q.symbol)).map(q=>scoreQuote({...q,spyDayChangePct:spy?.dayChangePct??null,qqqDayChangePct:qqq?.dayChangePct??null}));
    const eventRiskMap=await fetchEventRiskMap(rows.map(r=>r.symbol));
    rows=rows.map(r=>applyEventRiskGate(r,eventRiskMap.get(r.symbol)));
    rows=finalizeBroadOpportunityDecisions(rows);
    const themeLeadership=buildThemeLeadership(rows);
    return res.status(200).json({stocks:rows,themeLeadership,selectedTheme:{key:themeKey,name:config.name,description:config.description||"Focused research list using the same final decision pipeline."},meta:{mode:"expert_decision_v5_authoritative",universeSize:symbols.length,returned:rows.length,strongBuys:rows.filter(r=>r.finalDecision?.action==="Strong Buy").length,buys:rows.filter(r=>r.finalDecision?.action==="Buy").length,watches:rows.filter(r=>r.finalDecision?.action==="Watch").length,qualifiedWatches:rows.filter(r=>r.finalDecision?.priority==="Qualified Watch").length}});
  }catch(err){console.error("api/top5 error:",err);return res.status(500).json({error:"Failed to load trade screen.",detail:err.message||"Unknown error."})}
}
