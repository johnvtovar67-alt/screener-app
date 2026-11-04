// Deferred synthetic held-quote observations; no account/provider writes.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {c1StopDecisionIdentity:identity,c1StopVerificationBinding:bind,c1StopVerificationCurrent:current,createC1StopVerification:create}=createResearchModuleLoader(process.cwd()).load('lib/c1StopVerification.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
async function main(){
 const portfolio=[{symbol:'SYNA',shares:40,avgCost:300,role:'Swing'}];
 const decision={contract:'c1-account-decision-v1',revision:3,decisionId:'read-only:3',sourceSessionDate:'2026-11-02',positions:[{...portfolio[0],stops:[{sleeve:'base',price:258,shares:40}]}]};
 const binding=bind({decision,portfolio,reconciled:true,accountOwner:4,portfolioOwner:2});
 const context={binding,accountOwner:4,portfolioOwner:2,decisionIdentity:identity(decision),portfolioSignature:JSON.stringify(portfolio)};
 const live={accountOwner:4,portfolioOwner:2,observedDecision:identity(decision),enteredPortfolio:JSON.stringify(portfolio)};
 const read=()=>current(context,live),published=[],verifier=create(read);
 assert(binding);assert.equal(bind({decision,portfolio,reconciled:false}),null,'Unreconciled ownership has no usable binding');
 const screening=deferred(),quote=deferred();let screenFinished=false;screening.promise.then(()=>screenFinished=true);
 const pending=verifier.verify({symbol:'SYNA',collect:()=>quote.promise,publish:value=>published.push(value)});
 quote.resolve({symbol:'SYNA',price:228});assert.equal((await pending).status,'published');
 assert.equal(screenFinished,false,'Held verification publishes without awaiting unrelated purchase screening');
 assert.equal(published[0].binding,binding);assert.equal(published[0].stock.price,228);
 screening.resolve();
 for(const [name,change,restore]of [
  ['account owner',()=>live.accountOwner++,()=>live.accountOwner--],
  ['portfolio owner',()=>live.portfolioOwner++,()=>live.portfolioOwner--],
  ['newly observed deferred account revision',()=>live.observedDecision=identity({...decision,revision:4}),()=>live.observedDecision=identity(decision)],
  ['entered ownership',()=>live.enteredPortfolio=JSON.stringify([{...portfolio[0],shares:5}]),()=>live.enteredPortfolio=JSON.stringify(portfolio)],
 ]){
  const q=deferred(),before=published.length,p=verifier.verify({symbol:'SYNA',collect:()=>q.promise,publish:value=>published.push(value)});
  change();assert.equal(read(),null,name+' invalidates synchronously before a React publication');q.resolve({symbol:'SYNA',price:220});
  assert.equal((await p).status,'superseded',name+' fences a late quote');assert.equal(published.length,before,name+' cannot attach superseded sell ownership');restore();
 }
 const first=deferred(),second=deferred();
 const a=verifier.verify({symbol:'SYNA',collect:()=>first.promise,publish:value=>published.push(value)});
 const b=verifier.verify({symbol:'SYNA',collect:()=>second.promise,publish:value=>published.push(value)});
 second.resolve({symbol:'SYNA',price:240});assert.equal((await b).status,'published');first.resolve({symbol:'SYNA',price:220});assert.equal((await a).status,'superseded','Older explicit observation cannot replace a newer recovery');
 const stopped=deferred(),c=verifier.verify({symbol:'SYNA',collect:()=>stopped.promise,publish:value=>published.push(value)});verifier.cancel();stopped.resolve({price:220});assert.equal((await c).status,'superseded','Unmount/cancellation fences pending observations');
 assert.equal(JSON.stringify(portfolio),'[{"symbol":"SYNA","shares":40,"avgCost":300,"role":"Swing"}]');assert.equal(decision.revision,3,'The verifier never writes account or ownership state');
 console.log('PASS: explicit stop verification bypasses unrelated screen waits and fences account/portfolio/revision/ownership changes, older replies and cancellation.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
