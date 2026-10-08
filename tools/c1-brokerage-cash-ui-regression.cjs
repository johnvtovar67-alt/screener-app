const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const modules=createResearchModuleLoader(process.cwd());
function component(relative,react=React){
 const file=path.resolve(relative),record={exports:{}};
 const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
 new Function('require','module','exports',code)(name=>name==='react'?react:name.startsWith('../lib/')?modules.load(name,file):require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
 return record.exports.default;
}
// Exercise the real component handlers and hook state without adding a DOM
// dependency to the regression runner. Server rendering below checks its HTML.
function cashHarness(initialProps){
 const hooks=[];let cursor=0,effects=[],dirty=false,tree,props=initialProps;
 const slot=initialize=>{const index=cursor++;if(!(index in hooks))hooks[index]=initialize();return index;};
 const react={...React,
  useState:initial=>{const index=slot(()=>typeof initial==='function'?initial():initial);return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value;dirty=true;}];},
  useEffect:(effect,deps)=>{const index=cursor++,prior=hooks[index];if(!prior||!deps||deps.some((value,i)=>!Object.is(value,prior[i]))){hooks[index]=deps;effects.push(effect);}},
  useId:()=>hooks[slot(()=>':cash-ui-test:')],
  useRef:initial=>hooks[slot(()=>({current:initial}))]
 };
 const Cash=component('components/C1BrokerageCash.js',react);
 function render(patch={}){
  props={...props,...patch};let passes=0;
  do{assert.ok(++passes<20,'Cash component effects must settle');dirty=false;cursor=0;effects=[];tree=Cash(props);for(const effect of effects)effect();}while(dirty);
  return tree;
 }
 render();return {render,get tree(){return tree;}};
}
function elements(tree,visible=true,result=[]){
 if(!React.isValidElement(tree))return result;
 visible=visible&&!tree.props.hidden;result.push({element:tree,visible});
 React.Children.forEach(tree.props.children,child=>elements(child,visible,result));return result;
}
function content(tree){
 if(tree==null||typeof tree==='boolean')return '';
 if(typeof tree==='string'||typeof tree==='number')return String(tree);
 return React.Children.toArray(React.isValidElement(tree)?tree.props.children:tree).map(content).join('');
}
function one(harness,predicate,visible=true){
 const matches=elements(harness.tree).filter(row=>(visible===null||row.visible===visible)&&predicate(row.element));
 assert.equal(matches.length,1,'Expected exactly one matching cash editor element');return matches[0].element;
}
const updateButton=harness=>one(harness,node=>node.type==='button'&&content(node)==='Update');
const cashInput=(harness,visible=true)=>one(harness,node=>node.type==='input'&&node.props['aria-label']==='Actual brokerage cash',visible);
const editor=harness=>one(harness,node=>node.props.id===updateButton(harness).props['aria-controls'],null);
const status=(harness,text)=>one(harness,node=>node.props.role==='status'&&content(node)===text);
async function exerciseCashEditor(decision){
 const calls=[],harness=cashHarness({decision,onSave:async(...args)=>{calls.push(args);}});
 assert.equal(updateButton(harness).props.type,'button');
 assert.equal(updateButton(harness).props['aria-expanded'],false);
 assert.ok(updateButton(harness).props['aria-controls']);
 assert.equal(editor(harness).props.hidden,true,'The mounted editor is hidden by default');
 assert.equal(cashInput(harness,false).props.value,'363.36','Existing broker cash initializes the input');
 assert.equal(elements(harness.tree).filter(row=>row.visible&&row.element.type==='input').length,0);
 updateButton(harness).props.onClick();harness.render();
 assert.equal(updateButton(harness).props['aria-expanded'],true);
 assert.equal(editor(harness).props.hidden,false,'Update reveals the existing editor');
 assert.equal(cashInput(harness).props.min,'0');assert.equal(cashInput(harness).props.step,'0.01');
 assert.equal(cashInput(harness).props.disabled,false);
 one(harness,node=>node.type==='button'&&node.props.type==='submit'&&content(node)==='Update Brokerage Cash');
 cashInput(harness).props.onChange({target:{value:'400.01'}});harness.render();
 await one(harness,node=>node.type==='form').props.onSubmit({preventDefault(){}});
 harness.render({decision:{...decision,brokerageCash:400.01,executableCash:400.01}});
 assert.deepEqual(calls,[[400.01,decision.revision]],'Save preserves the amount and expected revision arguments');
 assert.equal(editor(harness).props.hidden,true,'A confirmed save collapses the editor');
 assert.equal(updateButton(harness).props['aria-expanded'],false);
 status(harness,'Brokerage cash saved. C1 strategy accounting is unchanged.');
 assert.match(content(harness.tree),/Brokerage cash \$400\.01/);
 assert.match(content(harness.tree),/C1 strategy cash \$3,037\.90/);

 const failedCalls=[],failed=cashHarness({decision,onSave:async(...args)=>{failedCalls.push(args);throw new Error('Revision conflict');}});
 updateButton(failed).props.onClick();failed.render();
 await one(failed,node=>node.type==='form').props.onSubmit({preventDefault(){}});failed.render();
 assert.deepEqual(failedCalls,[[363.36,decision.revision]]);
 assert.equal(editor(failed).props.hidden,false,'A rejected save retains the editor');
 one(failed,node=>node.props.role==='alert'&&content(node)==='Revision conflict');
 assert.equal(elements(failed.tree).filter(row=>row.visible&&row.element.props.role==='status'&&content(row.element).startsWith('Brokerage cash saved.')).length,0);
 cashInput(failed).props.onChange({target:{value:'1.001'}});failed.render();
 await one(failed,node=>node.type==='form').props.onSubmit({preventDefault(){}});failed.render();
 assert.equal(failedCalls.length,1,'Invalid cents precision does not call Save');
 assert.equal(editor(failed).props.hidden,false);
 one(failed,node=>node.props.role==='alert'&&content(node)==='Enter a nonnegative brokerage cash balance with cents precision.');

 let resolveSave;const pendingCalls=[],pending=cashHarness({decision,onSave:(...args)=>{pendingCalls.push(args);return new Promise(resolve=>{resolveSave=resolve;});}});
 updateButton(pending).props.onClick();pending.render();
 const saving=one(pending,node=>node.type==='form').props.onSubmit({preventDefault(){}});
 pending.render({busy:true});
 assert.equal(editor(pending).props.hidden,false,'An unfinished save keeps the editor open');
 assert.equal(updateButton(pending).props.disabled,true);assert.equal(cashInput(pending).props.disabled,true);
 assert.equal(one(pending,node=>node.type==='button'&&node.props.type==='submit'&&content(node)==='Saving brokerage cash…').props.disabled,true);
 resolveSave();await saving;pending.render({busy:false});
 assert.deepEqual(pendingCalls,[[363.36,decision.revision]]);assert.equal(editor(pending).props.hidden,true);
 status(pending,'Brokerage cash saved. C1 strategy accounting is unchanged.');

 const missing=cashHarness({onSave:()=>{throw new Error('Missing account must not save');}});
 assert.equal(updateButton(missing).props.disabled,true);assert.equal(cashInput(missing,false).props.disabled,true);
 status(missing,'Connect and load the saved C1 account to update brokerage cash.');
 const stale=cashHarness({decision:{...decision,brokerageCashCurrent:false,brokerageCashReason:'Brokerage cash is from an earlier Eastern date.'},onSave:()=>{}});
 status(stale,'Brokerage cash is from an earlier Eastern date.');
 one(stale,node=>node.type==='p'&&content(node).startsWith('Broker balance observed ')&&content(node).endsWith(' · Update required'));
 assert.equal(editor(stale).props.hidden,true,'Freshness messages remain visible with the editor collapsed');
}
const RealDate=Date;
global.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-14T14:00:00Z']));}static now(){return RealDate.parse('2026-09-14T14:00:00Z');}};
async function main(){
 const Cash=component('components/C1BrokerageCash.js'),Opportunities=component('components/C1AccountOpportunities.js');
 const holding={symbol:'AAA',role:'Swing',shares:10,avgCost:100,price:99,openedAt:'2026-09-11',action:'Hold',stops:[{price:86}],exits:[],reviewRules:[],reason:'C1 hold'};
 const candidate=(symbol,rank)=>({symbol,sector:rank===1?'Technology':'Health',issuer:'name:'+symbol,sourcePrice:100,researchRank:rank,momentumPercentile:100-rank,sourceTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}});
 const decision={contract:'c1-account-decision-v1',decisionId:'synthetic-cash',revision:2,current:true,sourceSessionDate:'2026-09-11',positions:[holding],strategyCash:3037.90,actualCash:3037.90,brokerageCash:363.36,executableCash:363.36,brokerageCashCurrent:true,brokerageCashObservedAt:new Date().toISOString(),stockScreen:{contract:'c1-stock-screen-v1',sourceSessionDate:'2026-09-11',candidates:[candidate('BBB',1),candidate('CCC',2)]}};
 const row=(symbol,pass=true)=>({symbol,price:100,eventRisk:{status:'Clear'},entryTiming:{available:true,liquidityPass:pass,averageDollarVolume20:pass?500000000:100000000},recommendation:{expertDecision:{strongBuyPass:false,metrics:{quoteFreshnessPass:true}}}});
 const screenRows=[row('BBB'),row('CCC',false)];
 const openingPlan={contract:'c1-actual-account-opening-plan-v1',providerVerified:true,quoteValidUntil:'2026-09-14T14:02:00Z',sourceSessionDate:decision.sourceSessionDate,date:'2026-09-14',observedAt:new Date().toISOString(),sourceReceipt:{observedAt:new Date().toISOString(),membershipCheckedTwice:true,previousAdjustedClosesUnchanged:true},orders:[{id:'exit',symbol:'AAA',side:'sell',shares:10,estimatedPrice:99,phase:1}],entryReviews:[{symbol:'BBB',reason:'brokerage-cash-insufficient'}]};
 const {buildC1ManualRecommendations}=modules.load('lib/c1ManualRecommendations.js');
 const renderCash=patch=>renderToStaticMarkup(React.createElement(Cash,{decision:{...decision,...patch},onSave:()=>{}}));
 const cash=renderCash({});
 assert.match(cash.replace(/<[^>]*>/g,''),/Brokerage cash \$363\.36 · C1 strategy cash \$3,037\.90 · Available to deploy \$363\.36/);
 assert.match(cash,/aria-label="Actual brokerage cash"/);assert.match(cash,/Update Brokerage Cash/);
 assert.match(cash,/aria-expanded="false"/);assert.match(cash,/hidden=""/);assert.doesNotMatch(cash,/<h2/);
 const missing=renderToStaticMarkup(React.createElement(Cash,{onSave:()=>{}}));
 assert.match(missing,/Connect and load the saved C1 account/);assert.match(missing,/<input[^>]*disabled/);assert.match(missing,/<button[^>]*disabled/);
 assert.match(renderCash({brokerageCashCurrent:false,brokerageCashReason:'Brokerage cash is from an earlier Eastern date.'}),/Brokerage cash is from an earlier Eastern date/);
 for(const balance of [363.36,0]){
  const current={...decision,brokerageCash:balance,executableCash:balance};
  const review=buildC1ManualRecommendations({decision:current,openingPlan});
  assert.equal(review.status,'ready');
  const props={decision:current,openingPlan,manualRecommendations:review,screenRows,screenCurrent:true};
  const opportunities=renderToStaticMarkup(React.createElement(Opportunities,props));
  assert.match(opportunities,/C1 strategy cash: \$3,037\.90/);
  assert.match(opportunities,new RegExp('Brokerage cash: \\$'+balance.toFixed(2).replace('.','\\.')));
  assert.match(opportunities,/<h3[^>]*>BBB<\/h3><b[^>]*>Buy<\/b>/,'A cash cap cannot downgrade the Buy signal');
  assert.match(opportunities,/C1 qualifies this stock, but available brokerage cash is insufficient for a new purchase/);
  assert.match(opportunities,/aria-label="Watch opportunities"/);assert.match(opportunities,/<b[^>]*>CCC<\/b>/,'Existing Watch analysis remains visible');
  assert.doesNotMatch(opportunities,/currently ineligible|Buy \d+ shares/);
  const exits=renderToStaticMarkup(React.createElement(Opportunities,{...props,view:'portfolio'}));
  assert.match(exits,/sell 10 shares/,'Zero brokerage cash must preserve checked exits');
  assert.doesNotMatch(exits,/C1 recommendation/);
 }
 const oldAccount={...decision,brokerageCash:null,executableCash:0,brokerageCashCurrent:false,brokerageCashReason:'Enter current brokerage cash.'};
 const oldHtml=renderToStaticMarkup(React.createElement(Opportunities,{decision:oldAccount,screenRows,screenCurrent:true}));
 assert.match(oldHtml,/Brokerage cash: Not entered/);assert.match(oldHtml,/<h3[^>]*>BBB<\/h3><b[^>]*>Buy<\/b>/);assert.match(oldHtml,/Watch opportunities/);assert.match(oldHtml,/Enter current brokerage cash/);
 await exerciseCashEditor(decision);
 console.log('PASS: compact cash summary reveals the unchanged editor, collapses only after successful save, preserves disabled/error/freshness status, and retains Buy/Watch analysis and checked exits without authorizing purchases.');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.Date=RealDate;});
