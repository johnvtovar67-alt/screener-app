// Actual recorder component and exported display selector. Synthetic plans and
// explicitly entered fills only; no account storage, providers or execution.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const file=path.resolve('components/C1AccountActivity.js');
let stateIndex=0,fillState=[],hookState=null;
const mockReact={...React,useState:initial=>{
 const index=stateIndex++;
 if(hookState){if(!(index in hookState))hookState[index]=initial;return [hookState[index],next=>{hookState[index]=typeof next==='function'?next(hookState[index]):next;}];}
 return [index===1?fillState:initial,()=>{}];
}};
const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,
 presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const record={exports:{}};
new Function('require','module','exports',compiled)(name=>name==='react'?mockReact:name.startsWith('@babel/runtime/')?require('next/dist/compiled/'+name):require(name),record,record.exports);
const {default:Component,c1RecordableActivityOrders:select}=record.exports;
const copy=value=>structuredClone(value),names=orders=>orders.map(order=>order.symbol),get=(orders,id)=>orders.find(order=>order.id===id);
const order=(id,symbol,side,shares,extra={})=>({id,symbol,sleeve:'base',side,shares,estimatedPrice:100,...extra});
const plan={providerVerified:false,executable:false,
 openingBooks:{base:{cash:10000,positions:{MPC:{shares:10},VEEV:{shares:20},EL:{shares:30}}},cooldown15:{cash:0,positions:{}}},
 projectedBooks:{base:{cash:0,positions:{OKTA:{shares:35},PTC:{shares:40},TMO:{shares:50}}}},
 orders:[...['OKTA','PTC','TMO'].flatMap((symbol,index)=>[order('buy-'+symbol,symbol,'buy',35+index),
 order('stop-'+symbol,symbol,'sell',35+index,{condition:'stop-triggered'}),order('exit-'+symbol,symbol,'sell',35+index)]),
 order('stop-MPC','MPC','sell',50,{condition:'stop-triggered'}),order('exit-VEEV','VEEV','sell',20),
 order('stop-EL','EL','sell',30,{condition:'stop-triggered'}),order('wrong-sleeve','VEEV','sell',20,{sleeve:'cooldown15',condition:'stop-triggered'})]};
