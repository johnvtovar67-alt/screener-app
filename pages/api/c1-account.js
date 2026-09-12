import {saveC1AccountUpdate,isC1AccountSaveConflict} from '../../lib/c1AccountSave';
import {collectC1HeldRankReviews} from '../../lib/c1HeldRankProvider';
import {c1AccountReviewBook} from '../../lib/c1HeldRankReview';
import {buildC1ManualRecommendations} from '../../lib/c1ManualRecommendations';
import {applyC1OpeningPlan} from '../../lib/c1AccountDecision';
import {c1AccountBook} from '../../lib/c1AccountInput';
import {collectC1HoldingCoverage,missingC1HoldingPrices} from '../../lib/c1HoldingCoverage';
import {collectC1AccountOpening} from '../../lib/c1AccountOpeningProvider';
import {planC1ContinuedAccountOpening} from '../../lib/c1AccountExecution';
import {createHash} from 'node:crypto';
import {get,put} from '@vercel/blob';
import {readStoredC1DatedBook} from '../../lib/c1DatedBookStore';
import {importC1PositionContext,correctC1AccountOpenedAt,adoptC1Account,evaluateC1Account,appendC1AccountSession,pendingC1AccountSession} from '../../lib/c1AccountService';
export const config={api:{bodyParser:{sizeLimit:'1mb'}},maxDuration:90};
const storage={
 async read(path){const r=await get(path,{access:'private',useCache:false});if(!r)return null;if(r.statusCode!==200||!r.blob?.etag)throw new Error('Account storage unavailable');return {record:JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};},
 async write(path,record,etag){return put(path,JSON.stringify(record),{access:'private',addRandomSuffix:false,allowOverwrite:Boolean(etag),...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:0});}
};
export function createC1AccountHandler({store=storage,readBook=readStoredC1DatedBook,clock=()=>new Date(),collectOpening=collectC1AccountOpening,collectHoldings=collectC1HoldingCoverage,collectRanks=collectC1HeldRankReviews,environment=process.env.VERCEL_ENV||'local',commit=process.env.VERCEL_GIT_COMMIT_SHA||'local'}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});}
  const auth=String(req.headers.authorization||''),key=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!/^[A-Za-z0-9_-]{32,128}$/.test(key))return res.status(401).json({error:'Your portfolio sync key is required.'});
  const scope=environment==='production'?'production':`preview-${commit}`;
  const path=`c1-accounts-v1/${scope}/${createHash('sha256').update(key).digest('hex')}.json`;
  try{
   const now=clock(),saved=await store.read(path);
   if((req.method==='GET'||req.body?.operation==='refresh-analysis')&&!saved)return res.status(404).json({error:'No C1 account has been initialized.'});
   // Read only: this endpoint cannot initialize or refresh the index provider.
   const {record:book}=await readBook('sp500',{now});
   let account=saved?.record;
   // Complete only the next account session's holding observations. These
   // remain private account inputs and cannot initialize or alter index data.
   if(account){
    const previous=evaluateC1Account({account,book,now});
    const next=book.model.sessions.find(s=>s.date>previous.sourceSessionDate);
    if(next&&missingC1HoldingPrices(previous.positions.map(p=>({...p,role:'Swing'})),next).length){
     const existing=account.holdingCoverages||[account.holdingCoverage].filter(Boolean);
     if(!existing.some(c=>c.sourceSessionDate===next.date)){
      const supplement=await collectHoldings({portfolio:previous.positions.map(p=>({...p,role:'Swing'})),baseline:next,now});
      if(supplement.rows.some(r=>r.status!=='verified'))throw new Error('Next-session holding prices or classifications unavailable');
      account={...account,holdingCoverages:[...existing,supplement]};
      c1AccountBook(book,account.holdingCoverages);
     }
    }
   }
   if(req.method==='POST'){
    if(req.body?.operation==='adopt'){
     if(saved)return res.status(409).json({error:'The existing C1 account cannot be reset.'});
     const baseline=book.model.sessions.at(-1);
     let holdingCoverage;
     if(missingC1HoldingPrices(req.body.portfolio,baseline).length){
      holdingCoverage=await collectHoldings({portfolio:req.body.portfolio,baseline,now});
      const unavailable=holdingCoverage.rows.filter(r=>r.status!=='verified').map(r=>r.symbol);
      if(unavailable.length)return res.status(409).json({holdingCoverage,executable:false,error:'Dated adjusted holding prices or classifications unavailable: '+unavailable.join(', ')});
     }
     account=adoptC1Account({portfolio:req.body.portfolio,capitalRecord:req.body.capitalRecord,book,holdingCoverage,now,prospectiveLegacyAdoptionConfirmed:req.body.prospectiveLegacyAdoptionConfirmed===true});
    }else if(req.body?.operation==='record-position-context'&&saved){
     account=importC1PositionContext({account,context:req.body.context,expectedRevision:req.body.expectedRevision,book,now});
    }else if(req.body?.operation==='refresh-analysis'&&saved){
     // Refresh saves only newly verified private holding observations.
    }else if(req.body?.operation==='correct-opening-date'&&saved){
     account=correctC1AccountOpenedAt({account,symbol:req.body.symbol,openedAt:req.body.openedAt,expectedRevision:req.body.expectedRevision,book,now});
    }else if(req.body?.operation==='record-session'&&saved){
     account=appendC1AccountSession({account,record:req.body.record,book,expectedRevision:req.body.expectedRevision,now});
    }else return res.status(400).json({error:'Valid account operation required.'});
   }
   let holdingReviewError=null;
   if(req.method==='POST'&&['refresh-analysis','adopt','record-session'].includes(req.body?.operation)){
    const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
    const input=c1AccountBook(book,account.holdingCoverages||account.holdingCoverage),baseline=input.model.sessions.find(s=>s.date===through);
    const reviews=account.holdingRankReviews||[],existing=reviews.find(r=>r.sourceSessionDate===through);
    const positions=evaluateC1Account({account,book,now}).positions;
    const symbols=positions.filter(p=>p.inheritedRiskOnly&&!existing?.rows.some(r=>r.symbol===p.symbol)).map(p=>p.symbol);
    if(symbols.length&&through===book.model.sessions.at(-1).date){
     try{
      const review=await collectRanks({baseline,sourceHash:book.captures.find(c=>c.sessionDate===through)?.hash,symbols,now});
      if(review.rows.length){
       const combined={...review,rows:[...(existing?.rows||[]),...review.rows]};
       account={...account,revision:account.revision+1,holdingRankReviews:[...reviews.filter(r=>r.sourceSessionDate!==through),combined]};
       c1AccountReviewBook(input,account.holdingRankReviews);
      }
      if(review.unavailable.length)holdingReviewError=review.unavailable.map(r=>r.symbol+': '+r.reason).join(' ');
     }catch(error){
      const code=error?.message==='Holding momentum data provider is not configured'?'PROVIDER_NOT_CONFIGURED':error?.message==='Current bounded holding review required'?'REVIEW_SESSION_MISMATCH':'ACCOUNT_REVIEW_FAILURE';
      console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify({code,stage:'account-review'}));
      holdingReviewError='Holding momentum history is unavailable; recorded prices and stops remain under review.';
     }
    }else if(symbols.length){
     console.warn('C1_HELD_RANK_VERIFICATION',JSON.stringify({code:'ACCOUNT_SESSION_BEHIND',stage:'account-review'}));
    }
   }
   if(req.method==='POST')account=await saveC1AccountUpdate({store,path,saved,account,operation:req.body?.operation,context:req.body?.context,book,now});
   let decision=evaluateC1Account({account,book,now});
   const pendingSession=pendingC1AccountSession({account,book,now});
   let openingPlan=null,openingError=null;
   if(!pendingSession&&decision.current){
    try{
     const sessions=c1AccountReviewBook(c1AccountBook(book,(account.holdingCoverages||account.holdingCoverage)),account.holdingRankReviews).model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate),baseline=sessions.at(-1);
     const symbols=decision.requiredOpeningSymbols;
     const opening=await collectOpening({baseline,symbols,now});
     if(opening){openingPlan=planC1ContinuedAccountOpening({adoption:account.adoption,sessions,records:account.records,opening,observedAt:opening.receipt.observedAt});openingPlan.providerVerified=true;openingPlan.sourceReceipt=opening.receipt;openingPlan.quoteValidUntil=new Date(Math.min(...opening.prices.map(p=>Date.parse(p.observedAt)+120000))).toISOString();decision=applyC1OpeningPlan(decision,openingPlan);}
    }catch(error){openingError=String(error?.message||'Opening plan unavailable').slice(0,200);}
   }
   const manualRecommendations=buildC1ManualRecommendations({decision,pendingSession,openingPlan,openingError,now:clock()});
   return res.status(200).json({decision,pendingSession,openingPlan,openingError,manualRecommendations,holdingReviewError});
  }catch(error){const conflict=isC1AccountSaveConflict(error);return res.status(409).json({...(conflict?{code:'ACCOUNT_SAVE_CONFLICT'}:{}),error:conflict?'Another account update finished first. Reload the saved account and retry this change.':String(error?.message||'Account analysis unavailable').slice(0,240),executable:false});}
 };
}
export default createC1AccountHandler();
