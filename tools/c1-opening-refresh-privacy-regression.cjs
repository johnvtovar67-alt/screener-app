// Real opening-review function, exact deployed baseline and synthetic provider.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const file=path.resolve('lib/c1AccountExecutionView.js'),current=fs.readFileSync(file,'utf8');
const before="    console.warn('C1_OPENING_UNAVAILABLE',JSON.stringify({reason:openingError}));";
const after="    try{console.warn('C1_OPENING_UNAVAILABLE',JSON.stringify({code:'OPENING_REVIEW_UNAVAILABLE',stage:'opening-review'}));}catch{}";
assert.equal(current.split(after).length,2);
const original=current.replace(after,before),hash=source=>crypto.createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
assert.equal(hash(original),'7c304640ea8130e8e33e9168a9f9636e671c96e9','Only the diagnostic line changes; exact PR333 opening implementation retained');
function prepare(source,fixture,log){
 const imported={};source=source.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,request)=>{
  const values=fixture.loader.load(request,file);for(const name of names.split(',').map(name=>name.trim())){assert.notEqual(values[name],undefined);imported[name]=values[name];}return '';
 }).replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
 const box={...imported,console:{warn:log},Date,process:{env:{}}};vm.createContext(box);vm.runInContext(source+';globalThis.prepare=prepareC1AccountExecution;',box);return box.prepare;
}
const clone=value=>JSON.parse(JSON.stringify(value));
async function main(){
 for(const failure of [false,true]){
  const fixture=createWorkflowFixture('buy'),calls=[0,0],logs=[[],[]],account=JSON.stringify(fixture.account),sentinel='PRIVATE_PROVIDER_URL_KEY_ACCOUNT_SENTINEL';
  const outcomes=[];
  for(const [index,source] of [original,current].entries())outcomes.push(await prepare(source,fixture,(...args)=>logs[index].push(args))({account:clone(fixture.account),book:fixture.book,now:fixture.now,
   collectOpening:async()=>{calls[index]++;if(failure)throw Error(sentinel);return fixture.opening();}}));
  assert.deepEqual(clone(outcomes[1]),clone(outcomes[0]),'Entire opening response, decisions, orders, error copy and evidence unchanged');
  assert.equal(calls[0],calls[1]);assert.equal(JSON.stringify(fixture.account),account,'No account record modification');
  if(failure){assert(JSON.stringify(logs[0]).includes(sentinel),'Original raw-log defect reproduced');assert(!JSON.stringify(logs[1]).includes(sentinel));assert.deepEqual(logs[1],[['C1_OPENING_UNAVAILABLE',JSON.stringify({code:'OPENING_REVIEW_UNAVAILABLE',stage:'opening-review'})]]);}
  else assert.deepEqual(logs[1],logs[0]);
 }
 const fixture=createWorkflowFixture('buy'),account=JSON.stringify(fixture.account),copy='Existing synthetic opening failure';
 const view=await prepare(current,fixture,()=>{throw Error('Logger unavailable');})({account:fixture.account,book:fixture.book,now:fixture.now,collectOpening:async()=>{throw Error(copy);}});
 assert.equal(view.openingError,copy);assert.equal(JSON.stringify(fixture.account),account);assert.equal(view.openingPlan,null);
 console.log('PASS: actual opening review success/failure full-output and call parity; original raw sentinel exposure reproduced and redacted; logger failures retain the normal degraded response and account records.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
