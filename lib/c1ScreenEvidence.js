import {classifyC1StockScreen} from './c1StockClassification';
import {c1AccountPolicyActive} from './c1AccountActions';

const symbolOf=row=>String(row?.symbol||row?.ticker||'').replace('-','.').toUpperCase().trim();
export function c1ScreenEvidenceKey(decision){
 const snapshot=decision?.stockScreen;
 return JSON.stringify([c1AccountPolicyActive(decision?.accountPolicy)?decision.actionVersion||decision.decisionId:String(decision?.decisionId||'').split(':')[0],snapshot||null]);
}

const CACHE_KEY='stock_screener_c1_screen_evidence_v1';
export function readC1ScreenEvidence(storage,decision){
 try{
  const saved=JSON.parse(storage.getItem(CACHE_KEY)||'null');
  const candidates=decision?.stockScreen?.candidates||[];
  return saved?.key===c1ScreenEvidenceKey(decision)&&saved.verified===true&&Array.isArray(saved.ratings)&&saved.ratings.length===candidates.length&&saved.ratings.every((r,i)=>r.symbol===candidates[i].symbol&&['Buy','Strong Buy','Watch'].includes(r.rating))?saved:null;
 }catch{return null;}
}
export function writeC1ScreenEvidence(storage,evidence){
 if(!evidence.verified)return;
 try{storage.setItem(CACHE_KEY,JSON.stringify({key:evidence.key,ratings:evidence.ratings,verified:true}));}catch{}
}

// Response membership is evidence coverage, never source eligibility. Keep the
// completed-source selection separate from current permission to deploy capital.
export function resolveC1ScreenEvidence({decision,rows=[],current=false,previous=null,reviewCurrent=false}={}){
 const snapshot=decision?.stockScreen,key=c1ScreenEvidenceKey(decision);
 const unified=c1AccountPolicyActive(decision?.accountPolicy),scanComplete=snapshot?.scan?.complete!==false;
 const retained=previous?.key===key&&previous.verified?previous:null;
 const symbols=new Set(rows.map(symbolOf));
 const missing=(snapshot?.candidates||[]).filter(c=>!symbols.has(c.symbol)).map(c=>c.symbol);
 const complete=scanComplete&&Boolean(current&&decision?.current&&snapshot?.sourceSessionDate===decision.sourceSessionDate&&(unified?Array.isArray(snapshot?.candidates):snapshot?.candidates?.length))&&missing.length===0&&rows.filter(r=>(snapshot?.candidates||[]).some(c=>c.symbol===symbolOf(r))).every(r=>!r.clientSnapshotFallback&&!r.dataFeedSnapshotStale&&Number(r.price??r.currentPrice??r.lastPrice??r.close)>0);
 const live=classifyC1StockScreen({snapshot,rows,current:complete,accountPolicy:decision?.accountPolicy,accountActions:decision?.accountActions,decisionId:decision?.actionVersion||decision?.decisionId});
 const buySymbols=xs=>xs.filter(r=>['Buy','Strong Buy'].includes(r.rating)).map(r=>r.symbol);
 const changed=Boolean(retained&&complete&&JSON.stringify(buySymbols(live))!==JSON.stringify(buySymbols(retained.ratings)));
 // Retained browser composition is continuity, not a permanent veto. Once
 // complete current evidence and the independent account/opening review both
 // pass, publish the current classifier result. This grants no order authority.
 const pending=!complete||(changed&&!reviewCurrent);
 // Continuity preserves a verified composition while evidence is pending.
 // A complete unchanged selection must resolve strength from today's evidence.
 const ratings=pending?(unified?live:retained?.ratings||live):live;
 const issues=[];
 if(!decision?.current)issues.push('The account analysis is not current.');
 if(!scanComplete)issues.push('The full supported dated-universe scan is incomplete.');
 if(!snapshot?.candidates?.length&&!unified)issues.push('The account returned no source candidates.');
 if(snapshot?.sourceSessionDate!==decision?.sourceSessionDate)issues.push('The screen and account signal dates do not match.');
 if(!current)issues.push('The screen refresh has not completed with a healthy feed.');
 if(missing.length)issues.push('Missing screen rows: '+missing.join(', ')+'.');
 const required=rows.filter(r=>(snapshot?.candidates||[]).some(c=>c.symbol===symbolOf(r)));
 const stale=required.filter(r=>r.clientSnapshotFallback||r.dataFeedSnapshotStale).map(symbolOf);
 const unverified=required.filter(r=>(r.recommendation?.expertDecision||r.expertDecision||{}).metrics?.quoteFreshnessPass!==true).map(symbolOf);
 const unpriced=required.filter(r=>!(Number(r.price??r.currentPrice??r.lastPrice??r.close)>0)).map(symbolOf);
 if(stale.length)issues.push('Stale or fallback screen quotes: '+stale.join(', ')+'.');
 if(unverified.length)issues.push('Quote freshness not verified: '+unverified.join(', ')+'.');
 if(unpriced.length)issues.push('Current price unavailable: '+unpriced.join(', ')+'.');
 if(changed&&!reviewCurrent)issues.push('The selection changed; a current account/opening review is still required.');
 return {key,ratings,missing,pending,verified:!pending,...(c1AccountPolicyActive(decision?.accountPolicy)?{decisionId:decision.actionVersion||decision.decisionId,policyVersion:decision.accountPolicy.version}:{}),
  issues,
  buySymbols:pending?[]:buySymbols(live),
  reason:!scanComplete?'The full supported dated-universe scan is incomplete. Fresh purchases remain paused.':changed?'Current entry verification changed; the last verified C1 selection is retained. Fresh capital is paused.':'Current screen verification is pending. No eligibility change is recorded until complete required evidence is available.'};
}