const before=JSON.stringify(plan),pending={date:'2026-11-12',openingObservedAt:'2026-11-12T14:30:00Z',revision:1,plan};
function render(value=pending,fills=[]){stateIndex=0;fillState=fills;return renderToStaticMarkup(React.createElement(Component,{pending:value,onSave:()=>{throw Error('No save allowed in render');},busy:false}));}
const eligible=select(plan);
assert.deepEqual(names(eligible),['MPC','VEEV','EL'],'Neither hypothetical buys, their stops nor same-day projected exits establish ownership');
assert.equal(get(eligible,'stop-MPC').shares,10,'Stop quantity is capped to actual opening shares');
const html=render();
for(const symbol of ['OKTA','PTC','TMO'])assert(!html.includes(symbol),'The actual dropdown must not imply an unheld '+symbol+' position');
assert(html.includes('C1 stop candidate: MPC')&&html.includes('10 shares'),'Actual held stop remains recordable with truthful quantity');
assert(html.includes('C1 sale candidate: VEEV')&&html.includes('C1 stop candidate: EL'));
assert(!get(eligible,'wrong-sleeve'),'Ownership in a different internal allocation cannot fund this stop');
assert.equal(select({...plan,openingBooks:undefined}).length,0,'Missing actual ownership cannot be reconstructed from projected books');
const fill=(id,orderId,symbol,side,shares)=>({id,orderId,symbol,side,shares,price:100,fee:0,executedAt:'2026-11-12T15:00:00Z'});
const verified={...copy(plan),providerVerified:true,executable:true};
assert(!get(select(verified),'stop-OKTA'),'Even a verified proposed Buy does not mean shares were acquired');
const bought=[fill('actual-buy','buy-OKTA','OKTA','buy',3)];
assert.equal(get(select(verified,bought),'stop-OKTA').shares,3,'A recorded partial purchase supports only acquired shares');
assert.equal(get(select(verified,bought),'exit-OKTA').shares,3,'The same real-ownership bound applies to unconditional exits');
const partialHtml=render({...pending,plan:verified},bought);
assert(partialHtml.includes('C1 stop candidate: OKTA')&&partialHtml.includes('OKTA · 3 shares'));
assert(!get(select(plan,bought),'stop-OKTA'),'Entered unverified reconstructed Buy cannot create ownership');
const sold=[...bought,fill('actual-sale','exit-OKTA','OKTA','sell',2)];
assert.equal(get(select(verified,sold),'stop-OKTA').shares,1,'Entered actual sales reduce available stop shares');
const stopped=[...bought,fill('actual-stop','stop-OKTA','OKTA','sell',1)];
assert.equal(get(select(verified,stopped),'stop-OKTA').shares,2,'A partial actual stop leaves only the unsold holding');
assert(!get(select(verified,[...bought,fill('flat','exit-OKTA','OKTA','sell',3)]),'stop-OKTA'),'A fully sold holding cannot remain a stop candidate');
assert.equal(get(select(verified,[...bought,copy(bought[0])]),'stop-OKTA').shares,3,'Repeated fill identity cannot double ownership support');
assert(!get(select(verified,[fill('wrong','buy-OKTA','PTC','buy',3)]),'stop-PTC'),'A mismatched fill cannot imply ownership');
assert(!get(select(verified,[fill('too-many','buy-OKTA','OKTA','buy',36)]),'stop-OKTA'),'An invalid fill above its planned quantity cannot fund a displayed stop');
for(const id of [undefined,'',null])assert(!get(select(verified,[fill(id,'buy-OKTA','OKTA','buy',3)]),'stop-OKTA'),'Missing actual fill identity cannot establish ownership');
for(const edit of [order=>{delete order.shares;},order=>{order.shares=NaN;},order=>{order.side='unknown';}]){
 const malformed=copy(verified);edit(malformed.orders.find(order=>order.id==='buy-OKTA'));
 assert(!get(select(malformed,bought),'stop-OKTA'),'A malformed proposed order cannot support ownership from a fill');
}
const realSell=[fill('held-sell','stop-MPC','MPC','sell',4)];
assert.equal(get(select(plan,realSell),'stop-MPC').shares,6,'Actual held-share sales are recordable without a verified purchase plan');
assert.equal(JSON.stringify(plan),before,'Presentation must not edit proposed orders, actual opening books or any account record');
// Exercise the real Add handler against the actual displayed holding cap.
hookState=[pending.date,[],'stop-MPC','11','100','0','2026-11-12T10:00',false,''];
function form(){stateIndex=0;const parent=Component({pending,onSave:()=>{throw Error('Unexpected save');},busy:false});const child=parent.props.children.find(node=>typeof node.type==='function');return child.type(child.props);}
function descendants(node){if(!node||typeof node!=='object')return [];return [node,...React.Children.toArray(node.props?.children).flatMap(descendants)];}
const addButton=()=>descendants(form()).find(node=>node.type==='button'&&node.props.children==='Add completed fill');
addButton().props.onClick();assert.match(hookState[8],/exceeds the remaining actual holding/);assert.equal(hookState[1].length,0,'An oversized actual stop entry is rejected before it can appear in the form');
hookState[3]='4';addButton().props.onClick();assert.equal(hookState[1].length,1);assert.equal(hookState[1][0].shares,4,'A real held partial stop remains recordable');
assert.equal(get(select(plan,hookState[1]),'stop-MPC').shares,6);
console.log('PASS: actual recorder hides unheld projected purchases/stops/exits, preserves real held sales/stops, caps quantities to exact allocation ownership and entered verified fills, subtracts actual sales, and never mutates financial inputs.');
