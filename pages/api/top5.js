// pages/api/top5.js

import {
  compositeScore, calcFundamentalScore, calcTechnicalScore, calcMomentumScore,
  calcRelativeStrengthScore, calcAsymmetryScore, calcTriggerScore,
  getRecommendation, buildTechnicalSnapshot, buildFundamentalSnapshot,
} from "../../lib/scoring";
import { applyExpertDecision } from "../../lib/expertDecision";
import { fetchEventRiskMap, applyEventRiskGate } from "../../lib/eventRisk";

function normalizeSymbol(s){return String(s||"").replace("-", ".").toUpperCase().trim();}
function toFmpSymbol(s){return String(s||"").replace(".", "-").toUpperCase().trim();}
function uniqueSymbols(a=[]){return [...new Set(a.map(normalizeSymbol).filter(Boolean))];}

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
const CORE_OPPORTUNITY_SYMBOLS=Object.keys(PRIMARY_THEME_BY_SYMBOL);
const EXCLUDED=new Set(["ABB","ABBNY"]);
const THEME_CONFIG={
  opportunities:{name:"Best Opportunities",description:"Fresh-capital screen. Expert gates can veto high raw scores when trend, participation, entry quality, or reward/risk is not confirmed.",symbols:CORE_OPPORTUNITY_SYMBOLS},
  broad:{name:"Best Opportunities",description:"Fresh-capital screen. Expert gates can veto high raw scores when trend, participation, entry quality, or reward/risk is not confirmed.",symbols:CORE_OPPORTUNITY_SYMBOLS},
  ai_compute:{name:"AI Compute & Platforms",symbols:THEMES["AI Compute & Platforms"]}, ai_networking:{name:"AI Networking",symbols:THEMES["AI Networking"]}, cybersecurity:{name:"Cybersecurity",symbols:THEMES.Cybersecurity}, power:{name:"Power & Electrification",symbols:THEMES["Power & Electrification"]}, digital_infra:{name:"Digital Infrastructure",symbols:THEMES["Digital Infrastructure"]}, nuclear:{name:"Nuclear / Baseload",symbols:THEMES["Nuclear / Baseload"]}, btc:{name:"BTC / Digital Assets",symbols:THEMES["BTC / Digital Assets"]}, defense:{name:"Defense & National Security",symbols:THEMES["Defense & National Security"]}, space:{name:"Space & Satellites",symbols:THEMES["Space & Satellites"]}, drones:{name:"Autonomy & Drones",symbols:THEMES["Autonomy & Drones"]}, robotics:{name:"Robotics & Automation",symbols:THEMES["Robotics & Automation"]}, industrial_software:{name:"Industrial Software",symbols:THEMES["Industrial Software"]}, quantum:{name:"Quantum Computing",symbols:THEMES["Quantum Computing"]}, biotech:{name:"Platform Biotech",symbols:THEMES["Platform Biotech"]},
};
function getThemeConfig(k){return THEME_CONFIG[String(k||"opportunities").toLowerCase()]||THEME_CONFIG.opportunities;}
function toNumber(v,f=null){if(v==null||v==="")return f;const n=Number(typeof v==="string"?v.replace("%","").replace(/,/g,"").trim():v);return Number.isFinite(n)?n:f;}
function toPositiveNumber(v,f=null){const n=toNumber(v,f);return n!=null&&n>0?n:f;}
function safeScore(v){return Number.isFinite(Number(v))?Number(v):0;}
function clampScore(v){return Math.max(0,Math.min(100,Math.round(safeScore(v))));}
function normalizeDailyPct({price,previousClose,change,rawPct}){let pct=toNumber(rawPct);if(price&&previousClose){const x=((price-previousClose)/previousClose)*100;if(pct===null||Math.abs(pct)>25||Math.abs(pct-x)>5)pct=x;}if(pct===null&&change!=null&&previousClose)pct=(change/previousClose)*100;return pct;}
function normalizeActionLabel(v){const x=String(v||"").replace(/[_-]+/g," ").replace(/\s+/g," ").trim().toUpperCase();if(["BUY","BUY NOW","BUY IMMEDIATELY","STRONG BUY"].includes(x))return"Buy";if(x.includes("STARTER")||x==="BREAKOUT")return"Starter";if(x.includes("WATCH")||x.includes("SETUP")||x==="NEAR MISS")return"Watch";return"Avoid";}
function getAction(s={}){const r=s.recommendation&&typeof s.recommendation==="object"?s.recommendation:{};return normalizeActionLabel(r.displayLabel??r.label??r.recommendation??r.tradeAction??s.action);}
function actionRank(x){const a=typeof x==="string"?x:getAction(x);return a==="Buy"?3:a==="Starter"?2:a==="Watch"?1:0;}
function getConvictionGrade(s={}){const score=clampScore(s.score),trigger=clampScore(s.triggerScore),momentum=clampScore(s.momentumScore),technical=clampScore(s.technicalScore),action=getAction(s),c=score*.42+trigger*.23+momentum*.2+technical*.15;if(action==="Buy"&&c>=86)return"A+";if(c>=82)return"A";if(c>=76)return"A-";if(c>=70)return"B+";if(c>=62)return"B";return"C";}
function getCatalyst(s={}){const e=s.recommendation?.expertDecision;if(e&&!e.buyPass&&e.trendStatus==="Not Confirmed")return"Reclaim Pending";const t=clampScore(s.triggerScore),m=clampScore(s.momentumScore),tech=clampScore(s.technicalScore),d=toNumber(s.dayChangePct,0);if(t>=78&&m>=70)return"Breakout";if(t>=76&&m>=70)return"Reclaim";if(tech>=76&&m>=72)return"RS Leader";if(d< -1&&tech>=65)return"Pullback";if(m>=70)return"Trend";return"Setup";}
function getDecisionClock(s={}){const a=getAction(s);if(a==="Buy")return"Immediate";if(a==="Starter")return"This Week";if(a==="Watch")return"Monitor";return"Avoid Until Improved";}
function themeFor(s){return PRIMARY_THEME_BY_SYMBOL[normalizeSymbol(s)]||"Other";}
async function fetchJson(url){const r=await fetch(url);if(!r.ok){const text=await r.text().catch(()=>"");throw new Error(`FMP request failed: ${r.status}${text?` - ${text}`:""}`);}return r.json();}
function chunks(a,size=20){const out=[];for(let i=0;i<a.length;i+=size)out.push(a.slice(i,i+size));return out;}
function asQuoteArray(data){if(Array.isArray(data))return data.filter(Boolean);if(data&&typeof data==="object")return [data];return [];}

