// Actual recorder hooks/events with fictional observations and explicit owner
// input. No provider, account storage, brokerage, or real financial mutation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),babel=require('next/dist/compiled/babel/core');
const file=path.resolve('components/C1IntradayActivity.js');
let active;
const mockReact={...React,useMemo:calculate=>calculate(),useState:initial=>{
 const index=active.index++;
 if(!(index in active.state))active.state[index]=typeof initial==='function'?initial():initial;
 return [active.state[index],value=>{
  const next=typeof value==='function'?value(active.state[index]):value;
  active.writes.push({index,value:next});active.state[index]=next;
 }];
}};
const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,
 presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const record={exports:{}};
new Function('require','module','exports',compiled)(name=>name==='react'?mockReact:name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),record,record.exports);
const Component=record.exports.default,copy=value=>JSON.parse(JSON.stringify(value));
const order=(id,symbol,side,shares,extra={})=>({id,symbol,side,shares,sleeve:'base',estimatedPrice:100,...extra});
const base={date:'2026-11-16',revision:7,sellOnly:true,fills:[],tickets:[],
 plan:{providerVerified:false,executable:false,recordingOnly:true,
  openingBooks:{base:{cash:5000,positions:{ZZQA:{shares:5,avgCost:100,openedAt:'2026-11-13'},ZZQD:{shares:4,avgCost:90,openedAt:'2026-11-12'}}},
   cooldown15:{cash:5000,positions:{ZZQA:{shares:10,avgCost:100,openedAt:'2026-11-13'}}},sector40:{cash:5000,positions:{ZZQA:{shares:5,avgCost:100,openedAt:'2026-11-13'}}}},
  projectedBooks:{base:{cash:0,positions:{ZZQZ:{shares:99}}}},
  orders:[order('stop-a','ZZQA','sell',5,{condition:'stop-triggered'}),order('hypothetical-buy','ZZQZ','buy',99),order('hypothetical-stop','ZZQZ','sell',99,{condition:'stop-triggered'})]},
 issuedChoices:[{symbol:'ZZQB',side:'buy',shares:3,allocations:[{order:order('issued-base','ZZQB','buy',2),shares:2},{order:order('issued-cool','ZZQB','buy',1,{sleeve:'cooldown15'}),shares:1}]}]};
