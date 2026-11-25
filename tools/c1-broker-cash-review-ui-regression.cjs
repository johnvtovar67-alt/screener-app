// Actual React hooks, events and SSR with wholly fictional review data. These
// checks establish the review form's behavior, not production reconciliation,
// brokerage authentication, investment performance or a financial write.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),babel=require('next/dist/compiled/babel/core');
const loader=require('./research-module-loader.cjs').createResearchModuleLoader(process.cwd());
const file=path.resolve('components/C1BrokerCashReview.js'),clone=value=>JSON.parse(JSON.stringify(value));
const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,
 presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
let active;
const mockReact={...React,useEffect(){},useState:initial=>{
 const state=active,index=state.index++;
 if(!(index in state.values))state.values[index]=typeof initial==='function'?initial():initial;
 return [state.values[index],value=>{state.values[index]=typeof value==='function'?value(state.values[index]):value;}];
},useRef:initial=>{
 const state=active,index=state.index++;if(!(index in state.values))state.values[index]={current:initial};return state.values[index];
}};
function load(react){
 const record={exports:{}};
 new Function('require','module','exports',compiled)(name=>name==='react'?react:name.startsWith('../lib/')?loader.load(name,file):name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),record,record.exports);
 return record.exports;
}
const {default:Component,C1_BROKER_STATEMENT_MAX_BYTES:limit}=load(mockReact);
const statement='Date,Action,Symbol,Quantity,Price,Fee,Amount\n11/24/2026,Journal,,,,,100.00';
const decision={revision:7,brokerageCash:875.65,brokerageCashCurrent:true,brokerageCashObservedAt:'2026-11-25T15:00:00.000Z'};
function proposal(revision=7,extra={}){
 return {reviewId:'fictional-review-'+revision,revision,financialValid:true,window:{from:'2026-11-24',through:'2026-11-25'},
  statement:{rowCount:5,format:'CSV'},externalCapitalNet:100,pnlCashNet:.10,tradeCashAdjustment:.03,
  originalLedgerCash:775.43,afterKnownEventsCash:875.56,
  remainingRoundedBalanceAdjustment:{amount:.09,allowed:true,reason:'Fictional residual is within the existing small-balance limit.'},
  externalCapitalFlows:[{date:'2026-11-24',kind:'journal',netCash:200},{date:'2026-11-24',kind:'core-purchase',symbol:'ZZQB',netCash:-100}],
  pnlCashEvents:[{date:'2026-11-25',kind:'interest',netCash:.12},{date:'2026-11-25',kind:'fee',netCash:-.02}],
  matchedTradeNetCashAdjustments:[{date:'2026-11-25',symbol:'ZZQA',side:'sell',cashAdjustment:.03}],
  financialPreview:{allocations:[{sleeve:'base',rawHistoricalPeak:2000,adjustedOperationalReference:1800,currentEquity:1700,currentDrawdownPct:100/18}],
   preserved:['original fills','purchase dates','stops','historical loss records']},
  plannedSaleCorrection:{rows:[{symbol:'ZZQA',shares:4,allocationsBefore:[{sleeve:'base',shares:1},{sleeve:'cooldown15',shares:1},{sleeve:'sector40',shares:2}],
   allocationsAfter:[{sleeve:'sector40',shares:4}],remainingShares:16,basisBefore:1520,basisAfter:1518}]},...extra};
}
const nodes=node=>!node||typeof node!=='object'?[]:[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];
const text=node=>node==null||typeof node==='boolean'?'':typeof node==='string'||typeof node==='number'?String(node):React.Children.toArray(node.props?.children).map(text).join('');
function harness(overrides={}){
 const state={values:[],index:0},calls={review:[],confirm:[]};
 const props={decision:clone(decision),busy:false,onReview:async(value,revision)=>{calls.review.push({value,revision});return proposal(revision);},
  onConfirm:async payload=>{calls.confirm.push(clone(payload));return {reviewId:payload.reviewId};},...overrides};
 function render(){active=state;state.index=0;return Component(props);}
 const all=()=>nodes(render()),find=predicate=>{const found=all().find(predicate);assert(found,'Expected actual broker-cash review control');return found;};
 const checkbox=label=>find(node=>node.type==='input'&&node.props['aria-label']===label);
 return {props,calls,render,all,get visible(){return text(render());},
  input:()=>find(node=>node.type==='textarea'&&node.props['aria-label']==='Schwab statement text'),
  file:()=>find(node=>node.type==='input'&&node.props.type==='file'),
  confirmBox:()=>checkbox('Confirm statement correction'),attributionBox:()=>checkbox('Confirm planned sale correction'),
  confirmButton:()=>find(node=>node.type==='button'&&text(node).includes('Confirm account correction')),
  reviewButton:()=>find(node=>node.type==='button'&&node.props.type==='submit'),
  enter(value){this.input().props.onChange({target:{value}});},
  approve(){this.confirmBox().props.onChange({target:{checked:true}});},
  approveAttribution(){this.attributionBox().props.onChange({target:{checked:true}});},
  preview:()=>find(node=>node.type==='form').props.onSubmit({preventDefault(){}}),
  upload:async(file)=>find(node=>node.type==='input'&&node.props.type==='file').props.onChange({target:{files:[file],value:'fictional.csv'}})
 };
}
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
let cases=0;
async function check(name,run){await run();cases++;console.log('PASS '+name);}