async function fetchQuoteChunk(symbols,key){
  if(!symbols.length)return [];
  const joined=symbols.map(toFmpSymbol).join(",");
  const stable=`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(joined)}&apikey=${key}`;
  const legacy=`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(joined)}?apikey=${key}`;
  try{const rows=asQuoteArray(await fetchJson(stable));if(rows.length>=Math.min(symbols.length,2))return rows;}catch{}
  try{const rows=asQuoteArray(await fetchJson(legacy));if(rows.length>=Math.min(symbols.length,2))return rows;}catch{}

  // FMP batch endpoints can return an empty/partial set on some plans. Fall back
  // to individual requests so the broad opportunity screen never silently empties.
  const rows=[];
  for(const symbol of symbols){
    const clean=toFmpSymbol(symbol);
    try{
      const one=asQuoteArray(await fetchJson(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${key}`));
      if(one.length){rows.push(one[0]);continue;}
    }catch{}
    try{
      const one=asQuoteArray(await fetchJson(`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(clean)}?apikey=${key}`));
      if(one.length)rows.push(one[0]);
    }catch{}
  }
  return rows;
}

async function fetchFmpQuotes(symbols=[]){
  const key=process.env.FMP_API_KEY;
  if(!key)throw new Error("Missing FMP_API_KEY in environment variables.");
  const requested=uniqueSymbols(symbols), all=[];
  for(const c of chunks(requested,20)) all.push(...await fetchQuoteChunk(c,key));
  const bySymbol=new Map();
  for(const row of all){const symbol=normalizeSymbol(row?.symbol);if(symbol&&!bySymbol.has(symbol))bySymbol.set(symbol,row);}
  return [...bySymbol.values()];
}

function normalizeQuote(r={}){const symbol=normalizeSymbol(r.symbol),price=toPositiveNumber(r.price),previousClose=toPositiveNumber(r.previousClose),change=toNumber(r.change),dayChangePct=normalizeDailyPct({price,previousClose,change,rawPct:r.changesPercentage??r.changePercentage??r.changePercent});return{...r,symbol,ticker:symbol,name:r.name||r.companyName||symbol,companyName:r.companyName||r.name||symbol,price,currentPrice:price,lastPrice:price,close:price,previousClose,change,dayChangePct,changesPercentage:dayChangePct,changePercent:dayChangePct,marketCap:toPositiveNumber(r.marketCap),volume:toPositiveNumber(r.volume),avgVolume:toPositiveNumber(r.avgVolume),priceAvg50:toPositiveNumber(r.priceAvg50),fiftyDayAverage:toPositiveNumber(r.priceAvg50??r.fiftyDayAverage),priceAvg200:toPositiveNumber(r.priceAvg200),twoHundredDayAverage:toPositiveNumber(r.priceAvg200??r.twoHundredDayAverage),yearHigh:toPositiveNumber(r.yearHigh),yearLow:toPositiveNumber(r.yearLow),eps:toNumber(r.eps),pe:toNumber(r.pe),beta:toNumber(r.beta,null),exchange:r.exchange||r.exchangeShortName||"",timestamp:r.timestamp||null};}
function scoreQuote(n={}){const score=compositeScore(n),fundamentalScore=calcFundamentalScore(n),technicalScore=calcTechnicalScore(n),momentumScore=calcMomentumScore(n),relativeStrengthScore=calcRelativeStrengthScore(n),asymmetryScore=calcAsymmetryScore(n),triggerScore=calcTriggerScore(n),technicalSnapshot=buildTechnicalSnapshot(n),fundamentalSnapshot=buildFundamentalSnapshot(n);const raw=getRecommendation({...n,score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore});const recommendation=applyExpertDecision({...n,score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore},raw),action=normalizeActionLabel(recommendation.label);return{...n,score,compositeScore:score,heatScore:score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,asymmetryScore,triggerScore,primaryTheme:themeFor(n.symbol),theme:themeFor(n.symbol),recommendation:{...recommendation,label:action,displayLabel:action,recommendation:action,tradeAction:action,score,triggerScore,momentumScore},action,riskPlan:recommendation.riskPlan??raw.riskPlan??null,technicalSnapshot,fundamentalSnapshot,expertDecision:recommendation.expertDecision,expertOverride:recommendation.expertOverride,expertOverrideReason:recommendation.expertOverrideReason,thesisScore:recommendation.thesisScore,tradeSetupScore:recommendation.tradeSetupScore};}
function enrich(s={}){return{...s,convictionGrade:getConvictionGrade(s),catalyst:getCatalyst(s),decisionClock:getDecisionClock(s)};}
function rankScore(s={}){return actionRank(s)*1000+safeScore(s.tradeSetupScore)*2.5+safeScore(s.relativeStrengthScore)*1.4+safeScore(s.technicalScore)*1.2+safeScore(s.score);}
function sortTop(a,b){return rankScore(b)-rankScore(a);}
function buildThemeLeadership(rows=[]){const map=new Map();for(const r of rows){const t=r.primaryTheme||"Other";if(!map.has(t))map.set(t,{theme:t,key:Object.entries(THEME_CONFIG).find(([,x])=>x.name===t)?.[0]||"opportunities",total:0,buy:0,starter:0,watch:0,avoid:0,scoreTotal:0,bestSymbol:r.symbol,bestRank:-1});const b=map.get(t),a=getAction(r);b.total++;b[a.toLowerCase()]++;b.scoreTotal+=safeScore(r.tradeSetupScore??r.score);const rank=rankScore(r);if(rank>b.bestRank){b.bestRank=rank;b.bestSymbol=r.symbol;}}return [...map.values()].map(b=>({...b,score:Math.round(b.scoreTotal/Math.max(1,b.total)),status:b.buy?"Leading":b.starter?"Improving":b.watch?"Mixed":"Weak"})).sort((a,b)=>b.score-a.score);}

export default async function handler(req,res){try{res.setHeader("Cache-Control","no-store, max-age=0");const themeKey=String(req.query.theme||"opportunities").toLowerCase(),config=getThemeConfig(themeKey),symbols=config.symbols.filter(s=>!EXCLUDED.has(s));const quotes=await fetchFmpQuotes([...symbols,"SPY","QQQ"]),normalized=quotes.map(normalizeQuote).filter(q=>q.symbol&&q.price),spy=normalized.find(q=>q.symbol==="SPY"),qqq=normalized.find(q=>q.symbol==="QQQ");let rows=normalized.filter(q=>symbols.includes(q.symbol)).map(q=>scoreQuote({...q,spyDayChangePct:spy?.dayChangePct??null,qqqDayChangePct:qqq?.dayChangePct??null}));const eventRiskMap=await fetchEventRiskMap(rows.map(r=>r.symbol));rows=rows.map(r=>enrich(applyEventRiskGate(r,eventRiskMap.get(r.symbol)))).sort(sortTop);const themeLeadership=buildThemeLeadership(rows);return res.status(200).json({stocks:rows,themeLeadership,selectedTheme:{key:themeKey,name:config.name,description:config.description||"Focused research list using the same expert decision model."},meta:{mode:"expert_decision_v3",universeSize:symbols.length,returned:rows.length,expertOverrides:rows.filter(r=>r.expertOverride).length}});}catch(err){console.error("api/top5 error:",err);return res.status(500).json({error:"Failed to load trade screen.",detail:err.message||"Unknown error."});}}
