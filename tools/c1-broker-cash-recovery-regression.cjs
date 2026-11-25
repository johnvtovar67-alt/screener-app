// Actual component/effect and read-only API paths with fictional evidence.
// No production data, credentials, account writes, or brokerage activity.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),{createHash}=require('node:crypto');
const React=require('react'),babel=require('next/dist/compiled/babel/core');
const loader=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const helperFile=path.resolve('lib/c1BrokerCashRecovery.js'),helperRecord={exports:{}};
const helperCode=babel.transformSync(fs.readFileSync(helperFile,'utf8'),{filename:helperFile,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
new Function('require','module','exports',helperCode)(name=>name.startsWith('.')?loader.load(name,helperFile):name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),helperRecord,helperRecord.exports);
const recovery=helperRecord.exports,responseReader=loader.load('lib/c1RefreshResponse.js');
const prefix=recovery.C1_BROKER_CASH_RECOVERY_PREFIX,contract=recovery.C1_BROKER_CASH_RECOVERY_CONTRACT;
const target=createHash('sha256').update('fictional_cash_review_key_'.repeat(2)).digest('hex');
const statement='Date,Action,Symbol,Quantity,Price,Fees & Comm,Amount\n11/20/2026,Buy,CORC,1,800,0,-800\n11/20/2026,Bank Interest,,0,0,0,3\n';
const source=()=>({contract,targetAccountHash:target,statementText:statement});
const encoded=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const clone=value=>JSON.parse(JSON.stringify(value)),tick=()=>new Promise(resolve=>setImmediate(resolve));
function browser(payload=source(),storage){
 const values=storage||new Map(),events=[],listeners=new Set();
 const win={location:{hash:payload?prefix+encoded(payload):'',pathname:'/',search:'?view=account'},
  sessionStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>{events.push('store');values.set(key,value);},removeItem:key=>{events.push('remove');values.delete(key);}},
  history:{replaceState:(_state,_title,url)=>{events.push('clear-fragment');assert.equal(url,'/?view=account');win.location.hash='';}},
  addEventListener:(name,run)=>{assert.equal(name,'hashchange');listeners.add(run);},removeEventListener:(name,run)=>{assert.equal(name,'hashchange');listeners.delete(run);}};
 return {win,values,events,hashchange:()=>{for(const run of listeners)run();}};
}
const apiFile=path.resolve('tools/c1-broker-cash-api-regression.cjs'),apiSource=fs.readFileSync(apiFile,'utf8'),boundary=apiSource.indexOf('\nlet cases=0;');
assert(boundary>0);const apiModule=new Module(apiFile,module);apiModule.filename=apiFile;apiModule.paths=Module._nodeModulePaths(path.dirname(apiFile));
apiModule._compile(apiSource.slice(0,boundary)+'\nmodule.exports={harness};',apiFile);
const componentFile=path.resolve('components/C1BrokerCashReview.js'),compiled=babel.transformSync(fs.readFileSync(componentFile,'utf8'),{
 filename:componentFile,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
function componentHarness(b=browser(),overrides={}){
 const state={values:[],deps:[],index:0,effects:[],dirty:true},calls={review:[],confirm:[]};
 const hooks={...React,useState:initial=>{const at=state.index++;if(!(at in state.values))state.values[at]=typeof initial==='function'?initial():initial;
  return [state.values[at],next=>{next=typeof next==='function'?next(state.values[at]):next;if(next!==state.values[at]){state.values[at]=next;state.dirty=true;}}];},
  useRef:initial=>{const at=state.index++;if(!(at in state.values))state.values[at]={current:initial};return state.values[at];},
  useEffect:(run,deps)=>{const at=state.index++,prior=state.deps[at];if(!prior||deps.some((value,index)=>value!==prior[index])){state.deps[at]=deps;state.effects.push(run);}}};
 const record={exports:{}};new Function('require','module','exports','window',compiled)(name=>name==='react'?hooks:name.endsWith('c1BrokerCashRecovery')?recovery:name.startsWith('../lib/')?loader.load(name,componentFile):name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),record,record.exports,b.win);
 const props={decision:{revision:0,brokerageCash:2203,brokerageCashCurrent:true},ready:false,busy:false,
  onReview:async(text,revision,targetAccountHash)=>{calls.review.push({text,revision,targetAccountHash});return {reviewId:'a'.repeat(64),revision,financialValid:true,remainingRoundedBalanceAdjustment:{allowed:true},plannedSaleCorrection:{rows:[{symbol:'ZZQ',shares:1,allocationsBefore:[],allocationsAfter:[]}]}};},
  onConfirm:async payload=>{calls.confirm.push(clone(payload));return {reviewId:payload.reviewId};},...overrides};
 let tree;const render=()=>{state.index=0;tree=record.exports.default(props);return tree;};
 const nodes=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];
 const text=node=>node==null||typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node.props?.children).map(text).join('');
 async function flush(){for(let i=0;i<12;i++){state.dirty=false;render();const effects=state.effects.splice(0);for(const effect of effects)effect();await tick();if(!state.dirty&&!state.effects.length)return;}throw Error('Recovery effect did not settle');}
 const find=predicate=>{render();const found=nodes(tree).find(predicate);assert(found,'Expected real recovery form control');return found;};
 return {state,calls,props,render,flush,browser:b,get visible(){render();return text(tree);},
  textarea:()=>find(node=>node.type==='textarea'),
  preview:()=>find(node=>node.type==='form').props.onSubmit({preventDefault(){}}),
  approve:label=>find(node=>node.type==='input'&&node.props['aria-label']===label).props.onChange({target:{checked:true}}),
  save:()=>find(node=>node.type==='button'&&text(node).includes('Confirm account correction')).props.onClick(),
  canSave:()=>!find(node=>node.type==='button'&&text(node).includes('Confirm account correction')).props.disabled};
}
let cases=0;async function check(name,run){await run();cases++;console.log('PASS '+name);}
(async()=>{
 await check('strict private-fragment import removes the address before storage and imports no approval',()=>{
  const b=browser(),draft=recovery.loadC1BrokerCashRecovery({location:b.win.location,history:b.win.history,storage:b.win.sessionStorage,now:Date.parse('2026-11-25T17:00:00Z')});
  assert.equal(b.win.location.hash,'');assert.equal(b.events[0],'clear-fragment');assert.deepEqual(draft.source,source());assert.equal(draft.attempted,false);
  assert(!JSON.stringify(draft).includes('confirmed'));assert.equal(recovery.markC1BrokerCashRecoveryAttempt(b.win.sessionStorage,draft),true);
  const again=browser(source(),b.values),retained=recovery.loadC1BrokerCashRecovery({location:again.win.location,history:again.win.history,storage:again.win.sessionStorage,now:Date.parse('2026-11-25T17:01:00Z')});
  assert.equal(retained.attempted,true);assert.equal(recovery.markC1BrokerCashRecoveryAttempt(again.win.sessionStorage,retained),false);
  for(const payload of [{...source(),confirmed:true},{...source(),targetAccountHash:'wrong'},{...source(),statementText:''}]){
   const invalid=browser(payload);assert.throws(()=>recovery.loadC1BrokerCashRecovery({location:invalid.win.location,history:invalid.win.history,storage:invalid.win.sessionStorage}),/invalid/);assert.equal(invalid.win.location.hash,'');assert.equal(invalid.values.size,0);
  }
  const oversized=browser();oversized.win.location.hash=prefix+'a'.repeat(16001);assert.throws(()=>recovery.loadC1BrokerCashRecovery({location:oversized.win.location,history:oversized.win.history,storage:oversized.win.sessionStorage}),/invalid/);
 });
 await check('expiry ends automatic review while retaining evidence and explicit edits across reload',()=>{
  const b=browser(),now=Date.parse('2026-11-25T17:00:00Z'),draft=recovery.loadC1BrokerCashRecovery({location:b.win.location,history:b.win.history,storage:b.win.sessionStorage,now});
  const late=recovery.loadC1BrokerCashRecovery({location:b.win.location,history:b.win.history,storage:b.win.sessionStorage,now:now+7*3600000});
  assert.equal(late.expired,true);assert.equal(late.source.statementText,statement);assert.equal(recovery.markC1BrokerCashRecoveryAttempt(b.win.sessionStorage,late),false);
  const edited=recovery.updateC1BrokerCashRecovery(b.win.sessionStorage,draft,statement+'\n');assert.equal(edited.attempted,true);
  assert.equal(recovery.clearC1BrokerCashRecovery(b.win.sessionStorage,draft),false);assert.equal(b.values.size,1);
  assert.equal(recovery.clearC1BrokerCashRecovery(b.win.sessionStorage,edited),true);assert.equal(b.values.size,0);
 });
 await check('actual component waits for native readiness, reviews once, and requires explicit final confirmations',async()=>{
  const h=componentHarness();await h.flush();assert.equal(h.calls.review.length,0);assert.equal(h.textarea().props.value,statement);assert(h.visible.includes('No upload or retyping is needed'));
  h.props.ready=true;await h.flush();assert.deepEqual(h.calls.review,[{text:statement,revision:0,targetAccountHash:target}]);assert.equal(h.calls.confirm.length,0);assert.equal(h.canSave(),false);
  h.render();await h.flush();assert.equal(h.calls.review.length,1);
  h.approve('Confirm statement correction');assert.equal(h.canSave(),false);h.approve('Confirm planned sale correction');assert.equal(h.canSave(),true);
  await h.save();await h.flush();assert.equal(h.calls.confirm.length,1);assert.equal(h.calls.confirm[0].targetAccountHash,target);assert.equal(h.browser.values.size,0);assert(h.visible.includes('Statement correction saved in C1.'));
 });
 await check('failed reviews and reloads retain the draft without automatic retries or approval',async()=>{
  const b=browser(),h=componentHarness(b,{ready:true,onReview:async()=>{h.calls.review.push('attempt');throw Error('Fictional review timeout');}});
  await h.flush();assert.equal(h.calls.review.length,1);assert(h.visible.includes('Fictional review timeout'));assert.equal(h.textarea().props.value,statement);assert.equal(b.values.size,1);
  const reloaded=componentHarness(browser(null,b.values),{ready:true});await reloaded.flush();assert.equal(reloaded.calls.review.length,0);assert.equal(reloaded.textarea().props.value,statement);
  await reloaded.preview();await reloaded.flush();assert.equal(reloaded.calls.review.length,1);assert.equal(reloaded.calls.confirm.length,0);
 });
 await check('an already-mounted native form consumes a same-tab private link once',async()=>{
  const b=browser(null),h=componentHarness(b,{ready:true});await h.flush();assert.equal(h.calls.review.length,0);
  b.win.location.hash=prefix+encoded(source());b.hashchange();await h.flush();assert.equal(b.win.location.hash,'');assert.equal(h.textarea().props.value,statement);assert.equal(h.calls.review.length,1);
  b.hashchange();await h.flush();assert.equal(h.calls.review.length,1);assert.equal(h.calls.confirm.length,0);
  const updated={...source(),statementText:statement+'\n'};b.win.location.hash=prefix+encoded(updated);b.hashchange();await h.flush();
  assert.equal(h.calls.review.length,2);assert.equal(h.textarea().props.value,updated.statementText);assert.equal(h.calls.confirm.length,0);
 });
 await check('uncertain confirmation retains evidence and cannot turn reload into a repeat save',async()=>{
  const h=componentHarness(browser(),{ready:true,onConfirm:async()=>{throw Error('Fictional interrupted confirmation');}});await h.flush();
  h.approve('Confirm statement correction');h.approve('Confirm planned sale correction');await h.save();await h.flush();assert.equal(h.browser.values.size,1);assert.equal(h.canSave(),false);
  const reloaded=componentHarness(browser(null,h.browser.values),{ready:true});await reloaded.flush();assert.equal(reloaded.calls.review.length,0);assert.equal(reloaded.calls.confirm.length,0);
 });
 await check('actual handler supplies the native concrete proposal without another upload or financial write',async()=>{
  const api=apiModule.exports.harness(),b=browser(),h=componentHarness(b,{ready:true,onReview:async(text,revision,targetAccountHash)=>{
   h.calls.review.push({text,revision,targetAccountHash});const reply=await api.request({operation:'review-broker-cash-history',statementText:text,expectedRevision:revision,targetAccountHash});
   assert.equal(reply.statusCode,200,JSON.stringify(reply.body));const value=await responseReader.readC1BrokerCashReviewResponse({ok:true,status:200,headers:{get:()=>null},json:async()=>reply.body},{expectedRevision:revision});return value.cashReview;
  }});await h.flush();assert.equal(h.calls.review.length,1);assert(h.visible.includes('Operational risk review'));assert.equal(h.calls.confirm.length,0);assert.equal(api.state.writeAttempts,0);assert.equal(api.state.writes,0);assert.equal(api.state.providerCalls,0);
 });
 await check('an already-applied verified repair exposes no upload or confirmation controls and starts no review',async()=>{
  const h=componentHarness(browser(),{ready:true,applied:true});await h.flush();assert.equal(h.render(),null);assert.equal(h.calls.review.length,0);assert.equal(h.calls.confirm.length,0);assert.equal(h.browser.win.location.hash,'');
 });
 console.log(`PASS: ${cases} private recovery flows; actual effects, strict account-bound source transport, retained evidence, one read-only review, native explicit confirmation and zero production writes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
