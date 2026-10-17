// Offline integrity and look-ahead gate. Assertions cannot certify source provenance.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const roles=['calendar','raw_prices','membership','sector_history','issuer_history','corporate_actions','delisting_outcomes','event_history','normalized_sessions','independent_verification'];
function validateEvidence(manifestPath,spec){
 const base=path.dirname(path.resolve(manifestPath)),m=JSON.parse(fs.readFileSync(manifestPath)),errors=[],auditRequired=[];const fail=x=>errors.push(x);
 if(!['sp500','nasdaq100'].includes(m.universe))fail('Explicit independent universe required');
 if(m.schema!=='c1-independent-evidence-v1')fail('Unsupported evidence schema');
 if(m.label!=='retrospective-independent-research'&&m.label!=='recovered-original-inputs')fail('Dataset lineage must be explicit');
 if(m.startDate!==spec.data.target_start||m.endDate!==spec.data.target_end||m.warmupStart!==spec.data.warmup_start)fail('Dates differ from frozen specification');
 const artifacts=Array.isArray(m.artifacts)?m.artifacts:[],loaded=new Map();
 for(const role of roles)if(!artifacts.some(a=>a.role===role))fail('Missing artifact role: '+role);
 const paths=new Set();
 for(const a of artifacts){
  if(!roles.includes(a.role)){fail('Unknown artifact role');continue;}
  if(typeof a.path!=='string'){fail('Artifact path missing');continue;}
  const file=path.resolve(base,a.path);
  if(file===base||!file.startsWith(base+path.sep)||paths.has(file)){fail('Unsafe or duplicate artifact path');continue;}paths.add(file);
  try{
   if(!fs.realpathSync(file).startsWith(fs.realpathSync(base)+path.sep)){fail('Artifact symlink escapes dataset');continue;}
   const b=fs.readFileSync(file);if(b.length!==a.bytes||sha(b)!==a.sha256){fail('Artifact digest/size mismatch: '+a.path);continue;}
   if(!a.source||typeof a.source.url!=='string'||!a.source.retrievedAt||!a.source.provider||!a.source.license||/REQUIRES|UNKNOWN|TBD/i.test(a.source.license))fail('Source receipt incomplete: '+a.path);
   else {const u=new URL(a.source.url);if(u.username||u.password||[...u.searchParams.keys()].some(k=>/token|key|secret|auth/i.test(k)))fail('Credential-bearing source URL prohibited');if(!Number.isFinite(Date.parse(a.source.retrievedAt)))fail('Invalid retrieval time');}
   if(loaded.has(a.role)&&['calendar','normalized_sessions','independent_verification'].includes(a.role))fail('Ambiguous single-file role: '+a.role);
   loaded.set(a.role,JSON.parse(b.toString()));
  }catch{fail('Artifact unavailable or invalid JSON: '+a.path);}
 }
 const dataset=loaded.get('normalized_sessions'),calendar=loaded.get('calendar');
 const intervalIndex=new Map();for(const role of ['membership','sector_history','issuer_history','event_history']){const index=new Map();for(const row of Array.isArray(loaded.get(role))?loaded.get(role):[]){const values=index.get(row.securityId)||[];values.push(row);index.set(row.securityId,values);}intervalIndex.set(role,index);}
 const dated=(role,securityId,date,at)=>{const found=(intervalIndex.get(role)?.get(securityId)||[]).filter(r=>r.from<=date&&(!r.to||r.to>=date)&&Number.isFinite(Date.parse(r.availableAt))&&Date.parse(r.availableAt)<=at);return found.length===1?found[0]:null;};
 const rawIndex=new Map();for(const row of Array.isArray(loaded.get('raw_prices'))?loaded.get('raw_prices'):[]){const key=row.securityId+'|'+row.date;if(rawIndex.has(key))fail('Ambiguous duplicate raw security/date');rawIndex.set(key,row);}

 if(dataset){
  if(!Array.isArray(dataset.sessions)||!dataset.sessions.length)fail('Empty sessions');
  else{
   const dates=dataset.sessions.map(s=>s.date),expected=Array.isArray(calendar)?calendar.filter(d=>d>=m.warmupStart&&d<=m.endDate):[];
   if(!expected.length||JSON.stringify(dates)!==JSON.stringify(expected))fail('Sessions do not exactly cover independently sourced calendar/warmup');
   if(new Set(dates).size!==dates.length||dates.some((d,i)=>i&&d<=dates[i-1]))fail('Duplicate or unordered sessions');
   for(const s of dataset.sessions){
    const at=Date.parse(s.decisionAt);if(!Number.isFinite(at)||s.decisionAt.slice(0,10)!==s.date)fail('Invalid decision boundary: '+s.date);
    const members=new Set(s.universeSymbols||[]),prices=new Map(),signals=s.signals||[];
    if(!members.size)fail('Empty dated membership: '+s.date);
    const memberRows=loaded.get('membership');const expectedMembers=Array.isArray(memberRows)?memberRows.filter(r=>r.from<=s.date&&(!r.to||r.to>=s.date)&&Number.isFinite(Date.parse(r.availableAt))&&Date.parse(r.availableAt)<=at).map(r=>r.symbol).sort():[];
    if(JSON.stringify([...members].sort())!==JSON.stringify(expectedMembers))fail('Dated universe omits/adds members');
    for(const p of s.prices||[]){if(prices.has(p.symbol))fail('Duplicate price: '+s.date);prices.set(p.symbol,p);
     if(p.adjustmentAsOf!==s.date)fail('Decision-date adjustment provenance missing');
     if(p.adjusted!==true||!['open','high','low','close'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])&&p[k]>0)||p.low>Math.min(p.open,p.close)||p.high<Math.max(p.open,p.close))fail('Invalid adjusted OHLC: '+s.date);
     if(p.date!==s.date||!p.securityId)fail('Price identity/date missing');
     if(!Number.isFinite(Date.parse(p.availableAt))||Date.parse(p.availableAt)>at)fail('Price availability missing/future');
     const raw=rawIndex.get(p.securityId+'|'+s.date);if(!raw||!['open','high','low','close','volume'].every(k=>raw[k]===p[k]))fail('Normalized price differs from raw adjusted-price evidence');
     if(members.has(p.symbol)){const member=dated('membership',p.securityId,s.date,at);if(member?.symbol!==p.symbol)fail('Dated membership mismatch');}

    }
    for(const symbol of [...members,'SPY','QQQ'])if(!prices.has(symbol))fail('Missing member/benchmark price '+symbol+' '+s.date);
    if(new Set(signals.map(x=>x.symbol)).size!==signals.length)fail('Duplicate signals');
    for(const x of signals){
     if(!members.has(x.symbol)||!x.securityId||!x.sector||!x.issuer||prices.get(x.symbol)?.securityId!==x.securityId)fail('Signal membership/classification incomplete');
     if(dated('sector_history',x.securityId,s.date,at)?.sector!==x.sector)fail('Dated sector mismatch');
     if(dated('issuer_history',x.securityId,s.date,at)?.issuer!==x.issuer)fail('Dated issuer mismatch');
     const event=dated('event_history',x.securityId,s.date,at);if(!event||event.blockNewCapital!==x.eventRisk?.blockNewCapital)fail('Dated event evidence mismatch');

     const avail=Date.parse(x.marketAvailableAt);if(!Number.isFinite(avail)||avail>at)fail('Signal look-ahead/missing availability');
     const t=x.entryTiming;if(t?.available!==true||typeof t.macdImproving!=='boolean'||t.asOf!==s.date)fail('Canonical/reconstructed timing incomplete');
     if(!Number.isFinite(x.researchFactors?.momentumPercentile))fail('Rank inputs missing');
     if(!x.eventRisk||typeof x.eventRisk.blockNewCapital!=='boolean'||!x.eventRisk.availableAt||Date.parse(x.eventRisk.availableAt)>at||!Number.isFinite(Date.parse(x.eventRisk.availableAt)))fail('Event evidence missing/future');
    }
    if(!Array.isArray(s.screenRows))fail('Historical screen evidence missing');
    const screen=s.screenRows||[];if(new Set(screen.map(x=>x.symbol)).size!==screen.length)fail('Duplicate screen rows');
    for(const row of screen){const t=Date.parse(row.availableAt);if(!Number.isFinite(t)||t>at)fail('Screen evidence future/missing');const signal=signals.find(x=>x.symbol===row.symbol);if(!signal||row.price!==prices.get(row.symbol)?.close||JSON.stringify(row.eventRisk)!==JSON.stringify(signal.eventRisk)||JSON.stringify(row.entryTiming)!==JSON.stringify(signal.entryTiming))fail('Screen facts differ from accepted signal');}
    if(signals.some(x=>!screen.some(r=>r.symbol===x.symbol)))fail('Screen evidence does not cover source signals');
   }
  }
 }
 const audit=loaded.get('independent_verification');
 if(!Array.isArray(audit?.independentOrigins)||new Set(audit.independentOrigins).size<2)auditRequired.push('At least two genuinely independent source origins required in substantive review');
 if(audit?.championAdapterParityApproved!==true)auditRequired.push('Independent current-Champion adapter parity review required');
 if(!audit?.reviewer||audit.independent!==true||audit.findingsResolved!==true||!Array.isArray(audit.reviewedArtifactHashes))auditRequired.push('Independent substantive provenance review and resolved findings required');
 else for(const a of artifacts.filter(a=>a.role!=='independent_verification'))if(!audit.reviewedArtifactHashes.includes(a.sha256))auditRequired.push('Audit does not cover '+a.path);
 // A signed review remains an attestation, not cryptographic proof of financial facts.
 return {status:errors.length?'FAIL':auditRequired.length?'REVIEW_REQUIRED':'READY_FOR_RESEARCH',errors:[...new Set(errors)],auditRequired:[...new Set(auditRequired)],dataset,manifestSha256:sha(fs.readFileSync(manifestPath)),limitation:'Integrity checks and reviewer attestations do not independently prove vendor history. No performance claim from this gate.'};
}
module.exports={validateEvidence,sha};
