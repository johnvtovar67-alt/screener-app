// Current provider receipts only. Historical compiler coverage is never a
// substitute for this expiring evidence; reading it performs no acquisition.
export const C1_CURRENT_EVENT_EVIDENCE_CONTRACT='c1-current-event-evidence-v1';
const feeds={EARNINGS:{endpoint:'earnings-calendar',ttl:15*60*1000},MERGERS:{endpoint:'mergers-acquisitions-latest',ttl:60*60*1000},NEWS:{endpoint:'news/stock',ttl:5*60*1000}};
const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):NaN;
export function readC1CurrentEventEvidence(risk,now=new Date()){
 const evidence=risk?.eventVerification,at=new Date(now).getTime(),observed=stamp(evidence?.observedAt),expires=stamp(evidence?.expiresAt);
 if(evidence?.contract!==C1_CURRENT_EVENT_EVIDENCE_CONTRACT||evidence.provider!=='FMP'||!Number.isFinite(at)||
  !['VERIFIED_CLEAR','VERIFIED_BLOCKED'].includes(evidence.state)||!Number.isFinite(observed)||observed>at||!Number.isFinite(expires)||expires<=at||expires<=observed||
  risk.eventRiskVerified!==true||risk.checkComplete!==true||risk.earningsCheckComplete!==true||risk.mergerCheckComplete!==true||risk.newsCheckComplete!==true||
  !Array.isArray(evidence.sources)||evidence.sources.length!==3)return 'UNVERIFIED';
 const seen=new Set();
 for(const source of evidence.sources){
  const spec=feeds[source?.kind],fetched=stamp(source?.fetchedAt),until=stamp(source?.expiresAt);
  if(!spec||seen.has(source.kind)||source.endpoint!==spec.endpoint||source.complete!==true||source.reason!=='OK'||
   !Number.isFinite(fetched)||fetched>observed||!Number.isFinite(until)||until<=at||until<=fetched||until>fetched+spec.ttl||expires>until)return 'UNVERIFIED';
  seen.add(source.kind);
 }
 if(evidence.state==='VERIFIED_CLEAR'&&(risk.blockNewCapital===true||risk.manualCheckRequired===true||['blocked','manual'].includes(String(risk.status||'').toLowerCase())))return 'UNVERIFIED';
 if(evidence.state==='VERIFIED_BLOCKED'&&risk.blockNewCapital!==true)return 'UNVERIFIED';
 return evidence.state;
}
