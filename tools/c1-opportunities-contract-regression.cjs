// Actual consumed evidence/account/holding join; isolated supplied observations.
// No network, storage writes, private account, or historical experiment.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {restoreOpportunitiesContract,restoreCanaryContract}=require('./c1-opportunities-contract-extraction.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const comparable=value=>JSON.parse(JSON.stringify(value,(_,entry)=>typeof entry==='function'?undefined:entry));
const component=fs.readFileSync('components/C1AccountOpportunities.js','utf8');
assert.equal(hash(restoreOpportunitiesContract(component)),'4f7d2b6a031f021bd9b544177ab46675241602db1b7e52a72fe5928143ef09b9','Complete pre-join component is preserved, including all hook/storage/expiry code');
assert.equal(hash(restoreCanaryContract(fs.readFileSync('tools/c1-readonly-canary.cjs','utf8'))),'d15923c003cae26ff565215680e926e3063de76e411a1b1261809dd4d74527f0','Complete pre-join captured-response canary is preserved');
assert.match(component,/const \{evidence,projection\}=joinC1Opportunities\(/);
assert.match(component,/return projection\?renderC1AccountOpportunitiesView\(projection\):null/,'The renderer consumes the joined projection');
assert.doesNotMatch(component,/resolveC1ScreenEvidence\(|projectC1Opportunities\(/,'The actual component has no second evidence/join implementation');

async function main(){
 const f=createWorkflowFixture('buy');f.setCash(20000);f.advance();
 const view=await f.prepare(),base={...view,screenRows:f.screenRows(),positionRows:f.screenRows(),screenCurrent:true,portfolio:f.portfolio};
 const {joinC1Opportunities:join,resolveC1OpportunitiesEvidence:resolve}=f.loader.load('lib/c1OpportunitiesContract.js');
 const {resolveC1ScreenEvidence:oldResolve}=f.loader.load('lib/c1ScreenEvidence.js');
 const {projectC1Opportunities:oldProject}=f.loader.load('lib/c1OpportunitiesProjection.js');
 const {c1ManualReviewCurrent}=f.loader.load('lib/c1ManualRecommendations.js');
 const readTime=()=>new Date(f.now),before=JSON.stringify({account:f.account,book:f.book,portfolio:f.portfolio,view});
 const scenarios=[
  ['normal',input=>input],['portfolio',input=>({...input,view:'portfolio'})],
  ['screen pending',input=>({...input,screenCurrent:false})],['missing rows',input=>({...input,screenRows:[]})],
  ['stale rows',input=>({...input,screenRows:input.screenRows.map(row=>({...row,clientSnapshotFallback:true}))})],
  ['unverified quote',input=>({...input,screenRows:input.screenRows.map(row=>({...row,recommendation:{expertDecision:{metrics:{quoteFreshnessPass:false}}}}))})],
  ['issuer event',input=>({...input,screenRows:input.screenRows.map((row,index)=>index?row:{...row,eventRisk:{status:'Blocked',blockNewCapital:true}})})],
  ['opening missing',input=>({...input,openingPlan:null})],['opening failure',input=>({...input,openingPlan:null,openingError:'Synthetic opening failure'})],
  ['expired',input=>({...input,manualRecommendations:{...input.manualRecommendations,validUntil:f.now.toISOString()}})],
  ['foreign execution revision',input=>({...input,executionDecision:{...input.executionDecision,revision:999}})],
  ['stale account',input=>({...input,decision:{...input.decision,current:false}})],
  ['account mismatch',input=>({...input,decision:{...input.decision,accountMismatch:true}})]
 ];
 let comparisons=0;
 for(const [name,change]of scenarios){
  const input=change(clone(base)),unchanged=JSON.stringify(input),result=join(input,{readTime});
  const evidence=oldResolve({decision:input.decision,rows:input.screenRows,current:input.screenCurrent,previous:input.previousEvidence||null,
   reviewCurrent:Boolean(input.openingPlan)&&c1ManualReviewCurrent(input.manualRecommendations,input.executionDecision||input.decision,readTime())});
  const projection=oldProject({...input,evidence},{readTime});
  assert.deepEqual(comparable(result.evidence),comparable(evidence),name+': complete retained/current evidence parity');
  assert.deepEqual(comparable(result.projection),comparable(projection),name+': complete projection data parity');
  if(projection)for(const symbol of input.portfolio.map(row=>row.symbol)){
   assert.deepEqual(comparable(result.projection.holdingPresentation(symbol)),comparable(projection.holdingPresentation(symbol)),name+': independently observed holding quote and review parity');
  }
  assert.equal(JSON.stringify(input),unchanged,name+': join cannot change account, checked orders or evidence');
  assert.equal(result.contract,'c1-opportunities-join-v1');assert.equal(result.sourceSessionDate,input.decision.sourceSessionDate);
  assert.equal(result.evidenceIdentity,evidence.key,'Identity is the actual existing source/evidence key, never a new authority');
  if(!input.openingPlan||name==='expired'||name==='foreign execution revision'||name==='stale account')assert.equal(result.projection?.actionableBuys.length||0,0,name+': no unverified quantities');
  comparisons++;
 }
 const original=join(clone(base),{readTime}),changed=clone(base);
 changed.previousEvidence=original.evidence;changed.screenRows[0].eventRisk={status:'Blocked',blockNewCapital:true};
 changed.openingPlan=null;
 const pending=join(changed,{readTime});
 assert.equal(pending.evidence.pending,true);assert.deepEqual(comparable(pending.evidence.ratings),comparable(original.evidence.ratings),'Missing review retains verified prior selection');
 assert.equal(pending.projection.actionableBuys.length,0,'Retained selection cannot grant purchase quantities');
 const recovered=join({...changed,openingPlan:base.openingPlan},{readTime});
 assert.equal(recovered.evidence.pending,false,'Explicitly supplied current independent opening review recovers the changed selection');
 assert(!recovered.evidence.buySymbols.includes(base.screenRows[0].symbol),'Issuer block remains local and cannot regain an order through retained evidence');
 assert.equal(JSON.stringify(base.manualRecommendations),JSON.stringify(view.manualRecommendations),'Independent screen changes never rewrite the server checked recommendation');
 const sourceChanged={...base,decision:{...base.decision,decisionId:'different-source:1'}};
 assert.notEqual(join(sourceChanged,{readTime}).evidenceIdentity,original.evidenceIdentity,'Accepted source change replaces the evidence identity');
 // Server captured-response assessment supplies its already verified account
 // predicate and the exact same observation set. It uses this same resolver,
 // not a browser-cache substitute or a second eligibility implementation.
 assert.deepEqual(comparable(resolve(changed,{readTime,reviewCurrent:true})),comparable(oldResolve({decision:changed.decision,rows:changed.screenRows,current:true,previous:changed.previousEvidence,reviewCurrent:true})));
 assert.equal(JSON.stringify({account:f.account,book:f.book,portfolio:f.portfolio,view}),before);
 assert.equal(f.writes,0);
 console.log(`PASS: consumed complete Opportunities contract; exact component/canary reversals, ${comparisons} full join/holding parity cases, retained-selection/issuer-block/review recovery, source identity and unchanged checked authority; zero network/live writes.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
