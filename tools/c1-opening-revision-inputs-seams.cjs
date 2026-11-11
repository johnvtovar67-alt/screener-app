// Exact inverse of the November 11 opening-revision input-parity repair.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const gitBlob=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
function replaceOnce(source,from,to,label){
 assert.equal(source.split(from).length-1,1,label+' must occur exactly once');
 return source.replace(from,to);
}
function restoreReview(source){
 source=replaceOnce(source,
  'additionalSwingCapacity:plan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY,prospectiveSwingStopPolicy:plan.prospectiveSwingStopPolicy,accountPolicy,brokerageCashAvailable});',
  'additionalSwingCapacity:plan.additionalSwingCapacity?.contract===C1_ADDITIONAL_SWING_CAPACITY,prospectiveSwingStopPolicy:plan.prospectiveSwingStopPolicy});',
  'opening revision planner inputs');
 source=replaceOnce(source,
  'export function reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan,now=new Date(),accountPolicy,brokerageCashAvailable}={}){',
  'export function reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan,now=new Date()}={}){',
  'opening revision function contract');
 assert.equal(gitBlob(source),'70dd0eda08a56c3fa7ae96dbe4e70f8b9811395b','Pre-repair opening review source identity');
 return source;
}
function restoreExecutionView(source){
 source=replaceOnce(source,
  'openingPlan=reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan:openingPlan,now,accountPolicy:continuation.accountPolicy,brokerageCashAvailable:continuation.brokerageCashAvailable});',
  'openingPlan=reviewC1OpeningPriceRevisions({account,sessions,historySessions,opening,plan:openingPlan,now});',
  'opening execution input handoff');
 assert.equal(gitBlob(source),'5fbe7dd0ce76e52788fe0f51ccfb3a10f712181e','Pre-repair execution view source identity');
 return source;
}
exports.restoreReview=restoreReview;
exports.restoreExecutionView=restoreExecutionView;
