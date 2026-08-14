// lib/eventRisk.js
// Pre-trade event check aligned to the simplified fresh-capital model.
// Event risk can reduce sizing/conviction, but never creates a deprecated Starter state.

function normalizeSymbol(value) {return String(value || "").replace("-", ".").toUpperCase().trim();}
function isoDate(date) {return date.toISOString().slice(0, 10);}
function addDays(date, days) {const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next;}
function daysFromToday(dateText) {const today=new Date(),a=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()),d=new Date(`${String(dateText).slice(0,10)}T00:00:00Z`);return Number.isNaN(d.getTime())?null:Math.round((d.getTime()-a)/86400000);}
async function fetchJson(url) {const response=await fetch(url);if(!response.ok)throw new Error(`Event-risk request failed: ${response.status}`);return response.json();}
function asArray(value) {return Array.isArray(value)?value:value&&typeof value==="object"?[value]:[];}
function baseRisk(symbol) {return {symbol,status:"Clear",label:"Pre-Trade Check: Passed",detail:"No near-term earnings or target-company M&A event was found.",blockFullPosition:false,earningsDate:null,daysToEarnings:null,mergerEvent:null,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true,manualCheckRequired:false};}

export async function fetchEventRiskMap(symbols=[]) {
  const apiKey=process.env.FMP_API_KEY,clean=[...new Set(symbols.map(normalizeSymbol).filter(Boolean))],map=new Map(clean.map(symbol=>[symbol,baseRisk(symbol)]));
  if(!clean.length)return map;
  if(!apiKey){for(const symbol of clean)map.set(symbol,{...baseRisk(symbol),status:"Manual",label:"Pre-Trade: Manual Check",detail:"Event-risk data could not be verified because the market-data API key is unavailable. Manually check earnings/M&A before execution.",checkComplete:false,earningsCheckComplete:false,mergerCheckComplete:false,manualCheckRequired:true});return map;}
  const now=new Date(),from=isoDate(addDays(now,-2)),to=isoDate(addDays(now,7));let earningsOk=false,mergerOk=false;
  try{
    const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${apiKey}`));earningsOk=true;
    for(const row of rows){const symbol=normalizeSymbol(row.symbol);if(!map.has(symbol))continue;const days=daysFromToday(row.date);if(days===null||days< -2||days>7)continue;const current=map.get(symbol),critical=days>=-1&&days<=2,label=days===0?"Earnings Today":days===-1?"Earnings Just Reported":days>0?`Earnings in ${days} day${days===1?"":"s"}`:"Recent Earnings";map.set(symbol,{...current,status:critical?"Blocked":"Caution",label:`Pre-Trade: ${label}`,detail:critical?"New capital is blocked until the market digests the earnings event.":"Near-term earnings risk reduces fresh-capital conviction; wait unless the setup remains exceptional after the event.",blockFullPosition:true,earningsDate:String(row.date).slice(0,10),daysToEarnings:days,earningsCheckComplete:true,manualCheckRequired:false});}
  }catch{earningsOk=false;}
  try{
    const rows=asArray(await fetchJson(`https://financialmodelingprep.com/stable/mergers-acquisitions-latest?page=0&limit=1000&apikey=${apiKey}`));mergerOk=true;
    for(const row of rows){const target=normalizeSymbol(row.targetedSymbol);if(!map.has(target))continue;const current=map.get(target);map.set(target,{...current,status:"Blocked",label:"Pre-Trade: M&A Event",detail:"This company appears as an acquisition target. Treat it as an event/deal trade rather than a normal fresh-capital setup.",blockFullPosition:true,mergerEvent:{acquirer:row.companyName||row.symbol||"Acquirer",target:row.targetedCompanyName||target,transactionDate:row.transactionDate||null},mergerCheckComplete:true,manualCheckRequired:false});}
  }catch{mergerOk=false;}
  for(const symbol of clean){const current=map.get(symbol);if(current.blockFullPosition)continue;if(!earningsOk||!mergerOk){map.set(symbol,{...current,status:"Manual",label:"Pre-Trade: Manual Check",detail:"Automated event-risk check was incomplete. Manually verify earnings, M&A, and major news before execution.",checkComplete:false,earningsCheckComplete:earningsOk,mergerCheckComplete:mergerOk,manualCheckRequired:true});continue;}map.set(symbol,{...current,status:"Clear",label:"Pre-Trade Check: Passed",detail:"No near-term earnings or target-company M&A event was found.",blockFullPosition:false,checkComplete:true,earningsCheckComplete:true,mergerCheckComplete:true,manualCheckRequired:false});}
  return map;
}

export function applyEventRiskGate(stock={},eventRisk=null) {
  const risk=eventRisk||{status:"Manual",label:"Pre-Trade: Manual Check",detail:"Event-risk data was unavailable. Manually check earnings, M&A, and major news before execution.",blockFullPosition:false,checkComplete:false,manualCheckRequired:true};
  const rec=stock.recommendation&&typeof stock.recommendation==="object"?stock.recommendation:{},current=String(rec.label||stock.action||"Avoid");
  let action=current;
  if(risk.blockFullPosition){if(current==="Strong Buy")action=risk.status==="Blocked"?"Watch":"Buy";else if(current==="Buy")action="Watch";}
  const downgraded=action!==current;
  const actionSummary=downgraded?`${risk.detail} ${action==="Buy"?"Use partial size only.":"No new capital until the event clears."}`:risk.manualCheckRequired&&["Strong Buy","Buy"].includes(current)?`${rec.actionSummary||"Actionable candidate."} Manual event check required before execution.`:rec.actionSummary;
  const entryNote=downgraded?`${risk.label}. ${action==="Buy"?"Partial size only; reassess after the event.":"Wait and reassess after the event is digested."}`:risk.manualCheckRequired&&["Strong Buy","Buy"].includes(current)?`${risk.label}. Verify earnings/M&A/news before execution.`:rec.entryNote;
  return {...stock,action,eventRisk:risk,preTradeCheck:risk,recommendation:{...rec,label:action,displayLabel:action,recommendation:action,tradeAction:action,actionSummary,entryNote,triggerNeeded:entryNote,blockedBuyNow:downgraded,blockedReason:downgraded?risk.detail:rec.blockedReason||"",eventRisk:risk,preTradeCheck:risk}};
}
