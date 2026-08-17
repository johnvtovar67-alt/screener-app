// lib/eventRisk.js
// Pre-trade event check aligned to the simplified fresh-capital model.
// Event risk can reduce conviction, but it never creates a deprecated Starter state.

function normalizeSymbol(value) {return String(value || "").replace("-", ".").toUpperCase().trim();}
function isoDate(date) {return date.toISOString().slice(0, 10);}
function addDays(date, days) {const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next;}
function daysFromToday(dateText) {const today=new Date(),a=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()),d=new Date(`${String(dateText).slice(0,10)}T00:00:00Z`);return Number.isNaN(d.getTime())?null:Math.round((d.getTime()-a)/86400000);}
async function fetchJson(url) {const response=await fetch(url);if(!response.ok)throw new Error(`Event-risk request failed: ${response.status}`);return response.json();}
function asArray(value) {return Array.isArray(value)?value:value&&typeof value==="object"?[value]:[];}
function baseRisk(symbol) {return {symbol,status:"Clear",label:"Pre-Trade Check: Passed",detail:"No near-term earnings or target-company M&A event was found.",blockNewCapital:false,reduceConviction:false,earningsDate:null,daysToEarnings:null,mergerEvent:null,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true,manualCheckRequired:false};}

export async function fetchEventRiskMap(symbols=[]) {
  const apiKey=process.env.FMP_API_KEY,clean=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],map=new Map(clean.map(symbol=>[symbol,baseRisk(symbol)]));
  if(!clean.length)return map;
  if(!apiKey){for(const symbol of clean)map.set(symbol,{...baseRisk(symbol),status:"Manual",label:"Pre-Trade: Manual Check Required",detail:"Event-risk data could not be verified because the market-data API key is unavailable. Do not deploy new capital until earnings/M&A risk is manually verified.",blockNewCapital:true,checkComplete:false,earningsCheckComplete:false,mergerCheckComplete:false,manualCheckRequired:true});return map;}
  const now=new Date(),from=isoDate(addDays(now,-2)),to=isoDate(addDays(now,7));let earningsOk=false,mergerOk=false;
  try {
    const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));earningsOk=true;
    for(const row of rows){const symbol=normalizeSymbol(row.symbol);if(!map.has(symbol))continue;const days=daysFromToday(row.date);if(days===null||days< -2||days>7)continue;const current=map.get(symbol),critical=days>=-1&&days<=2,label=days===0?"Earnings Today":days===-1?"Earnings Just Reported":days>0?`Earnings in ${days} day${days===1?"":"s"}`:"Recent Earnings";map.set(symbol,{...current,status:critical?"Blocked":"Caution",label:`Pre-Trade: ${label}`,detail:critical?"Do not initiate new capital until the market has digested the earnings event.":"Near-term earnings risk lowers conviction. A normal partial Buy can remain valid, but a full-size Strong Buy should be reduced until the event passes.",blockNewCapital:critical,reduceConviction:!critical,earningsDate:String(row.date).slice(0,10),daysToEarnings:days,earningsCheckComplete:true,manualCheckRequired:false});}
  } catch {earningsOk=false;}
  try {
    const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/mergers-acquisitions-latest?page=0&limit=1000&apikey=${apiKey}`));mergerOk=true;
    for(const row of rows){const target=normalizeSymbol(row.targetedSymbol);if(!map.has(target))continue;const current=map.get(target);map.set(target,{...current,status:"Blocked",label:"Pre-Trade: M&A Event",detail:"This company appears as an acquisition target. Treat it as an event/deal trade rather than a normal fresh-capital setup.",blockNewCapital:true,reduceConviction:false,mergerEvent:{acquirer:row.companyName||row.symbol||"Acquirer",target:row.targetedCompanyName||target,transactionDate:row.transactionDate||null},mergerCheckComplete:true,manualCheckRequired:false});}
  } catch {mergerOk=false;}
  for(const symbol of clean){const current=map.get(symbol);if(current.blockNewCapital)continue;if(!earningsOk||!mergerOk){map.set(symbol,{...current,status:"Manual",label:"Pre-Trade: Manual Check Required",detail:"Automated event-risk verification was incomplete. Do not deploy new capital until earnings, M&A, and major-news risk is manually verified.",blockNewCapital:true,checkComplete:false,earningsCheckComplete:earningsOk,mergerCheckComplete:mergerOk,manualCheckRequired:true});continue;}map.set(symbol,{...current,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true});}
  return map;
}

export function applyEventRiskGate(stock={},eventRisk=null) {
  const risk=eventRisk||{status:"Manual",label:"Pre-Trade: Manual Check Required",detail:"Event-risk data was unavailable. Do not deploy new capital until earnings, M&A, and major-news risk is manually verified.",blockNewCapital:true,reduceConviction:false,checkComplete:false,manualCheckRequired:true};
  const rec=stock.recommendation&&typeof stock.recommendation==="object"?stock.recommendation:{},current=String(rec.label||stock.action||"Avoid");
  let action=current;
  if(risk.blockNewCapital&&["Strong Buy","Buy"].includes(current))action="Watch";
  else if(risk.reduceConviction&&current==="Strong Buy")action="Buy";
  const downgraded=action!==current;
  let decisionWhy=rec.decisionWhy||rec.actionSummary||"";
  if(risk.blockNewCapital&&downgraded)decisionWhy=`${risk.detail} Keep the setup on Watch until the event clears or verification is completed.`;
  else if(risk.reduceConviction&&downgraded)decisionWhy=`${risk.detail} Use partial size only until the event passes.`;
  else if(risk.manualCheckRequired&&["Strong Buy","Buy"].includes(current))decisionWhy=`${decisionWhy||"Actionable candidate."} Manual event verification is required before execution.`;
  return {...stock,action,eventRisk:risk,preTradeCheck:risk,recommendation:{...rec,label:action,displayLabel:action,recommendation:action,tradeAction:action,decisionTiming:["Strong Buy","Buy"].includes(action)?"Now":"Wait for Trigger",positionSize:action==="Strong Buy"?"Full":action==="Buy"?"Partial":"None",decisionWhy,actionSummary:decisionWhy,blockedBuyNow:risk.blockNewCapital&&downgraded,blockedReason:risk.blockNewCapital?risk.detail:"",eventRisk:risk,preTradeCheck:risk}};
}