function nodes(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node==='string'||typeof node==='number')return String(node);return React.Children.toArray(node.props?.children).map(text).join('');}
function harness(session=copy(base),save){
 const state={state:[],writes:[],index:0},calls=[];let busy=false;
 const props={session,onCorrectDetails:()=>{throw Error('Unexpected correction');},onSave:async(ticket,revision)=>{
  calls.push({ticket:copy(ticket),revision});return save?save(ticket,revision,calls.length):{ticket,view:{decision:{brokerageCash:1234.56}}};
 }};
 function render(){active=state;state.index=0;return Component({...props,busy});}
 const all=()=>nodes(render()),find=predicate=>{const result=all().find(predicate);assert(result,'Expected real form element');return result;};
 const input=label=>find(node=>node.type==='input'&&node.props['aria-label']===label);
 const select=()=>find(node=>node.type==='select'&&node.props['aria-label']==='Completed trade');
 const confirm=()=>find(node=>node.type==='input'&&node.props.type==='checkbox');
 const button=label=>find(node=>node.type==='button'&&text(node)===label);
 return {state,calls,props,render,all,input,select,confirm,button,
  options:()=>all().filter(node=>node.type==='option').map(node=>({value:node.props.value,label:text(node)})),
  choose(value){select().props.onChange({target:{value}});},
  enter(label,value){input(label).props.onChange({target:{value}});},
  approve(value=true){confirm().props.onChange({target:{checked:value}});},
  submit:()=>find(node=>node.type==='form').props.onSubmit({preventDefault(){}}),
  get visible(){return text(render());},set busy(value){busy=value;}
 };
}
function details(h,shares='2'){
 h.enter('Shares filled',shares);h.enter('Execution price','101.25');h.enter('Fee','0.08');h.enter('Execution time','2026-11-16T10:05:47');
}
async function run(){
 const baseline=JSON.stringify(base),issued=harness();
 const retained=issued.options().find(row=>row.value==='issued:buy:ZZQB');
 assert(retained&&retained.label.includes('Retained C1 buy')&&retained.label.includes('3 shares'),'A retained issued Buy survives sell-only fallback');
 assert(!issued.options().some(row=>row.value==='planned:buy:ZZQZ'||row.value==='completed-add:ZZQZ'),'Projected unowned shares cannot create a completed-add recovery choice');
 assert(!issued.options().some(row=>row.value==='completed-add:ZZQB'),'A retained new-position receipt is distinct from legacy held-position recovery');
 const laterOffer=copy(base);laterOffer.issuedChoices.push({symbol:'ZZQA',side:'buy',shares:2,allocations:[]});
 assert(harness(laterOffer).options().some(row=>row.value==='completed-add:ZZQA'),'A later retained offer cannot hide recovery of an earlier unretained real Add');
 issued.choose(retained.value);details(issued);
 assert.equal(issued.input('Execution time').props.step,'1','Broker execution seconds must be enterable');
 assert.match(issued.visible,/not current permission to buy/);
 assert.equal(issued.button('Save trade and update C1').props.disabled,true);
 await issued.submit();assert.equal(issued.calls.length,0,'Neither typed details nor a retained receipt confirms a broker fill');
 issued.approve();assert.equal(issued.button('Save trade and update C1').props.disabled,false);
 const beforeSuccess=issued.state.writes.length;
 await issued.submit();
 assert.equal(issued.calls.length,1);const posted=issued.calls[0];
 assert.equal(posted.revision,7);assert.equal(posted.ticket.recordingReason,'recorded-issued-buy');
 assert.equal(posted.ticket.symbol,'ZZQB');assert.equal(posted.ticket.side,'buy');assert.equal(posted.ticket.shares,2);
 assert.equal(posted.ticket.price,101.25);assert.equal(posted.ticket.fee,0.08);
 assert.equal(posted.ticket.executedAt,new Date('2026-11-16T10:05:47').toISOString(),'An actual same-minute fill cannot be truncated before its issuance');
 for(const key of ['allocations','providerVerified','executable','authorization','orderId','plan'])assert(!Object.hasOwn(posted.ticket,key),'The form cannot invent '+key+' for a retained server-issued entry');
 const changed=issued.state.writes.slice(beforeSuccess);
 for(const [index,value]of [[0,''],[1,''],[2,''],[4,''],[5,false],[7,null]])assert.equal(changed.filter(row=>row.index===index&&row.value===value).length,1,'Successful receipt resets field '+index+' exactly once');
 assert.equal(changed.filter(row=>row.index===8&&row.value).length,1,'One matching receipt is displayed');
 assert.equal(issued.select().props.value,'');assert.equal(issued.input('Shares filled').props.value,'');assert.equal(issued.confirm().props.checked,false);
 assert.match(issued.visible,/Saved in C1:.*Bought 2 ZZQB at \$101\.25/);
 issued.render();assert.equal(issued.calls.length,1,'Rendering a receipt cannot replay the write');
 await issued.submit();assert.equal(issued.calls.length,1,'A cleared form cannot submit the same trade again');

 const single=harness({...copy(base),issuedChoices:[]});single.choose('completed-add:ZZQD');details(single);single.approve();await single.submit();
 assert.deepEqual(single.calls[0].ticket.allocations,[{sleeve:'base',shares:2}]);
 assert.equal(single.calls[0].ticket.recordingReason,'owner-confirmed-completed-add');
 assert(!Object.hasOwn(single.calls[0].ticket,'providerVerified'),'Owner-reported legacy recovery is not labeled as issued C1 authority');

 const multi=harness({...copy(base),issuedChoices:[]});multi.choose('completed-add:ZZQA');details(multi,'3');
 const fields=multi.all();assert(fields.indexOf(fields.find(node=>node.type==='input'&&node.props['aria-label']==='Shares filled'))<fields.indexOf(fields.find(node=>node.type==='button'&&text(node)==='Propose using existing holding proportions')),'Enter actual quantity before the allocation proposal');
 for(const name of ['Base','15-session allocation','40% sector allocation'])assert.equal(multi.input('Filled shares for '+name).props.value,'','No distribution is silently inferred before owner action');
 multi.approve();await multi.submit();assert.equal(multi.calls.length,0,'Confirmation cannot save an unspecified multi-allocation attribution');
 assert.match(multi.visible,/must total 3 added shares.*Propose using existing holding proportions/,'The validation message identifies the missing split and next action');
 assert.match(multi.visible,/recovery attribution, not a verified reconstruction/);
 multi.button('Propose using existing holding proportions').props.onClick();
 assert.equal(multi.confirm().props.checked,false,'A proposed distribution withdraws the prior confirmation');
 for(const name of ['Base','15-session allocation','40% sector allocation'])assert.equal(multi.input('Filled shares for '+name).props.value,'1');
 await multi.submit();assert.equal(multi.calls.length,0,'Clicking the proposal is not approval of a filled trade or allocation');
 assert.match(multi.visible,/approve the recovery allocation shown above/);
 multi.approve();await multi.submit();assert.equal(multi.calls.length,1);
 assert.deepEqual(multi.calls[0].ticket.allocations,[{sleeve:'base',shares:1},{sleeve:'cooldown15',shares:1},{sleeve:'sector40',shares:1}]);
 assert.equal(multi.calls[0].ticket.shares,3);

 const retry=harness(copy(base),(ticket,_revision,attempt)=>{if(attempt===1)throw Error('Synthetic uncertain response');return {ticket,view:{decision:{brokerageCash:1000}}};});
 retry.choose('issued:buy:ZZQB');details(retry);retry.approve();await retry.submit();
 assert.equal(retry.calls.length,1);assert.equal(retry.input('Shares filled').props.value,'2','An uncertain response retains the entered fill');
 await retry.submit();assert.equal(retry.calls.length,2);assert.equal(retry.calls[0].ticket.id,retry.calls[1].ticket.id,'An explicit retry keeps its original identity');
 assert.match(retry.visible,/Saved in C1:/);assert.equal(retry.select().props.value,'');
 assert.equal(JSON.stringify(base),baseline,'Real form events cannot mutate source plans, holdings, issued evidence or financial records');
 console.log('PASS: actual completed-trade form retains issued buys through sell-only fallback, submits explicit broker facts, requires allocation approval, rejects phantom recovery, preserves retry identity and clears only after one matching receipt.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
