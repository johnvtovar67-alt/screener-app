import { put, list, get } from '@vercel/blob';
import {marketObservationSessionDay} from '../../lib/marketSession';

export const config={api:{bodyParser:{sizeLimit:'8mb'}}};
const STORE='screener-performance-ledger.json';
const DAYS=[1,2,3,5,10,20,40,60];
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const dayKey=ts=>new Date(ts).toISOString().slice(0,10);

async function readLedger(){
  try{
    const{blobs}=await list({prefix:STORE,limit:1}),blob=blobs.find(b=>b.pathname===STORE)||blobs[0];
    if(!blob)return{records:[]};
    const result=await get(blob.url,{access:'private',useCache:false});
    if(!result)return{records:[]};
    const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
    return{records:Array.isArray(parsed?.records)?parsed.records:[]};
  }catch(e){return{records:[],warning:`ledger read failed: ${e.message}`};}
}
async function writeLedger(records){
  try{
    const blob=await put(STORE,JSON.stringify({version:3,updatedAt:new Date().toISOString(),records}),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
    return{ok:true,url:blob.url};
  }catch(e){return{ok:false,warning:`ledger write failed: ${e.message}`};}
}
function summarize(records){
  const entries=records.filter(r=>r.recordType!=='state'&&['Buy','Strong Buy'].includes(r.action)&&r.source!=='user');
  const byAction={};
  for(const action of['Buy','Strong Buy']){
    const a=entries.filter(r=>r.action===action);byAction[action]={signals:a.length};
    for(const d of DAYS){const vals=a.map(r=>r.forward?.[d]).filter(Number.isFinite);byAction[action][`d${d}`]={observations:vals.length,avgReturnPct:vals.length?vals.reduce((x,y)=>x+y,0)/vals.length:null,winRatePct:vals.length?vals.filter(x=>x>0).length/vals.length*100:null};}
    const mae=a.map(r=>r.pathMaePct).filter(Number.isFinite),mfe=a.map(r=>r.pathMfePct).filter(Number.isFinite);
    byAction[action].path={observations:Math.min(mae.length,mfe.length),avgMaePct:mae.length?mae.reduce((x,y)=>x+y,0)/mae.length:null,avgMfePct:mfe.length?mfe.reduce((x,y)=>x+y,0)/mfe.length:null,immediateAdverseRatePct:mae.length?mae.filter(x=>x<=-2).length/mae.length*100:null};
  }
  const uniqueSymbols=new Set(entries.map(r=>r.symbol)).size,uniqueThemes=new Set(entries.map(r=>r.theme).filter(Boolean)).size;
  return{signals:entries.length,uniqueSymbols,uniqueThemes,byAction};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const ledger=await readLedger();
  if(req.method==='GET')return res.status(200).json({records:ledger.records.slice(-1000),summary:summarize(ledger.records),warning:ledger.warning||null,persistentStorage:!ledger.warning});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const rows=Array.isArray(req.body?.stocks)?req.body.stocks:[],now=req.body?.timestamp||new Date().toISOString(),today=marketObservationSessionDay(now)||dayKey(now);let records=[...ledger.records];
  for(const s of rows){
    const symbol=String(s.symbol||s.ticker||'').toUpperCase(),action=s.finalDecision?.action||s.recommendation?.displayLabel||s.action,price=n(s.price||s.currentPrice);if(!symbol||!price)continue;
    for(const r of records.filter(x=>x.symbol===symbol&&x.recordType!=='state'&&['Buy','Strong Buy'].includes(x.action))){
      const mark=(price/r.price-1)*100,age=Math.floor((new Date(today)-new Date(r.day))/86400000);r.forward=r.forward||{};
      for(const d of DAYS)if(age>=d&&r.forward[d]==null)r.forward[d]=mark;
      r.pathMaePct=Number.isFinite(r.pathMaePct)?Math.min(r.pathMaePct,mark):Math.min(0,mark);
      r.pathMfePct=Number.isFinite(r.pathMfePct)?Math.max(r.pathMfePct,mark):Math.max(0,mark);
      r.lastMarkPct=mark;r.lastMarkAt=now;r.daysObserved=Math.max(Number(r.daysObserved)||0,age);
    }
    if(['Buy','Strong Buy'].includes(action)&&!records.some(r=>r.recordType!=='state'&&r.symbol===symbol&&r.day===today&&r.action===action))records.push({id:`${today}:${symbol}:${action}`,recordType:'signal',day:today,timestamp:now,symbol,action,price,theme:s.primaryTheme||s.theme||'Other',source:s.signalSource||s.tradeSource||'screener',capitalScore:n(s.finalDecision?.relativeCapitalScore||s.capitalScore),tradeSetupScore:n(s.tradeSetupScore),entryQuality:s.recommendation?.entryQualityLabel||s.technicalSnapshot?.entryQualityLabel||null,dayChangePct:n(s.dayChangePct),vs50:n(s.expertDecision?.metrics?.vs50||s.recommendation?.expertDecision?.metrics?.vs50),extension:n(s.expertDecision?.metrics?.extension||s.recommendation?.expertDecision?.metrics?.extension),pathMaePct:0,pathMfePct:0,lastMarkPct:0,lastMarkAt:now,daysObserved:0,forward:{}});
    const metrics=s.expertDecision?.metrics||s.recommendation?.expertDecision?.metrics||{},fundamentalStatus=String(s.fundamentalDataStatus||s.recommendation?.fundamentalDataStatus||'').toLowerCase(),systemPaused=action==='Watch'&&(['deferred','unavailable'].includes(fundamentalStatus)||metrics.fundamentalsPass===false||metrics.quoteFreshnessPass===false),stateAction=systemPaused?'Paused':action;
    const stateRows=records.filter(r=>r.recordType==='state'&&r.signalState===true&&r.symbol===symbol),lastState=stateRows[stateRows.length-1],lastSessionDay=lastState?.sessionDay||marketObservationSessionDay(lastState?.timestamp||lastState?.day),actionable=['Buy','Strong Buy'].includes(stateAction),dailyConfirmation=actionable&&lastSessionDay!==today;
    if(['Strong Buy','Buy','Watch','Avoid','Paused'].includes(stateAction)&&(!lastState||lastState.action!==stateAction||dailyConfirmation))records.push({id:`state:${now}:${symbol}:${stateAction}`,recordType:'state',signalState:true,day:today,sessionDay:today,timestamp:now,symbol,action:stateAction,observedAction:action,price,theme:s.primaryTheme||s.theme||'Other',source:'screener-state',pauseReason:systemPaused?'Required market/fundamental data is temporarily incomplete.':null});
  }
  records=records.slice(-10000);const write=await writeLedger(records);if(!write.ok)console.warn('performance ledger persistence:',write.warning);
  return res.status(200).json({persisted:write.ok,records:records.length,summary:summarize(records),warning:ledger.warning||write.warning||null,persistentStorage:write.ok});
}
