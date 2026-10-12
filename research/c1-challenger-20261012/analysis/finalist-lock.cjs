'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {hash}=require('./scorecard.cjs');
const PRODUCTION_COMMIT='e2b98471311fb702113baf0ca64473b92ccfd142';
const MATRIX_FILE_SHA256='6f77af71d22c446a950f83d1f2c61815211c21c36031179c1a3dfac66f611f03';
const GOVERNANCE_FILE_SHA256='c2d13392f17afd98e479fa687a8dd99dd6783e9f67b2ae3b88bb846e838124b3';
const PRODUCTION_GRAPH='b1a5d79c017cb96ff55037029dd343d75d4826a8fd7ba341ad2d183dc8d1c5bf';
const sha=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function assert(condition,message){if(!condition)throw new Error(message);}
function researchPath(filePath){assert(typeof filePath==='string'&&filePath.startsWith('research/c1-challenger-20261012/')&&/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(filePath)&&!filePath.includes('..')&&!path.posix.isAbsolute(filePath)&&path.posix.normalize(filePath)===filePath,'Normalized research-relative path required');return filePath;}
function frozenMatrix(matrix){const bytes=fs.readFileSync(path.resolve(__dirname,'../experiments.json'));assert(require('node:crypto').createHash('sha256').update(bytes).digest('hex')===MATRIX_FILE_SHA256,'Preregistered matrix file bytes changed');assert(hash(matrix)===hash(JSON.parse(bytes)),'Matrix differs from preregistered source');}
function complexity(assessment){
 const keys=['newKnobs','newBranches','newStateVariables','newDataDependencies','newOperationalRequirements'];
 if(!assessment?.complexity||!keys.every(k=>Number.isInteger(assessment.complexity[k])&&assessment.complexity[k]>=0))return null;
 return keys.map(k=>assessment.complexity[k]);
}
const lessOrEqual=(a,b)=>a.every((x,i)=>x<=b[i]);
const INPUT_TRANSFORM_FAMILIES=new Set(['horizon','global_sector','slow_fast','scale_drawdown','scale_volatility']);
function verifyInputIdentity(value,{family,baseInputContentSha256}){
 const actual=value.inputContentSha256,base=value.baseInputContentSha256||value.researchIdentity?.baseInputContentSha256||actual;
 assert(sha(actual)&&base===baseInputContentSha256,'Common original base input identity mismatch');
 if(actual!==base){const t=value.inputTransform||value.researchIdentity?.inputTransform;assert(INPUT_TRANSFORM_FAMILIES.has(family),'Undeclared input-changing experiment family');
  assert(t&&t.family===family&&t.baseInputContentSha256===base&&t.derivedInputContentSha256===actual&&t.preservedOriginalPriceUniverseVerified===true&&sha(t.receiptSha256||t.receiptSHA),'Intentional signal/regime transform lacks exact base/derived identities and price/universe preservation receipt');}
 return {baseInputContentSha256:base,inputContentSha256:actual};
}
function publicInputTransform(t){return t?Object.fromEntries(['family','baseInputContentSha256','derivedInputContentSha256','preservedOriginalPriceUniverseVerified','receiptSha256','receiptSHA'].filter(k=>t[k]!==undefined).map(k=>[k,t[k]])):null;}
function publicComplexity(c){return c?Object.fromEntries(['newKnobs','newBranches','newStateVariables','newDataDependencies','newOperationalRequirements'].map(k=>[k,c[k]])):null;}
function publicAssessment(a){return a?{...Object.fromEntries(['materialImprovement','materialityRationale','plateauAcceptable','plateauRationale','rationale','complexityRationale'].filter(k=>a[k]!==undefined).map(k=>[k,a[k]])),complexity:publicComplexity(a.complexity)}:null;}
function dominates(a,b){
 const am=a.card.inheritedMetrics,bm=b.card.inheritedMetrics,ac=complexity(a.assessment),bc=complexity(b.assessment);
 const left=[am.totalReturnPct,am.sharpe,am.maxDrawdownPct,-am.annualizedTurnoverPct],right=[bm.totalReturnPct,bm.sharpe,bm.maxDrawdownPct,-bm.annualizedTurnoverPct];
 return left.every((v,i)=>v>=right[i])&&lessOrEqual(ac,bc)&&(left.some((v,i)=>v>right[i])||ac.some((v,i)=>v<bc[i]));
}
function cardIdentity(card){return {experimentId:card.experimentId,baselineRole:card.baselineRole,sourceCommit:card.sourceCommit,baseSourceGraphSha256:card.baseSourceGraphSha256||card.sourceGraphSha256,inputContentSha256:card.inputContentSha256,costBps:card.costBps};}
function checkDevelopment(card,id){
 assert(card.experimentId===id,'Experiment/card ID mismatch');assert(card.baselineRole==='production-equivalent','Only production-equivalent development cards can select finalists');
 assert(card.sourceCommit===PRODUCTION_COMMIT,'Production source commit mismatch');assert((card.baseSourceGraphSha256||card.sourceGraphSha256)===PRODUCTION_GRAPH,'Production base source graph mismatch');
 assert(card.sourceGraphSha256===PRODUCTION_GRAPH,'Actual development source snapshot differs from production-equivalent baseline');
 assert(card.costBps===25,'Selection requires independently replayed 25 bps development results');
 assert(card.periodScope==='development','Development scope marker required; whole-history cards are forbidden');
 assert(card.periodStart==='2023-01-04'&&card.periodEnd<='2024-12-31','Only development dates can be used in selection');
 assert(!('validation' in card)&&!('calendarYears' in card)&&!('rolling12MonthsQuarterly' in card),'Validation-bearing card rejected before finalist lock');
 assert(sha(card.inputContentSha256)&&sha(card.fullPathSha256),'Input and development path identities required');
 for(const field of ['totalReturnPct','sharpe','maxDrawdownPct','annualizedTurnoverPct'])assert(finite(card.inheritedMetrics?.[field]),'Undefined development metric: '+field);
}
// A materiality judgement has no invented return-maximizing score. Named written
// assessments document the plan's economic/complexity/plateau judgements using
// development evidence only, before a GitHub-persisted immutable lock exists.
function verifyGovernance(governance){
 if(!governance)return null;
 const file=fs.readFileSync(path.resolve(__dirname,'../governance-amendment.json'));
 assert(require('node:crypto').createHash('sha256').update(file).digest('hex')===GOVERNANCE_FILE_SHA256,'Governance amendment bytes changed');
 assert(hash(governance)===hash(JSON.parse(file)),'Governance amendment differs from the pre-comparison declaration');
 assert(governance.originalMatrixSha256===MATRIX_FILE_SHA256&&governance.comparativeHistoricalRunsObservedAtAmendment===0&&governance.experimentIdsParametersNeighborsAndDatesChanged===false,'Governance amendment does not preserve frozen research design');
 return {filePath:'research/c1-challenger-20261012/governance-amendment.json',fileSha256:GOVERNANCE_FILE_SHA256,canonicalSha256:hash(governance),declaration:governance};
}
function createFinalistLock({cards,matrix,assessments={},executionEvidence={},gates,governance}){
 assert(gates&&['G0','G1','G2','G3','G4'].every(g=>gates[g]?.passed===true&&sha(gates[g].receiptSha256)),'G0–G4 passing receipt identities required before selection');
 frozenMatrix(matrix);
 assert(matrix?.experiments?.filter(e=>e.role==='challenger').length===48,'Exact preregistered 48-Challenger matrix required');
 const governanceAmendment=verifyGovernance(governance);
 const byId=new Map();for(const card of cards){assert(!byId.has(card.experimentId),'Duplicate development card');checkDevelopment(card,card.experimentId);byId.set(card.experimentId,card);}
 const champion=byId.get('champion');assert(champion,'Production-equivalent Champion development replay required');
 const input=champion.baseInputContentSha256||champion.inputContentSha256;assert(champion.inputContentSha256===input,'Champion input must remain unmodified');
 for(const card of cards){const experiment=matrix.experiments.find(e=>e.id===card.experimentId);assert(experiment,'Unregistered development card ID');verifyInputIdentity(card,{family:experiment.family,baseInputContentSha256:input});}
 const rows=[],proposals=[];for(const e of matrix.experiments.filter(e=>e.role==='challenger')){
  const card=byId.get(e.id),assessment=assessments[e.id],evidence=executionEvidence[e.id],neighbors=matrix.execution.neighborPolicy[e.id];
  const reasons=[];if(!card){assert(evidence&&['blocked','unsupported','failed'].includes(evidence.status)&&typeof evidence.reason==='string'&&evidence.reason.trim(),'Every missing Challenger requires an explicit unsuccessful/blocked ledger record: '+e.id);reasons.push(evidence.status+': '+evidence.reason);}
  else {
   if(evidence?.softwareDataGatesPassed!==true)reasons.push('software/data execution gates have not passed');
   if(card.inheritedMetrics.sharpe<champion.inheritedMetrics.sharpe)reasons.push('development Sharpe is worse than Champion');
   if(card.inheritedMetrics.maxDrawdownPct<champion.inheritedMetrics.maxDrawdownPct)reasons.push('development maximum drawdown is worse than Champion');
   if(assessment?.materialImprovement!==true||!assessment.materialityRationale?.trim())reasons.push('no documented material economic improvement');
   if(assessment?.plateauAcceptable!==true||!assessment.plateauRationale?.trim())reasons.push('development nearest-family plateau evidence not accepted');
   if(!complexity(assessment)||!assessment.complexityRationale?.trim())reasons.push('implementation complexity assessment incomplete');
   if(!assessment?.rationale?.trim())reasons.push('candidate rationale absent');
   if(!neighbors)reasons.push('predeclared neighbor map absent');else for(const neighbor of [neighbors.left,neighbors.right].filter(Boolean))if(!byId.has(neighbor))reasons.push('predeclared neighbor has no development result: '+neighbor);
   if((card.economicPathSha256||card.fullPathSha256)===(champion.economicPathSha256||champion.fullPathSha256))reasons.push('no portfolio effect relative to Champion');
  }
  const row={experimentId:e.id,family:e.family,status:card?'tested_development':evidence.status,reasons,assessment:publicAssessment(assessment),developmentCardSha256:card?hash(card):null,developmentPathSha256:card?.fullPathSha256||null,neighbors:neighbors||null};rows.push(row);if(!reasons.length)proposals.push({row,card,assessment});
 }
 for(const a of proposals){const dominating=proposals.filter(b=>b!==a&&dominates(b,a)).map(b=>b.row.experimentId);if(dominating.length)a.row.reasons.push('dominated by '+dominating.join(', '));}
 const survivors=proposals.filter(p=>!p.row.reasons.length).sort((a,b)=>b.card.inheritedMetrics.sharpe-a.card.inheritedMetrics.sharpe||a.card.inheritedMetrics.annualizedTurnoverPct-b.card.inheritedMetrics.annualizedTurnoverPct||a.row.experimentId.localeCompare(b.row.experimentId));
 const finalists=survivors.slice(0,3);for(const extra of survivors.slice(3))extra.row.reasons.push('outside maximum three finalists after preregistered Sharpe/turnover/ID ordering');
 const duplicatePaths=[];const grouped=new Map();for(const card of cards){const key=hash({input:card.inputContentSha256,source:card.sourceGraphSha256,cost:card.costBps,from:card.periodStart,through:card.periodEnd,path:card.fullPathSha256});if(!grouped.has(key))grouped.set(key,{developmentPathSha256:card.fullPathSha256,inputContentSha256:card.inputContentSha256,sourceGraphSha256:card.sourceGraphSha256,experimentIds:[]});grouped.get(key).experimentIds.push(card.experimentId);}for(const value of grouped.values())if(value.experimentIds.length>1)duplicatePaths.push(value);
 const allowed=new Set(['champion']);for(const p of finalists){allowed.add(p.row.experimentId);for(const id of [p.row.neighbors.left,p.row.neighbors.right].filter(Boolean))allowed.add(id);}
 return {contract:'c1-preregistered-development-finalist-lock-v1',productionChangesAuthorized:false,validationPerformanceObserved:false,baselineRole:'production-equivalent',sourceCommit:PRODUCTION_COMMIT,baseSourceGraphSha256:PRODUCTION_GRAPH,inputContentSha256:input,baseInputContentSha256:input,experimentInputIdentities:Object.fromEntries(cards.map(card=>[card.experimentId,{family:matrix.experiments.find(e=>e.id===card.experimentId).family,inputContentSha256:card.inputContentSha256,inputTransform:publicInputTransform(card.inputTransform)}])),matrixSha256:MATRIX_FILE_SHA256,matrixCanonicalSha256:hash(matrix),governanceAmendment,plateauPolicyVersion:governanceAmendment?2:1,gates:Object.fromEntries(['G0','G1','G2','G3','G4'].map(g=>[g,{passed:gates[g].passed,receiptSha256:gates[g].receiptSha256}])),championDevelopmentCardSha256:hash(champion),period:{from:'2023-01-04',through:'2024-12-31',costBps:25},maxFinalists:3,finalists:finalists.map(p=>({experimentId:p.row.experimentId,rationale:p.assessment.rationale,materialityRationale:p.assessment.materialityRationale,plateauRationale:p.assessment.plateauRationale,complexity:publicComplexity(p.assessment.complexity),neighbors:p.row.neighbors,developmentCardSha256:p.row.developmentCardSha256})),validationAllowedExperimentIds:[...allowed].sort(),validationCostBps:[12,25,50],allChallengerDecisions:rows,duplicateDevelopmentPaths:duplicatePaths,interpretation:'This development selection uses reused history. A lock grants conditional validation of its exact IDs and predeclared neighbors, never retuning or production changes.'};
}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:10*1024*1024}).trim();}
function verifyLockContents(lock,matrix){
 frozenMatrix(matrix);
 assert(lock.contract==='c1-preregistered-development-finalist-lock-v1'&&lock.validationPerformanceObserved===false,'Invalid finalist lock');
 assert(lock.baselineRole==='production-equivalent'&&lock.sourceCommit===PRODUCTION_COMMIT&&lock.baseSourceGraphSha256===PRODUCTION_GRAPH,'Lock is not bound to production-equivalent source');
 assert(lock.finalists.length<=3&&lock.matrixSha256===MATRIX_FILE_SHA256&&lock.matrixCanonicalSha256===hash(matrix),'Finalist count/matrix identity mismatch');
 assert(lock.period.from==='2023-01-04'&&lock.period.through==='2024-12-31'&&lock.period.costBps===25,'Lock development window mismatch');
 assert(['G0','G1','G2','G3','G4'].every(g=>lock.gates?.[g]?.passed===true&&sha(lock.gates[g].receiptSha256)),'Lock stage gates incomplete');
 assert(sha(lock.baseInputContentSha256)&&lock.inputContentSha256===lock.baseInputContentSha256,'Lock common original input identity invalid');
 const ids=lock.finalists.map(f=>f.experimentId);assert(new Set(ids).size===ids.length,'Duplicate locked finalists');const allowed=new Set(['champion']);
 for(const finalist of lock.finalists){const experiment=matrix.experiments.find(e=>e.id===finalist.experimentId&&e.role==='challenger');assert(experiment,'Unregistered locked finalist');const declared=matrix.execution.neighborPolicy[finalist.experimentId];assert(hash(finalist.neighbors)===hash(declared),'Locked neighbor specification differs from preregistered matrix');allowed.add(finalist.experimentId);for(const id of [declared.left,declared.right].filter(Boolean))allowed.add(id);}
 assert(Array.isArray(lock.validationAllowedExperimentIds)&&new Set(lock.validationAllowedExperimentIds).size===lock.validationAllowedExperimentIds.length&&hash([...allowed].sort())===hash([...lock.validationAllowedExperimentIds].sort()),'Locked validation IDs differ from finalists and predeclared neighbors');
 assert(hash([...lock.validationCostBps].sort((a,b)=>a-b))===hash([12,25,50]),'Locked cost grid differs from preregistered independent costs');
 const expectedRows=matrix.experiments.filter(e=>e.role==='challenger').map(e=>e.id).sort(),actualRows=lock.allChallengerDecisions.map(e=>e.experimentId).sort();assert(hash(expectedRows)===hash(actualRows),'Complete 48-Challenger decision ledger required');
 for(const id of allowed){const input=lock.experimentInputIdentities?.[id],experiment=matrix.experiments.find(e=>e.id===id);assert(input&&input.family===experiment.family,'Locked per-experiment input family mismatch');verifyInputIdentity({...input,baseInputContentSha256:lock.baseInputContentSha256},{family:input.family,baseInputContentSha256:lock.baseInputContentSha256});}
 if(lock.governanceAmendment){const expected=verifyGovernance(lock.governanceAmendment.declaration);assert(lock.plateauPolicyVersion===2&&lock.governanceAmendment.filePath===expected.filePath&&lock.governanceAmendment.fileSha256===expected.fileSha256&&lock.governanceAmendment.canonicalSha256===expected.canonicalSha256,'Governance path/file/canonical identity mismatch');}else assert(lock.plateauPolicyVersion===1,'Plateau version requires a frozen governance declaration');
}
// Managed environments can prohibit subprocesses. In that case the orchestrator
// must actually read these public files using its GitHub connector at the exact
// immutable ref and preserve the read receipt. Local lock bytes alone never pass.
// This is research provenance, not an adversarial access-control boundary: the
// remote-read observation is trusted like the independently collected G0–G4
// receipts; Git blob hashes independently bind the exact retrieved bytes.
function verifyGitHubLockFromReadReceipt({receipt,matrix}){
 assert(receipt?.contract==='c1-immutable-github-finalist-lock-read-receipt-v1'&&receipt.remoteReadVerified===true,'Actual immutable GitHub read receipt required');
 assert(receipt.repository==='johnvtovar67-alt/screener-app'&&/^[0-9a-f]{40}$/.test(receipt.commit)&&receipt.requestedImmutableRef===receipt.commit,'GitHub repository/immutable read ref mismatch');
 assert(typeof receipt.readTool==='string'&&receipt.readTool.trim()&&typeof receipt.readAt==='string'&&!Number.isNaN(Date.parse(receipt.readAt)),'GitHub read tool/time provenance required');
 researchPath(receipt.lockPath);assert(Array.isArray(receipt.files),'Remote file read receipts required');
 const retrieve=filePath=>{researchPath(filePath);const matches=receipt.files.filter(f=>f.path===filePath);assert(matches.length===1,'Exact remote file receipt required: '+filePath);const file=matches[0];assert(file.requestedImmutableRef===receipt.commit&&/^[0-9a-f]{40}$/.test(file.gitBlobSha)&&sha(file.fileSha256)&&typeof file.contentBase64==='string','Remote file immutable-ref/blob/SHA256 identity missing');const bytes=Buffer.from(file.contentBase64,'base64'),actual=require('node:crypto').createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');assert(actual===file.gitBlobSha,'Remote Git blob bytes mismatch');assert(require('node:crypto').createHash('sha256').update(bytes).digest('hex')===file.fileSha256,'Remote file SHA256 mismatch');return bytes;};
 const bytes=retrieve(receipt.lockPath),lock=JSON.parse(bytes);verifyLockContents(lock,matrix);
 if(lock.governanceAmendment){const governanceBytes=retrieve(lock.governanceAmendment.filePath);assert(require('node:crypto').createHash('sha256').update(governanceBytes).digest('hex')===GOVERNANCE_FILE_SHA256&&hash(JSON.parse(governanceBytes))===lock.governanceAmendment.canonicalSha256,'Remote governance bytes mismatch');}
 return {lock,verification:{contract:'c1-github-finalist-lock-read-verification-v1',remoteRepository:receipt.repository,commit:receipt.commit,lockPath:receipt.lockPath,lockFileSha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),remoteReadReceiptSha256:hash(receipt),readTool:receipt.readTool,readAt:receipt.readAt,method:'immutable GitHub connector file read plus independent Git blob verification',verified:true}};
}
// Verify remote repository identity and currently advertised branch ancestry,
// then read immutable lock bytes directly from that commit, not a local file.
function verifyGitHubLock({repoRoot,remote='origin',branch,commit,lockPath,matrix}){
 assert(/^[0-9a-f]{40}$/.test(commit),'Exact 40-character GitHub lock commit required');
 assert(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch)&&!branch.includes('..'),'Safe remote branch required');
 researchPath(lockPath);
 assert(/^[A-Za-z0-9_-]+$/.test(remote),'Safe remote name required');
 const url=git(repoRoot,['remote','get-url',remote]);assert(/^https:\/\/github\.com\/johnvtovar67-alt\/screener-app(?:\.git)?$/.test(url)||/^git@github\.com:johnvtovar67-alt\/screener-app(?:\.git)?$/.test(url),'Expected GitHub research repository required');
 const advertised=git(repoRoot,['ls-remote','--heads',remote,'refs/heads/'+branch]);assert(advertised,'Remote research branch is absent');const remoteHead=advertised.split(/\s+/)[0];
 git(repoRoot,['fetch','--no-tags',remote,'refs/heads/'+branch]);assert(git(repoRoot,['rev-parse','FETCH_HEAD'])===remoteHead,'Remote branch changed during lock verification; retry evidence read');
 git(repoRoot,['merge-base','--is-ancestor',commit,remoteHead]);
 const bytes=execFileSync('git',['-C',repoRoot,'show',commit+':'+lockPath],{maxBuffer:10*1024*1024}),lock=JSON.parse(bytes);
 verifyLockContents(lock,matrix);
 if(lock.governanceAmendment){
  verifyGovernance(lock.governanceAmendment.declaration);
  const governanceBytes=execFileSync('git',['-C',repoRoot,'show',commit+':'+lock.governanceAmendment.filePath],{maxBuffer:1024*1024});
  assert(require('node:crypto').createHash('sha256').update(governanceBytes).digest('hex')===GOVERNANCE_FILE_SHA256&&lock.governanceAmendment.fileSha256===GOVERNANCE_FILE_SHA256&&lock.governanceAmendment.canonicalSha256===hash(JSON.parse(governanceBytes)),'Remote governance amendment is not frozen in the lock commit');
 }
 return {lock,verification:{contract:'c1-github-finalist-lock-read-verification-v1',remoteRepository:'johnvtovar67-alt/screener-app',branch,commit,lockPath,remoteHead,lockFileSha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),verified:true}};
}
function authorizeValidation(run,experimentId,verified){
 assert(verified?.verification?.verified===true,'Validation requires freshly verified GitHub lock evidence');const lock=verified.lock;
 assert(lock.validationAllowedExperimentIds.includes(experimentId),'Experiment is not a locked finalist or predeclared neighbor');
 assert(lock.validationCostBps.includes(run.slippageBps),'Cost is not authorized by immutable finalist lock');
 const input=lock.experimentInputIdentities?.[experimentId];assert(input,'Locked experiment input identity is absent');verifyInputIdentity(run,{family:input.family,baseInputContentSha256:lock.baseInputContentSha256||lock.inputContentSha256});assert(run.inputContentSha256===input.inputContentSha256,'Validation derived input identity differs from locked development');
 assert(run.researchIdentity?.baselineRole==='production-equivalent'&&run.researchIdentity?.sourceCommit===PRODUCTION_COMMIT&&run.researchIdentity?.baseSourceGraphSha256===PRODUCTION_GRAPH,'Validation run lacks exact production-equivalent identity');
 assert(run.researchIdentity?.experimentId===experimentId,'Validation run experiment identity mismatch');
 if(run.sourcePin)assert(run.sourcePin.sourceGraphSha256===PRODUCTION_GRAPH,'Actual validation source snapshot differs from production-equivalent baseline');
 return true;
}
module.exports={createFinalistLock,verifyGitHubLock,verifyGitHubLockFromReadReceipt,authorizeValidation,checkDevelopment,verifyGovernance,verifyInputIdentity,PRODUCTION_COMMIT,PRODUCTION_GRAPH};