(async()=>{
 await check('initial render and SSR show one current cash authority and make no callbacks',async()=>{
  const h=harness();assert(h.visible.includes('Current Schwab cash available to trade: $875.65'));
  assert(!h.visible.includes('$775.43'));assert(!h.visible.includes('$875.56'));assert.equal(h.calls.review.length,0);assert.equal(h.calls.confirm.length,0);
  assert.equal(h.input().props.value,'');assert.equal(h.file().props.accept,'.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain');
  const actual=load(React).default,server=require('react-dom/server');let callbacks=0;
  const html=server.renderToStaticMarkup(React.createElement(actual,{decision,onReview:()=>callbacks++,onConfirm:()=>callbacks++}));
  assert(html.includes('aria-label="Schwab statement text"'));assert(html.includes('type="file"'));assert(html.includes('$875.65'));assert.equal(callbacks,0);
 });
 await check('review is explicit, discloses cash/risk/basis evidence and needs both current confirmations',async()=>{
  const h=harness();h.enter(statement);assert.equal(h.calls.review.length,0,'Typing cannot POST a review or correction');await h.preview();
  assert.deepEqual(h.calls.review,[{value:statement,revision:7}]);
  for(const line of ['Net transfers and Core cash activity','Net income and fees','C1 trade cash differences from the statement','Remaining minor balance adjustment',
   'Interest and fees','Historical reconciliation audit','not additional cash available to spend','Original historical peak retained',
   'Cash-flow adjusted operational reference','Current drawdown','5.56%','same 12% loss protection','once per exit episode',
   'ZZQA: 4 shares already sold','Remaining account holding: 16 shares','$1,520.00 → $1,518.00'])assert(h.visible.includes(line),line);
  assert.equal(h.confirmBox().props.checked,false);assert.equal(h.attributionBox().props.checked,false);assert.equal(h.confirmButton().props.disabled,true);
  h.approve();assert.equal(h.confirmButton().props.disabled,true,'Cash confirmation does not approve changed sale attribution');
  h.approveAttribution();assert.equal(h.confirmButton().props.disabled,false);await h.confirmButton().props.onClick();
  assert.deepEqual(h.calls.confirm,[{reviewId:'fictional-review-7',statementText:statement,expectedRevision:7,confirmed:true,attributionConfirmed:true}]);
  assert(h.visible.includes('Statement correction saved in C1. No new broker trade was recorded.'));assert.equal(h.input().props.value,statement);
  assert.equal(h.confirmButton().props.disabled,true,'Matching saved receipt prevents accidental second submission');await h.confirmButton().props.onClick();assert.equal(h.calls.confirm.length,1);
 });
 await check('changed text or account revision invalidates a mounted review without losing its draft',async()=>{
  const h=harness();h.enter(statement);await h.preview();h.approve();h.approveAttribution();
  h.enter(statement+'\n');assert.equal(h.confirmButton().props.disabled,true);assert.equal(h.confirmBox().props.checked,false);assert(h.visible.includes('review is no longer current'));
  h.enter(statement);assert.equal(h.confirmButton().props.disabled,true,'Restoring old text does not restore an old confirmation');await h.preview();h.approve();h.approveAttribution();
  h.props.decision={...decision,revision:8};assert.equal(h.confirmButton().props.disabled,true);assert.equal(h.confirmBox().props.checked,false);assert.equal(h.input().props.value,statement);
  assert.equal(h.calls.confirm.length,0);await h.confirmButton().props.onClick();assert.equal(h.calls.confirm.length,0);await h.preview();
  assert.equal(h.calls.review.at(-1).revision,8);assert.equal(h.confirmBox().props.checked,false);
 });
 await check('review failures and unmatched/uncertain save receipts retain text and cannot report success',async()=>{
  const reviewFailure=harness({onReview:async()=>{throw Error('Fictional review rejection');}});reviewFailure.enter(statement);await reviewFailure.preview();
  assert.equal(reviewFailure.input().props.value,statement);assert(reviewFailure.visible.includes('Fictional review rejection'));assert(!reviewFailure.visible.includes('Statement correction saved in C1.'));
  for(const save of [async()=>{throw Error('Fictional uncertain response');},async()=>({reviewId:'wrong-receipt'})]){
   const h=harness({onConfirm:save});h.enter(statement);await h.preview();h.approve();h.approveAttribution();await h.confirmButton().props.onClick();
   assert.equal(h.input().props.value,statement);assert(!h.visible.includes('Statement correction saved in C1.'));assert(h.visible.includes('Reload the saved account and review again'));
   assert.equal(h.confirmButton().props.disabled,true);assert.equal(h.confirmBox().props.checked,false);
  }
 });
 await check('financial validation and residual bounds cannot be bypassed with checkbox events',async()=>{
  for(const extra of [{financialValid:false},{remainingRoundedBalanceAdjustment:{amount:6,allowed:false,reason:'Missing transaction evidence'}},{remainingRoundedBalanceAdjustment:{amount:0}}]){
   const h=harness({onReview:async()=>proposal(7,extra)});h.enter(statement);await h.preview();h.approve();h.approveAttribution();
   assert.equal(h.confirmButton().props.disabled,true);await h.confirmButton().props.onClick();assert.equal(h.calls.confirm.length,0);
  }
  const h=harness({onReview:async()=>proposal(7,{plannedSaleCorrection:null,financialPreview:null})});h.enter(statement);await h.preview();h.approve();assert.equal(h.confirmButton().props.disabled,false);
  assert(!h.all().some(node=>node.props?.['aria-label']==='Confirm planned sale correction'));assert(!h.visible.includes('Operational risk review'));
  await h.confirmButton().props.onClick();assert.equal(h.calls.confirm[0].attributionConfirmed,false);
 });
 await check('busy controls and stale asynchronous reviews cannot save or publish old evidence',async()=>{
  const h=harness();h.enter(statement);await h.preview();h.approve();h.approveAttribution();h.props.busy=true;
  assert.equal(h.input().props.disabled,true);assert.equal(h.file().props.disabled,true);assert.equal(h.confirmButton().props.disabled,true);await h.confirmButton().props.onClick();assert.equal(h.calls.confirm.length,0);
  const pending=defer(),late=harness({onReview:()=>pending.promise});late.enter(statement);const task=late.preview();
  assert.equal(late.reviewButton().props.disabled,true);late.props.decision={...decision,revision:8};late.render();pending.resolve(proposal(7));await task;
  assert(late.visible.includes('account changed during review'));assert(!late.visible.includes('Review before confirming'));assert.equal(late.input().props.value,statement);
 });
 await check('private file reading and pasted input enforce the 500 KB byte limit without automatic calls',async()=>{
  assert.equal(limit,500*1024);const h=harness();h.enter(statement);
  await h.upload({name:'too-large.csv',size:limit+1,text:async()=>{throw Error('Oversize file must not be read');}});assert.equal(h.input().props.value,statement);assert.equal(h.calls.review.length,0);
  const tsv='Date\tAction\tSymbol\tQuantity\tPrice\tFee\tAmount\n11/24/2026\tJournal\t\t\t\t\t100.00';
  await h.upload({name:'fictional-private.tsv',size:tsv.length,text:async()=>tsv});assert.equal(h.input().props.value,tsv);assert(h.visible.includes('Loaded fictional-private.tsv'));assert.equal(h.calls.review.length,0);
  h.enter('é'.repeat(limit/2+1));await h.preview();assert.equal(h.calls.review.length,0,'The limit counts UTF-8 bytes rather than only characters');assert(h.visible.includes('no larger than 500 KB'));assert.equal(h.input().props.value.length,limit/2+1);
  const failing=harness();failing.enter(statement);await failing.upload({name:'unreadable.csv',size:20,text:async()=>{throw Error('Fictional read error');}});assert.equal(failing.input().props.value,statement);assert(failing.visible.includes('Fictional read error'));
 });
 await check('a matching receipt warning is shown without discarding the entered statement',async()=>{
  const h=harness({onConfirm:async payload=>({reviewId:payload.reviewId,warning:'Fictional follow-up refresh required.'})});h.enter(statement);await h.preview();h.approve();h.approveAttribution();await h.confirmButton().props.onClick();
  assert(h.visible.includes('Statement correction saved in C1.'));assert(h.visible.includes('Fictional follow-up refresh required.'));assert.equal(h.input().props.value,statement);
 });
 console.log(`PASS: ${cases} fictional broker-cash review UI/SSR cases; explicit read/review/confirm, proposal binding, conserved drafts, file limits, disclosed risk/basis, guarded receipts and zero automatic writes.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
