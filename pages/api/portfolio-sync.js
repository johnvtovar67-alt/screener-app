import {put,list,get} from '@vercel/blob';
import {createHash} from 'crypto';

// Redeployed after the project Blob store was connected so production picks up storage credentials.
export const config={api:{bodyParser:{sizeLimit:'1mb'}}};
const PREFIX='portfolio-sync/';
const keyFrom=req=>{const h=String(req.headers.authorization||'');return h.startsWith('Bearer ')?h.slice(7).trim():'';};
const validKey=k=>/^[A-Za-z0-9_-]{32,128}$/.test(k);
const pathname=k=>`${PREFIX}${createHash('sha256').update(k).digest('hex')}.json`;
const cleanDate=v=>{if(!v)return null;const t=new Date(v);return Number.isFinite(t.getTime())?t.toISOString():null;};
const cleanNumber=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f;};
function cleanPortfolio(rows=[]){
  if(!Array.isArray(rows))return[];
  return rows.slice(0,100).map(p=>({
    symbol:String(p?.symbol||'').toUpperCase().trim().slice(0,12),
    shares:cleanNumber(p?.shares),
    avgCost:cleanNumber(p?.avgCost),
    role:String(p?.role||'Swing')==='Core'?'Core':'Swing',
    openedAt:cleanDate(p?.openedAt),
    lastTradeAt:cleanDate(p?.lastTradeAt),
    winnerHistory:p?.winnerHistory&&typeof p.winnerHistory==='object'?{
      trimCount:cleanNumber(p.winnerHistory.trimCount),
      trimmedShares:cleanNumber(p.winnerHistory.trimmedShares),
      originalShares:cleanNumber(p.winnerHistory.originalShares),
      lastTrimAt:cleanDate(p.winnerHistory.lastTrimAt),
      lastTrimPrice:p.winnerHistory.lastTrimPrice==null?null:cleanNumber(p.winnerHistory.lastTrimPrice),
      lastTrimExtension:p.winnerHistory.lastTrimExtension==null?null:cleanNumber(p.winnerHistory.lastTrimExtension)
    }:{}
  })).filter(p=>p.symbol&&p.shares>=0);
}
async function readPortfolio(key){
  const path=pathname(key),{blobs}=await list({prefix:path,limit:1}),blob=blobs.find(b=>b.pathname===path)||null;
  if(!blob)return null;
  const result=await get(blob.url);if(!result)return null;
  const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
  return parsed&&Array.isArray(parsed.portfolio)?parsed:null;
}
async function writePortfolio(key,portfolio){
  const payload={version:1,updatedAt:new Date().toISOString(),portfolio:cleanPortfolio(portfolio)};
  await put(pathname(key),JSON.stringify(payload),{access:'private',allowOverwrite:true,addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
  return payload;
}
async function storageHealth(){
  try{await list({prefix:'portfolio-sync-health/',limit:1});return{ok:true};}
  catch(e){return{ok:false,error:e.message||'Blob storage unavailable'};}
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='GET'&&String(req.query.health||'')==='1'){
    const health=await storageHealth();
    return res.status(health.ok?200:503).json({storageReady:health.ok,error:health.ok?null:health.error});
  }
  const key=keyFrom(req);if(!validKey(key))return res.status(401).json({error:'A valid portfolio sync key is required.'});
  try{
    if(req.method==='GET'){
      const payload=await readPortfolio(key);if(!payload)return res.status(404).json({error:'No synced portfolio exists for this key.'});
      return res.status(200).json(payload);
    }
    if(req.method==='PUT'){
      if(!Array.isArray(req.body?.portfolio))return res.status(400).json({error:'portfolio must be an array.'});
      const payload=await writePortfolio(key,req.body.portfolio);
      return res.status(200).json({ok:true,updatedAt:payload.updatedAt,count:payload.portfolio.length});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error('portfolio sync:',e.message);
    return res.status(500).json({error:'Portfolio sync failed.',detail:e.message});
  }
}
