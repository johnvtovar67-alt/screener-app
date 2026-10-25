import {put,list,get} from '@vercel/blob';
import {createHash,randomUUID} from 'crypto';
import {cleanC1ControlState} from '../../lib/c1CapitalState';
import {isBlobPreconditionFailed} from '../../lib/blobErrors';
import {rejectUnauthorizedC1Owner} from '../../lib/c1OwnerAccess';

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
  const path=pathname(key);
  const result=await get(path,{access:'private',useCache:false,headers:{'accept-encoding':'identity'}});
  if(!result)return null;
  if(result.statusCode!==200||!result.blob?.etag)throw new Error('Portfolio storage identity unavailable');
  const text=await new Response(result.stream).text(),parsed=JSON.parse(text);
  if(!parsed||!Array.isArray(parsed.portfolio))throw new Error('Saved portfolio is invalid');
  return {...parsed,etag:result.blob.etag};
}
async function writePortfolio(key,portfolio,c1ControlState,expectedEtag){
  const saved=await readPortfolio(key);
  if(process.env.VERCEL_ENV==='production'&&!saved)throw Object.assign(new Error('New production accounts are disabled. Connect the existing saved account.'),{code:'PRODUCTION_ACCOUNT_CREATION_DISABLED'});
  if((saved?.etag||null)!==(expectedEtag||null))throw Object.assign(new Error('Portfolio changed on another device. Reload before applying this edit.'),{status:409});
  const payload={version:2,updatedAt:new Date().toISOString(),portfolio:cleanPortfolio(portfolio),c1ControlState:cleanC1ControlState(c1ControlState)};
  const result=await put(pathname(key),JSON.stringify(payload),{access:'private',allowOverwrite:Boolean(saved),...(saved?{ifMatch:saved.etag}:{}),addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:0});
  return {...payload,etag:result.etag};
}
async function storageHealth(){
  try{
    await list({prefix:'portfolio-sync-health/',limit:1});
    await get('portfolio-sync-health/nonexistent.json',{access:'private',useCache:false});
    return{ok:true};
  }catch{return{ok:false,error:'Blob storage unavailable'};}
}
function reportPortfolioFailure(res,stage,status){
  const requestId=randomUUID();res.setHeader('X-C1-Request-Id',requestId);
  // No SDK error, key, account path, holdings or request body enters this log.
  try{console.warn('PORTFOLIO_SYNC_FAILURE',JSON.stringify({requestId,code:'PORTFOLIO_STORAGE_UNAVAILABLE',status,stage}));}catch{}
  return requestId;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='GET'&&String(req.query.health||'')==='1'){
    const health=await storageHealth();if(!health.ok)reportPortfolioFailure(res,'storage-health',503);
    return res.status(health.ok?200:503).json({storageReady:health.ok,error:health.ok?null:health.error});
  }
  const key=keyFrom(req);if(!validKey(key))return res.status(401).json({error:'A valid portfolio sync key is required.'});
  if(['GET','PUT'].includes(req.method)&&rejectUnauthorizedC1Owner(res,{key,environment:process.env.VERCEL_ENV,surface:'portfolio'}))return;
  try{
    if(req.method==='GET'){
      const payload=await readPortfolio(key);if(!payload)return res.status(404).json({error:'No synced portfolio exists for this key.'});
      return res.status(200).json(payload);
    }
    if(req.method==='PUT'){
      if(!Array.isArray(req.body?.portfolio))return res.status(400).json({error:'portfolio must be an array.'});
      const payload=await writePortfolio(key,req.body.portfolio,req.body.c1ControlState,req.body.expectedEtag);
      return res.status(200).json({ok:true,updatedAt:payload.updatedAt,etag:payload.etag,count:payload.portfolio.length});
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    if(e.code==='PRODUCTION_ACCOUNT_CREATION_DISABLED')return res.status(403).json({error:'New production accounts are disabled. Connect the existing saved account.'});
    if(isBlobPreconditionFailed(e)||e.status===409||e.name==='BlobAlreadyExistsError')return res.status(409).json({error:'Portfolio changed on another device. Your local edit is retained. Reload the saved portfolio before retrying.'});
    const requestId=reportPortfolioFailure(res,req.method==='PUT'?'portfolio-save':'portfolio-read',500);
    return res.status(500).json({error:'Portfolio sync failed.',detail:'Saved portfolio verification is unavailable. Reload before retrying.',requestId});
  }
}
