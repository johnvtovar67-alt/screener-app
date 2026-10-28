import {createHash} from 'node:crypto';
import {readStoredC1DatedBook} from '../../../lib/c1DatedBookStore';
import {readC1IndexObservations} from '../../../lib/c1IndexObservationStore';
import {advanceC1ForwardModel} from '../../../lib/c1ForwardModel';
import {reconcileC1VerifiedProviderRevision} from '../../../lib/c1ReviewedSessionRevision';
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const path='research/c1-dated-index-production-v1/sp500.json.gz';
export const config={maxDuration:300};
// Temporary fixed-scope market-only inspection, available solely on this
// authenticated Vercel preview branch. No provider acquisition or storage writes.
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='fix/c1-daily-revision-20261028'||Date.now()>Date.parse('2026-10-30T00:00:00Z'))return res.status(404).end();
 if(req.method!=='GET')return res.status(405).end();
 try{
  const {record}=await readStoredC1DatedBook('sp500',{path});
  const observations=await readC1IndexObservations('2026-10-27',{bookPath:path});
  const selected=observations.at(-1);
  if(!selected)return res.status(409).json({error:'Archived observation missing'});
  const differences=[];
  const walk=(a,b,p)=>{if(digest(a??null)===digest(b??null))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))walk(a[k],b[k],p+'.'+k);}else if(differences.length<80)differences.push({path:p,before:a??null,after:b??null});};
  let diagnostic,fields,comparison;
  try{const result=reconcileC1VerifiedProviderRevision(record,selected.payload,new Date(selected.observedAt),digest,(model,...args)=>{const output=advanceC1ForwardModel(model,...args);if(!comparison)comparison=output;else {fields=Object.fromEntries(['ledger','pendingBySleeve','paperExecution','paperExecutionStatus','summary'].map(k=>[k,{equal:digest(comparison[k])===digest(output[k])}]));for(const k of Object.keys(fields))walk(comparison[k],output[k],k);}return output;},observations);diagnostic={accepted:true,audit:result.audit};}catch(e){diagnostic=e.providerRevisionDiagnostic||{stage:'comparison-error'};}
  return res.status(200).json({contract:'c1-market-revision-inspection-v1',recordHash:record.recordHash,sourceSessionDate:record.model.sessions.at(-1).date,selectedObservation:{hash:selected.observationHash,at:selected.observedAt},observationCount:observations.length,diagnostic,fields,differences,readOnly:true});
 }catch{return res.status(503).json({error:'Market revision inspection unavailable',readOnly:true});}
}
