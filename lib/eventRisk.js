// lib/eventRisk.js
// Pre-trade event check plus cross-name material catalyst awareness.

function normalizeSymbol(value) {return String(value || "").replace("-", ".").toUpperCase().trim();}
function isoDate(date) {return date.toISOString().slice(0, 10);}
function addDays(date, days) {const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next;}
function daysFromToday(dateText) {const today=new Date(),a=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()),d=new Date(`${String(dateText).slice(0,10)}T00:00:00Z`);return Number.isNaN(d.getTime())?null:Math.round((d.getTime()-a)/86400000);}
async function fetchJson(url) {const response=await fetch(url);if(!response.ok)throw new Error(`Event-risk request failed: ${response.status}`);return response.json();}
function asArray(value) {return Array.isArray(value)?value:value&&typeof value==="object"?[value]:[];}

const KNOWN_DEALS={
  IRDM:{acquirer:"Rocket Lab",acquirerSymbol:"RKLB",target:"Iridium Communications",announcedDate:"2026-06-28",expectedCloseDate:"2027-06-30",expectedCloseLabel:"mid-2027",referenceValue:54,cashPerShare:27,stockReferenceValue:27,collarLow:67.50,collarHigh:112.50,lowExchangeRatio:.4000,highExchangeRatio:.2400,structure:"$27 cash plus RKLB shares; the stock exchange ratio adjusts inside the $67.50-$112.50 RKLB collar.",source:"Definitive merger agreement"}
};
function knownDeal(symbol){return KNOWN_DEALS[normalizeSymbol(symbol)]||null;}
function baseRisk(symbol) {const deal=knownDeal(symbol);return {symbol,status:deal?"Blocked":"Clear",label:deal?"Pre-Trade: M&A Event":"Pre-Trade Check: Passed",detail:deal?"This company is subject to a definitive acquisition agreement. Treat it as a deal/spread position rather than a normal standalone fresh-capital setup.":"No near-term earnings or target-company M&A event was found.",blockNewCapital:Boolean(deal),reduceConviction:false,earningsDate:null,daysToEarnings:null,mergerEvent:deal?{...deal}:null,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:Boolean(deal),manualCheckRequired:false};}

