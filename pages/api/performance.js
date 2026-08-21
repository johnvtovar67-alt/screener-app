import { put, list, get } from '@vercel/blob';

export const config={api:{bodyParser:{sizeLimit:'8mb'}}};

const STORE='screener-performance-ledger.json';
const DAYS=[1,5,10,20];
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const dayKey=ts=>new Date(ts).toISOString().slice(0,10);
const hasToken=()=>Boolean(process.env.BLOB_READ_WRITE_TOKEN);

async function readLedger(){
  if(!hasToken())return {records:[],warning:'BLOB_READ_WRITE_TOKEN is not configured.'};
  try{
    const {blobs}=await list({prefix:STORE,limit:1});
    const blob=blobs.find(b=>b.pathname===STORE)||blobs[0];
    if(!blob)return {records:[]};
    const result=await get(blob.url);
    if(!result)return {records:[]};
    const text=await new Response(result.stream).text();
    const parsed=JSON.parse(text);
    return {records:Array.isArray(parsed?.records)?parsed.records:[]};
  }catch(e){return {records:[],warning:`ledger read failed: ${e.message}`};}
}

async function writeLedger(records){
  if(!hasToken())return {ok:false,warning:'BLOB_READ_WRITE_TOKEN is not configured.'};
  try{
    const blob=await put(STORE,JSON.stringify({version:1,updatedAt:new Date().toISOString(),records}),{
      access:'private',
      allowOverwrite:true,
      addRandomSuffix:false,
      contentType:'application/json',
      cacheControlMaxAge:60,
    });
    return {ok:true,url:blob.url};
  }catch(e){return {ok:false,warning:`ledger write failed: ${e.message}`};}
}

function summarize(records){
  const entries=records.filter(r=>['Buy','Strong Buy'].includes(r.action));
  const byAction={};
  for(const action of['Buy','Strong Buy']){
    const a=entries.filter(r=>r.action===action);byAction[action]={signals:a.length};
    for(const d of DAYS){const vals=a.map(r=>r.forward?.[d]).filter(Number.isFinite);byAction[action][`d${d}`]={observations:vals.length,avgReturnPct:vals.length?vals.reduce((x,y)=>x+y,0)/vals.length:null,winRatePct:vals.length?vals.filter(x=>x>0).length/vals.length*100:null};}
  }
  return{signals:entries.length,byAction};
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const ledger=await readLedger();
  if(req.method==='GET')return res.status(200).json({records:ledger.records.slice(-500),summary:summarize(ledger.records),warning:ledger.warning||null,persistentStorage:hasToken()});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const rows=Array.isArray(req.body?.stocks)?req.body.stocks:[],now=req.body?.timestamp||new Date().toISOString(),today=dayKey(now);let records=[...ledger.records];
  for(const s of rows){
    const symbol=String(s.symbol||s.ticker||'').toUpperCase(),action=s.finalDecision?.action||s.recommendation?.displayLabel||s.action,price=n(s.price||s.currentPrice);if(!symbol||!price)continue;
    for(const r of records.filter(x=>x.symbol===symbol&&['Buy','Strong Buy'].includes(x.action))){const age=Math.floor((new Date(today)-new Date(r.day))/86400000);for(const d of DAYS)if(age>=d&&r.forward?.[d]==null){r.forward=r.forward||{};r.forward[d]=(price/r.price-1)*100;}}
    if(['Buy','Strong Buy'].includes(action)&&!records.some(r=>r.symbol===symbol&&r.day===today&&r.action===action))records.push({id:`${today}:${symbol}:${action}`,day:today,timestamp:now,symbol,action,price,theme:s.primaryTheme||s.theme||'Other',capitalScore:n(s.finalDecision?.relativeCapitalScore||s.capitalScore),tradeSetupScore:n(s.tradeSetupScore),entryQuality:s.recommendation?.entryQualityLabel||s.technicalSnapshot?.entryQualityLabel||null,forward:{}});
  }
  records=records.slice(-5000);
  const write=await writeLedger(records);
  if(!write.ok)console.warn('performance ledger persistence:',write.warning);
  return res.status(200).json({persisted:write.ok,records:records.length,summary:summarize(records),warning:ledger.warning||write.warning||null,persistentStorage:hasToken()});
}
