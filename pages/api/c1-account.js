import {applyC1OpeningPlan} from '../../lib/c1AccountDecision';
import {collectC1AccountOpening} from '../../lib/c1AccountOpeningProvider';
import {planC1ContinuedAccountOpening} from '../../lib/c1AccountExecution';
import {createHash} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {readStoredC1DatedBook} from '../../lib/c1DatedBookStore';
import {adoptC1Account,evaluateC1Account,appendC1AccountSession,pendingC1AccountSession} from '../../lib/c1AccountService';
export const config={api:{bodyParser:{sizeLimit:'1mb'}},maxDuration:60};
const storage={
 async read(path){const r=await get(path,{access:'private',useCache:false});if(!r)return null;if(r.statusCode!==200||!r.blob?.etag)throw new Error('Account storage unavailable');return {record:JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};},
 async write(path,record,etag){return put(path,JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:0});}
};
export function createC1AccountHandler({store=storage,readBook=readStoredC1DatedBook,clock=()=>new Date(),collectOpening=collectC1AccountOpening,environment=process.env.VERCEL_ENV||'local',commit=process.env.VERCEL_GIT_COMMIT_SHA||'local'}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  const auth=String(req.headers.authorization||''),key=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))return res.status(401).json({error:'Your portfolio sync key is required.'});
  const scope=environment==='production'?'production':`preview-${commit}`;
  const path=`c1-accounts-v1/${scope}/${createHash('sha256').update(key).digest('hex')}.json`;
  try{
   const now=clock(),saved=await store.read(path);
   if(req.method==='GET'&&!saved)return res.status(404).json({error:'No C1 account has been initialized.'});
   // Read only: this endpoint cannot initialize or refresh the index provider.
   const {record:book}=await readBook('sp500',{now});
   let account=saved?.record;
   if(req.method==='POST'){
    if(req.body?.operation==='adopt'){
     if(saved)return res.status(409).json({error:'The existing C1 account cannot be reset.'});
     account=adoptC1Account({portfolio:req.body.portfolio,capitalRecord:req.body.capitalRecord,book,now,prospectiveLegacyAdoptionConfirmed:req.body.prospectiveLegacyAdoptionConfirmed===true});
    }else if(req.body?.operation==='record-session'&&saved){
     account=appendC1AccountSession({account,record:req.body.record,book,expectedRevision:req.body.expectedRevision,now});
    }else return res.status(400).json({error:'Valid account operation required.'});
   }
   let decision=evaluateC1Account({account,book,now});
   const pendingSession=pendingC1AccountSession({account,book,now});
   if(req.method==='POST')await store.write(path,account,saved?.etag);
   let openingPlan=null,openingError=null;
   if(!pendingSession&&decision.current){
    try{
     const sessions=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate),baseline=sessions.at(-1);
     const symbols=decision.requiredOpeningSymbols;
     const opening=await collectOpening({baseline,symbols,now});
     if(opening){openingPlan=planC1ContinuedAccountOpening({adoption:account.adoption,sessions,records:account.records,opening,observedAt:opening.receipt.observedAt});openingPlan.providerVerified=true;openingPlan.sourceReceipt=opening.receipt;decision=applyC1OpeningPlan(decision,openingPlan);}
    }catch(error){openingError=String(error?.message||'Opening plan unavailable').slice(0,200);}
   }
   return res.status(200).json({decision,pendingSession,openingPlan,openingError});
  }catch(error){return res.status(409).json({error:String(error?.message||'Account analysis unavailable').slice(0,240),executable:false});}
 };
}
export default createC1AccountHandler();
