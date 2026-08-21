// Persistent screener performance ledger backed by Vercel Blob REST API.
// Records recommendation state by symbol/day and later marks forward returns.
const STORE='screener-performance-ledger.json';
const DAYS=[1,5,10,20];
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const dayKey=ts=>new Date(ts).toISOString().slice(0,10);
const token=()=>process.env.BLOB_READ_WRITE_TOKEN||'';
const base=()=>process.env.BLOB_STORE_BASE_URL||'';
async function readLedger(){
  if(!token()||!base())return {records:[],warning:'Performance persistence requires BLOB_READ_WRITE_TOKEN and BLOB_STORE_BASE_URL.'};
  try{const r=await fetch(`${base().replace(/\/$/,'')}/${STORE}?t=${Date.now()}`,{cache:'no-store'});if(r.status===404)return{records:[]};if(!r.ok)throw new Error(`ledger read ${r.status}`);const x=await r.json();return{records:Array.isArray(x?.records)?x.records:[]};}catch(e){return{records:[],warning:e.message};}
}
async function writeLedger(records){
  if(!token()||!base())return false;
  const r=await fetch(`https://blob.vercel-storage.com/${STORE}`,{method:'PUT',headers:{Authorization:`Bearer ${token()}`,'x-content-type':'application/json','x-add-random-suffix':'0','x-cache-control-max-age':'0'},body:JSON.stringify({version:1,updatedAt:new Date().toISOString(),records})});
  return r.ok;
}
function summarize(records){
  const entries=records.filter(r=>['Buy','Strong Buy'].includes(r.action));
  const byAction={};for(const action of['Buy','Strong Buy']){const a=entries.filter(r=>r.action===action);byAction[action]={signals:a.length};for(const d of DAYS){const vals=a.map(r=>r.forward?.[d]).filter(Number.isFinite);byAction[action][`d${d}`]={observations:vals.length,avgReturnPct:vals.length?vals.reduce((x,y)=>x+y,0)/vals.length:null,winRatePct:vals.length?vals.filter(x=>x>0).length/vals.length*100:null};}}
  return{signals:entries.length,byAction};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  const ledger=await readLedger();
  if(req.method==='GET')return res.status(200).json({records:ledger.records.slice(-500),summary:summarize(ledger.records),warning:ledger.warning||null});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const rows=Array.isArray(req.body?.stocks)?req.body.stocks:[],now=req.body?.timestamp||new Date().toISOString(),today=dayKey(now);let records=[...ledger.records];
  for(const s of rows){const symbol=String(s.symbol||s.ticker||'').toUpperCase(),action=s.finalDecision?.action||s.recommendation?.displayLabel||s.action,price=n(s.price||s.currentPrice);if(!symbol||!price)continue;
    for(const r of records.filter(x=>x.symbol===symbol&&['Buy','Strong Buy'].includes(x.action))){const age=Math.floor((new Date(today)-new Date(r.day))/86400000);for(const d of DAYS)if(age>=d&&r.forward?.[d]==null){r.forward=r.forward||{};r.forward[d]=(price/r.price-1)*100;}}
    if(['Buy','Strong Buy'].includes(action)&&!records.some(r=>r.symbol===symbol&&r.day===today&&r.action===action))records.push({id:`${today}:${symbol}:${action}`,day:today,timestamp:now,symbol,action,price,theme:s.primaryTheme||s.theme||'Other',capitalScore:n(s.finalDecision?.relativeCapitalScore||s.capitalScore),tradeSetupScore:n(s.tradeSetupScore),entryQuality:s.recommendation?.entryQualityLabel||s.technicalSnapshot?.entryQualityLabel||null,forward:{}});
  }
  records=records.slice(-5000);const persisted=await writeLedger(records);return res.status(200).json({persisted,records:records.length,summary:summarize(records),warning:ledger.warning||(!persisted?'Ledger could not be persisted.':null)});
}