// Bellwethers are economic-factor catalysts, not hard-coded substitutes for stock-level evidence.
// A catalyst can temporarily defer a marginal lifecycle exit, but never rescues a severely broken trade.
const FACTOR_BELLWETHERS={
  "AI Capex & Data Center":["NVDA","AVGO"],
  "Semiconductor Cycle":["NVDA","AVGO"],
  "Hardware Cycle":["NVDA"],
  "AI Networking":["NVDA","AVGO"]
};
const MACRO_PATTERNS=[
  {re:/fomc|federal reserve|fed rate|interest rate decision/i,label:"Federal Reserve decision",scope:"Macro"},
  {re:/consumer price|\bcpi\b/i,label:"CPI inflation report",scope:"Macro"},
  {re:/personal consumption|\bpce\b/i,label:"PCE inflation report",scope:"Macro"},
  {re:/nonfarm|employment report|payroll/i,label:"U.S. employment report",scope:"Macro"}
];
function eventTiming(row={}){return String(row.time||row.timing||row.when||row.reportTime||row.releaseTime||"").trim();}
function factorWeights(position={}){const raw=position.factorWeights&&typeof position.factorWeights==="object"?position.factorWeights:{};return raw;}
export async function fetchMaterialCatalystMap(positions=[]) {
  const apiKey=process.env.FMP_API_KEY,map=new Map(),today=new Date(),from=isoDate(today),to=isoDate(addDays(today,2));
  const clean=(positions||[]).map(p=>({symbol:normalizeSymbol(p.symbol||p.ticker),factorWeights:factorWeights(p)})).filter(p=>p.symbol);
  for(const p of clean)map.set(p.symbol,[]);
  if(!apiKey||!clean.length)return map;
  let earnings=[];
  try{earnings=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));}catch{}
  for(const p of clean){
    const relevant=[];
    for(const [factor,weightRaw] of Object.entries(p.factorWeights||{})){
      const weight=Number(weightRaw)||0;if(weight<.50)continue;
      const leaders=FACTOR_BELLWETHERS[factor]||[];
      for(const row of earnings){const leader=normalizeSymbol(row.symbol);if(!leaders.includes(leader)||leader===p.symbol)continue;const days=daysFromToday(row.date);if(days===null||days<0||days>1)continue;relevant.push({type:"Bellwether Earnings",symbol:leader,factor,factorWeight:weight,date:String(row.date).slice(0,10),days,timing:eventTiming(row),label:`${leader} earnings${days===0?" today":" tomorrow"}`,detail:`${leader} is a high-impact bellwether for ${factor}. Its results/guidance can materially change the factor read for ${p.symbol}.`,material:true});}
    }
    map.set(p.symbol,relevant);
  }
  // Macro events are attached to every Swing position because they can change discount-rate/risk appetite broadly.
  try{
    const econ=asArray(await fetchJson(`https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${apiKey}`));
    for(const row of econ){const text=`${row.event||row.name||row.title||""} ${row.country||""}`;const match=MACRO_PATTERNS.find(x=>x.re.test(text));if(!match)continue;const days=daysFromToday(row.date);if(days===null||days<0||days>1)continue;for(const p of clean){const arr=map.get(p.symbol)||[];arr.push({type:"Macro",scope:match.scope,date:String(row.date).slice(0,10),days,timing:eventTiming(row),label:`${match.label}${days===0?" today":" tomorrow"}`,detail:`Scheduled ${match.label} can materially change market risk appetite and should be separated from stock-specific evidence.`,material:true});map.set(p.symbol,arr);}}
  }catch{}
  return map;
}

