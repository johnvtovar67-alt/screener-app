// Exercise the real client boundary with synthetic, authenticated-response shapes.
const assert=require('node:assert/strict');
const {readC1OpeningReview}=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd()).load('lib/c1OpeningReviewRead.js');
const view={decision:{contract:'c1-account-decision-v1',decisionId:'example',revision:1,positions:[]}};
function harness(responses,current=true){
 const requests=[];
 const run=()=>readC1OpeningReview('synthetic',()=>current,async(url,options)=>{
  requests.push([url,options.method,options.body]);
  const next=responses.shift();if(next instanceof Error)throw next;
  return next;
 });
 return {run,requests};
}
(async()=>{
 const ok=()=>new Response(JSON.stringify(view));
 const standalone=harness([ok()]);assert.deepEqual((await standalone.run()).execution.decision.positions.length,0);assert.equal(standalone.requests.length,1);
 for(const lost of [new TypeError('Load failed'),{ok:true,json:async()=>{throw new TypeError('stream lost');}}]){
  const h=harness([lost,ok()]);assert.equal((await h.run()).execution.decision.revision,1);
  assert.deepEqual(h.requests.map(r=>r.slice(0,2)),[['/api/c1-account','POST'],['/api/c1-account?review=opening','GET']]);
  assert.equal(h.requests[1][2],undefined);
 }
 const stale=harness([new TypeError('Load failed')],false);await assert.rejects(stale.run());assert.equal(stale.requests.length,1);
 const invalid=harness([new Response('{')]);await assert.rejects(invalid.run());assert.equal(invalid.requests.length,1);
 const denied=harness([new Response('denied',{status:403})]);await assert.rejects(denied.run());assert.equal(denied.requests.length,1);
 const twice=harness([new TypeError('offline'),new TypeError('offline')]);await assert.rejects(twice.run());assert.equal(twice.requests.length,2);
 console.log('PASS: interrupted opening reviews can recover with one read-only request; stale, invalid and denied requests are never replayed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
