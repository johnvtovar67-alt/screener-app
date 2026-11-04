// Supply the actual Home read-only ownership observer to extracted-handler
// harnesses. Its UI invalidation is separate from deferred financial frames.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('../research-module-loader.cjs');
function bindC1StopOwnershipObserver(box,page){
 const start=page.indexOf('  function observeStopOwnership('),end=page.indexOf('  function readStopBinding(',start);
 assert(start>=0&&end>start,'The actual ownership observer is available');
 const {c1StopDecisionIdentity}=createResearchModuleLoader(process.cwd()).load('lib/c1StopVerification.js');
 const observed={current:null},invalidations={count:0};
 box.observeStopOwnership=new Function('c1StopDecisionIdentity','stopAccountObserved','invalidateStopOwnership',
  page.slice(start,end)+';return observeStopOwnership;')(c1StopDecisionIdentity,observed,()=>invalidations.count++);
 box.stopAccountObserved=observed;box.stopOwnershipInvalidations=invalidations;
 return box;
}
module.exports={bindC1StopOwnershipObserver};