export async function fetchEventRiskMap(symbols=[]) {
  const apiKey=process.env.FMP_API_KEY,clean=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],map=new Map(clean.map(symbol=>[symbol,baseRisk(symbol)]));
  if(!clean.length)return map;
  if(!apiKey){for(const symbol of clean){const current=map.get(symbol);map.set(symbol,{...current,status:"Manual",label:current.mergerEvent?"Pre-Trade: M&A Event":"Pre-Trade: Manual Check Required",detail:current.mergerEvent?`${current.detail} Earnings/other event verification is incomplete because the market-data API key is unavailable.`:"Event-risk data could not be verified because the market-data API key is unavailable. Do not deploy new capital until earnings/M&A risk is manually verified.",blockNewCapital:true,checkComplete:false,earningsCheckComplete:false,mergerCheckComplete:Boolean(current.mergerEvent),manualCheckRequired:true});}return map;}
  const now=new Date(),from=isoDate(addDays(now,-2)),to=isoDate(addDays(now,7));let earningsOk=false,mergerOk=false;
  try {const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));earningsOk=true;for(const row of rows){const symbol=normalizeSymbol(row.symbol);if(!map.has(symbol))continue;const days=daysFromToday(row.date);if(days===null||days< -2||days>7)continue;const current=map.get(symbol),critical=days>=-1&&days<=2,label=days===0?"Earnings Today":days===-1?"Earnings Just Reported":days>0?`Earnings in ${days} day${days===1?"":"s"}`:"Recent Earnings";map.set(symbol,{...current,status:critical?"Blocked":"Caution",label:`Pre-Trade: ${label}`,detail:critical?"Do not initiate new capital until the market has digested the earnings event.":"Near-term earnings risk lowers conviction. A normal partial Buy can remain valid, but a full-size Strong Buy should be reduced until the event passes.",blockNewCapital:critical||Boolean(current.mergerEvent),reduceConviction:!critical&&!current.mergerEvent,earningsDate:String(row.date).slice(0,10),daysToEarnings:days,earningsCheckComplete:true,manualCheckRequired:false});}} catch {earningsOk=false;}
  try {const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/mergers-acquisitions-latest?page=0&limit=1000&apikey=${apiKey}`));mergerOk=true;for(const row of rows){const target=normalizeSymbol(row.targetedSymbol);if(!map.has(target))continue;const current=map.get(target),known=knownDeal(target);map.set(target,{...current,status:"Blocked",label:"Pre-Trade: M&A Event",detail:"This company appears as an acquisition target. Treat it as an event/deal trade rather than a normal fresh-capital setup.",blockNewCapital:true,reduceConviction:false,mergerEvent:known?{...known}:{acquirer:row.companyName||row.symbol||"Acquirer",target:row.targetedCompanyName||target,transactionDate:row.transactionDate||null},mergerCheckComplete:true,manualCheckRequired:false});}} catch {mergerOk=false;}
  for(const symbol of clean){const current=map.get(symbol),known=Boolean(current.mergerEvent&&knownDeal(symbol));if(current.blockNewCapital&&current.mergerEvent){map.set(symbol,{...current,checkComplete:earningsOk&&(mergerOk||known),earningsCheckComplete:earningsOk,mergerCheckComplete:mergerOk||known,manualCheckRequired:!earningsOk});continue;}if(current.blockNewCapital)continue;if(!earningsOk||(!mergerOk&&!known)){map.set(symbol,{...current,status:"Manual",label:"Pre-Trade: Manual Check Required",detail:"Automated event-risk verification was incomplete. Do not deploy new capital until earnings, M&A, and major-news risk is manually verified.",blockNewCapital:true,checkComplete:false,earningsCheckComplete:earningsOk,mergerCheckComplete:mergerOk||known,manualCheckRequired:true});continue;}map.set(symbol,{...current,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true});}
  return map;
}

export function applyEventRiskGate(stock={},eventRisk=null) {
  const risk=eventRisk||{status:"Manual",label:"Pre-Trade: Manual Check Required",detail:"Event-risk data was unavailable. Do not deploy new capital until earnings, M&A, and major-news risk is manually verified.",blockNewCapital:true,reduceConviction:false,checkComplete:false,manualCheckRequired:true};
  const rec=stock.recommendation&&typeof stock.recommendation==="object"?stock.recommendation:{},current=String(rec.label||stock.action||"Avoid");let action=current;
  if(risk.blockNewCapital&&["Strong Buy","Buy"].includes(current))action="Watch";else if(risk.reduceConviction&&current==="Strong Buy")action="Buy";
  const downgraded=action!==current;let decisionWhy=rec.decisionWhy||rec.actionSummary||"";
  if(risk.mergerEvent)decisionWhy=`${risk.detail} New capital is blocked because standalone upside is no longer the correct decision framework.`;else if(risk.blockNewCapital&&downgraded)decisionWhy=`${risk.detail} Keep the setup on Watch until the event clears or verification is completed.`;else if(risk.reduceConviction&&downgraded)decisionWhy=`${risk.detail} Use partial size only until the event passes.`;else if(risk.manualCheckRequired&&["Strong Buy","Buy"].includes(current))decisionWhy=`${decisionWhy||"Actionable candidate."} Manual event verification is required before execution.`;
  return {...stock,action,eventRisk:risk,preTradeCheck:risk,recommendation:{...rec,label:action,displayLabel:action,recommendation:action,tradeAction:action,decisionTiming:["Strong Buy","Buy"].includes(action)?"Now":"Wait for Trigger",positionSize:action==="Strong Buy"?"Full":action==="Buy"?"Partial":"None",decisionWhy,actionSummary:decisionWhy,blockedBuyNow:risk.blockNewCapital&&downgraded,blockedReason:risk.blockNewCapital?risk.detail:"",eventRisk:risk,preTradeCheck:risk}};
}
