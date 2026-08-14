// pages/api/index.js

import {
  calcFundamentalScore, calcTechnicalScore, calcMomentumScore, calcRelativeStrengthScore,
  calcAsymmetryScore, calcTriggerScore, compositeScore, getRecommendation, getStage,
  buildTechnicalSnapshot, buildFundamentalSnapshot,
} from "../../lib/scoring";
import { applyExpertDecision } from "../../lib/expertDecision";
import { fetchEventRiskMap, applyEventRiskGate } from "../../lib/eventRisk";
import { projectedFullDayVolume } from "../../lib/marketSession";
import { finalizeStandaloneOpportunityDecision } from "../../lib/opportunityDecision";

const PRIMARY_THEME_BY_SYMBOL={
  NVDA:"AI Compute & Platforms",AMD:"AI Compute & Platforms",AVGO:"AI Compute & Platforms",ARM:"AI Compute & Platforms",MU:"AI Compute & Platforms",SMCI:"AI Compute & Platforms",DELL:"AI Compute & Platforms",HPE:"AI Compute & Platforms",PLTR:"AI Compute & Platforms",ORCL:"AI Compute & Platforms",MSFT:"AI Compute & Platforms",GOOGL:"AI Compute & Platforms",GOOG:"AI Compute & Platforms",META:"AI Compute & Platforms",AMZN:"AI Compute & Platforms",AAPL:"AI Compute & Platforms",
  ANET:"AI Networking",CSCO:"AI Networking",NTAP:"AI Networking",JNPR:"AI Networking",FFIV:"AI Networking",CIEN:"AI Networking",MRVL:"AI Networking",COHR:"AI Networking",AAOI:"AI Networking",
  CRWD:"Cybersecurity",PANW:"Cybersecurity",NET:"Cybersecurity",ZS:"Cybersecurity",DDOG:"Cybersecurity",SNOW:"Cybersecurity",MDB:"Cybersecurity",
  ETN:"Power & Electrification",PWR:"Power & Electrification",VRT:"Power & Electrification",FIX:"Power & Electrification",EME:"Power & Electrification",GEV:"Power & Electrification",CEG:"Power & Electrification",VST:"Power & Electrification",NRG:"Power & Electrification",TLN:"Power & Electrification",
  EQIX:"Digital Infrastructure",DLR:"Digital Infrastructure",AMT:"Digital Infrastructure",CCI:"Digital Infrastructure",XYL:"Digital Infrastructure",WTS:"Digital Infrastructure",HUBB:"Digital Infrastructure",NVT:"Digital Infrastructure",
  CCJ:"Nuclear / Baseload",UEC:"Nuclear / Baseload",UUUU:"Nuclear / Baseload",LEU:"Nuclear / Baseload",BWXT:"Nuclear / Baseload",SMR:"Nuclear / Baseload",OKLO:"Nuclear / Baseload",NNE:"Nuclear / Baseload",NXE:"Nuclear / Baseload",DNN:"Nuclear / Baseload",
  MSTR:"BTC / Digital Assets",MARA:"BTC / Digital Assets",RIOT:"BTC / Digital Assets",CLSK:"BTC / Digital Assets",IREN:"BTC / Digital Assets",WULF:"BTC / Digital Assets",HUT:"BTC / Digital Assets",BTDR:"BTC / Digital Assets",CIFR:"BTC / Digital Assets",BITF:"BTC / Digital Assets",COIN:"BTC / Digital Assets",HOOD:"BTC / Digital Assets",SQ:"BTC / Digital Assets",
  RKLB:"Space & Satellites",ASTS:"Space & Satellites",RDW:"Space & Satellites",BKSY:"Space & Satellites",IRDM:"Space & Satellites",
  RTX:"Defense & National Security",LHX:"Defense & National Security",NOC:"Defense & National Security",LMT:"Defense & National Security",HII:"Defense & National Security",GD:"Defense & National Security",KTOS:"Defense & National Security",AVAV:"Autonomy & Drones",ONDS:"Autonomy & Drones",
  ROK:"Robotics & Automation",TER:"Robotics & Automation",CGNX:"Robotics & Automation",SYM:"Robotics & Automation",ISRG:"Robotics & Automation",
  ADSK:"Industrial Software",PTC:"Industrial Software",SNPS:"Industrial Software",CDNS:"Industrial Software",
  IONQ:"Quantum Computing",RGTI:"Quantum Computing",QBTS:"Quantum Computing",QUBT:"Quantum Computing",ARQQ:"Quantum Computing",IBM:"Quantum Computing",HON:"Quantum Computing",
  MRNA:"Platform Biotech",RXRX:"Platform Biotech",SDGR:"Platform Biotech",CRSP:"Platform Biotech",BEAM:"Platform Biotech",IOVA:"Platform Biotech",VKTX:"Platform Biotech",ALMS:"Platform Biotech",HIMS:"Platform Biotech",
};
const normalizeSymbol=s=>String(s||"").replace("-", ".").toUpperCase().trim();
const toFmpSymbol=s=>String(s||"").replace(".", "-").toUpperCase().trim();
const toNumber=(v,f=null)=>{if(v==null||v==="")return f;const n=Number(typeof v==="string"?v.replace("%","").replace(/,/g,"").trim():v);return Number.isFinite(n)?n:f};
const toPositiveNumber=(v,f=null)=>{const n=toNumber(v,f);return n!==null&&n>0?n:f};
function normalizeDailyPct({price,previousClose,change,rawPct}){let pct=toNumber(rawPct);if(price!=null&&previousClose!=null&&previousClose>0){const x=((price-previousClose)/previousClose)*100;if(pct===null||Math.abs(pct)>25||Math.abs(pct-x)>5)pct=x}if(pct===null&&change!=null&&previousClose!=null&&previousClose>0)pct=(change/previousClose)*100;return pct}
async function fetchJson(url){const response=await fetch(url);if(!response.ok){const text=await response.text().catch(()=>"");throw new Error(`FMP request failed: ${response.status}${text?` - ${text}`:""}`)}return response.json()}
function normalizeQuote(raw={},requestedSymbol=""){const symbol=normalizeSymbol(raw.symbol||requestedSymbol),price=toPositiveNumber(raw.price),previousClose=toPositiveNumber(raw.previousClose),change=toNumber(raw.change),dayChangePct=normalizeDailyPct({price,previousClose,change,rawPct:raw.changesPercentage??raw.changePercentage??raw.changePercent??raw.dayChangePct});return{symbol,ticker:symbol,name:raw.name||raw.companyName||symbol,companyName:raw.companyName||raw.name||symbol,price,currentPrice:price,lastPrice:price,close:price,previousClose,change,dayChangePct,changesPercentage:dayChangePct,changePercent:dayChangePct,volume:toPositiveNumber(raw.volume),avgVolume:toPositiveNumber(raw.avgVolume),marketCap:toPositiveNumber(raw.marketCap),priceAvg50:toPositiveNumber(raw.priceAvg50??raw.priceAvg50d),fiftyDayAverage:toPositiveNumber(raw.priceAvg50??raw.fiftyDayAverage),priceAvg200:toPositiveNumber(raw.priceAvg200??raw.priceAvg200d),twoHundredDayAverage:toPositiveNumber(raw.priceAvg200??raw.twoHundredDayAverage),yearHigh:toPositiveNumber(raw.yearHigh??raw.yearHighPrice),yearLow:toPositiveNumber(raw.yearLow??raw.yearLowPrice),eps:toNumber(raw.eps),pe:toNumber(raw.pe??raw.peRatio),beta:toNumber(raw.beta,null),exchange:raw.exchange||raw.exchangeShortName||"",timestamp:raw.timestamp||null}}
async function fetchQuote(symbol){const apiKey=process.env.FMP_API_KEY;if(!apiKey)throw new Error("Missing FMP_API_KEY in environment variables.");const clean=toFmpSymbol(symbol),urls=[`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(clean)}&apikey=${apiKey}`,`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(clean)}?apikey=${apiKey}`];let lastError=null;for(const url of urls){try{const data=await fetchJson(url),quote=Array.isArray(data)?data[0]:data;if(quote&&(quote.symbol||quote.price)){const normalized=normalizeQuote(quote,symbol);if(normalized.symbol&&normalized.price!==null)return normalized}}catch(err){lastError=err}}throw new Error(lastError?.message||`No quote data returned for ${symbol}.`)}
const attachMarketRelativeData=(row,spy,qqq)=>({...row,spyDayChangePct:spy?.dayChangePct??null,qqqDayChangePct:qqq?.dayChangePct??null});
function buildScoredResult(base){
  const scoringInput={...base,volume:projectedFullDayVolume(base)};
  const fundamentalScore=calcFundamentalScore(scoringInput),technicalScore=calcTechnicalScore(scoringInput),momentumScore=calcMomentumScore(scoringInput),relativeStrengthScore=calcRelativeStrengthScore(scoringInput),asymmetryScore=calcAsymmetryScore(scoringInput),triggerScore=calcTriggerScore(scoringInput),score=compositeScore(scoringInput);
  const rawRecommendation=getRecommendation({...scoringInput,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore,score});
  const recommendation=applyExpertDecision({...base,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,triggerScore,score},rawRecommendation);
  const theme=PRIMARY_THEME_BY_SYMBOL[normalizeSymbol(base.symbol)]||"Other";
  return{...base,score,compositeScore:score,fundamentalScore,technicalScore,momentumScore,relativeStrengthScore,asymmetryScore,triggerScore,primaryTheme:theme,theme,recommendation,riskPlan:recommendation?.riskPlan??rawRecommendation?.riskPlan??null,stage:getStage(scoringInput),technicalSnapshot:buildTechnicalSnapshot(scoringInput),fundamentalSnapshot:buildFundamentalSnapshot(scoringInput),expertDecision:recommendation.expertDecision,expertOverride:recommendation.expertOverride,expertOverrideReason:recommendation.expertOverrideReason,thesisScore:recommendation.thesisScore,tradeSetupScore:recommendation.tradeSetupScore,capitalScore:recommendation.capitalScore};
}
export default async function handler(req,res){
  try{
    res.setHeader("Cache-Control","no-store, max-age=0");
    const symbol=String(req.query.symbol||"").trim().toUpperCase();if(!symbol)return res.status(400).json({error:"Missing symbol."});
    const[quote,spyQuote,qqqQuote]=await Promise.all([fetchQuote(symbol),fetchQuote("SPY").catch(()=>null),fetchQuote("QQQ").catch(()=>null)]);
    const base=attachMarketRelativeData(quote,spyQuote,qqqQuote),scored=buildScoredResult(base),eventRiskMap=await fetchEventRiskMap([symbol]),eventAdjusted=applyEventRiskGate(scored,eventRiskMap.get(normalizeSymbol(symbol))),result=finalizeStandaloneOpportunityDecision(eventAdjusted);
    if(!result?.symbol||result.price===null||result.price===undefined)throw new Error(`No usable quote data returned for ${symbol}.`);
    return res.status(200).json({stock:result,meta:{mode:"single_symbol_expert_model_v5_authoritative",note:"Single-symbol finalDecision is the standalone decision after event risk. Broad Opportunities may demote a standalone Buy to Qualified Watch based on relative capital attractiveness.",spyChange:spyQuote?.dayChangePct??null,qqqChange:qqqQuote?.dayChangePct??null}});
  }catch(err){console.error("api/index error:",err);return res.status(500).json({error:"Failed to analyze symbol.",detail:err.message||"Unknown error."})}
}
