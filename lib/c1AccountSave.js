import {importC1PositionContext} from './c1AccountService';

export function isC1AccountSaveConflict(error){
 return error?.name==='BlobPreconditionFailedError'||error?.status===412||/precondition failed.*etag mismatch/i.test(String(error?.message||''));
}
function protectedAccountState(account){
 // Only observational enrichment may commute with the owner's pending edit.
 // Ownership, dates, context, capital, fills and accepted sources must agree.
 const {revision,holdingRankReviews,holdingCoverage,holdingCoverages,...protectedState}=account;
 return JSON.stringify(protectedState);
}
export async function saveC1AccountUpdate({store,path,saved,account,operation,context,book,now}={}){
 if(account===saved?.record)return account;
 try{await store.write(path,account,saved?.etag);return account;}
 catch(error){
  if(!saved||!isC1AccountSaveConflict(error))throw error;
  const latest=await store.read(path);
  if(!latest)throw error;
  // A refresh may discard its own observations, never a competing account edit.
  if(operation==='refresh-analysis'){
   console.warn('C1_ACCOUNT_SAVE',JSON.stringify({code:'REFRESH_CONFLICT_RELOADED',sameVersion:latest.etag===saved.etag}));
   return latest.record;
  }
  if(operation!=='record-position-context'||protectedAccountState(saved.record)!==protectedAccountState(latest.record))throw error;
  // Revalidate the evidence on the winner, preserving its observations and
  // revision. Keep conditional writes; at most one safe rebase is attempted.
  const rebased=importC1PositionContext({account:latest.record,context,expectedRevision:latest.record.revision,book,now});
  if(rebased!==latest.record)await store.write(path,rebased,latest.etag);
  return rebased;
 }
}
