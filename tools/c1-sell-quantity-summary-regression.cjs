// Presentation-only checks with fictional ownership. Actual quantity helper and
// React view; no account storage, provider, brokerage, or financial mutation.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),babel=require('next/dist/compiled/babel/core');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd()),{c1RecordedSellInstruction:sell}=loader.load('lib/c1PositionPresentation.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const symbol='ZZQA',stops=[{sleeve:'base',shares:3,price:90},{sleeve:'cooldown15',shares:5,price:80},{sleeve:'sector40',shares:2,price:70}];
const position={symbol,role:'Swing',shares:10,avgCost:100,openedAt:'2026-11-10',stops,exits:[]};
const pending={action:'Sell',label:'SELL — MOMENTUM EXIT',reason:'Fictional confirmed momentum exit.',stopTriggered:false,quoteVerified:false,openingExits:[]};
const fullPosition={...clone(position),exits:stops.map(row=>({...row,reason:'recent-momentum-deterioration'}))};
const partialPosition={...clone(position),exits:[{sleeve:'base',shares:3,reason:'initial-stop'}]};
const partialPresentation={...pending,label:'SELL — STOP TRIGGERED',reason:'Fictional recorded stop exit.',stopTriggered:true,openingExits:[{sleeve:'base',shares:3,reason:'initial-stop'}]};
const cases=[
 {name:'full ticker exit',position:fullPosition,presentation:pending,shares:10,recorded:10,remaining:0,scope:'Full exit: 10 of 10 recorded shares. 0 shares would remain after this sale fills.'},
 {name:'partial allocation stop',position:partialPosition,presentation:partialPresentation,shares:3,recorded:10,remaining:7,scope:'Partial sale: 3 of 10 recorded shares. 7 shares would remain after this sale fills. C1 recorded stop rules still apply to the remaining shares.'},
 {name:'fresh quote breaches one stop only',position:clone(position),presentation:{...partialPresentation,openingExits:[],quoteVerified:true,quotePrice:85},shares:3,recorded:10,remaining:7},
 {name:'duplicate oversized sleeve exits',position:{...clone(position),exits:[{sleeve:'base',shares:300,reason:'initial-stop'},{sleeve:'base',shares:3,reason:'initial-stop'}]},presentation:pending,shares:3,recorded:10,remaining:7},
 {name:'one share remains',position:{...clone(position),exits:[{sleeve:'base',shares:3},{sleeve:'cooldown15',shares:5},{sleeve:'sector40',shares:1}]},presentation:pending,shares:9,recorded:10,remaining:1},
 {name:'unknown holding',position:{...clone(partialPosition),shares:undefined},presentation:pending,shares:null,recorded:null,remaining:null},
 {name:'unknown exit quantity',position:clone(position),presentation:pending,shares:null,recorded:10,remaining:null},
];
for(const sample of cases){
 const before=JSON.stringify(sample),result=sell(sample.position,sample.presentation);
 assert.equal(result.shares,sample.shares,sample.name+': existing authoritative sell quantity is unchanged');
 assert.equal(result.recordedShares,sample.recorded,sample.name+': current recorded holding is unchanged');
 assert.equal(result.remainingShares,sample.remaining,sample.name+': remainder describes only the stated prospective sale');
 if(sample.scope)assert.equal(result.scopeText,sample.scope);
 if(sample.remaining===null){
  assert.equal(result.scopeText,null,sample.name+': missing evidence cannot be described as zero shares or a full exit');
  assert.equal(result.next,'Verify the exit quantity against the recorded sleeve holdings in Schwab, then record the actual fill after execution.');
 }else{
  assert.match(result.scopeText,/would remain after this sale fills/,'The new text never implies broker execution');
  assert.equal(result.next,`Sell ${sample.shares} ${sample.shares===1?'share':'shares'} in Schwab after confirming the current execution price. Record the actual fill in C1 only after Schwab confirms execution.`,'The original execution/fill instruction remains unchanged');
 }
 assert.equal(result.status,'Sell instruction only; C1 has not submitted or confirmed a Schwab order.');
 assert.equal(JSON.stringify(sample),before,'Scope formatting cannot alter holdings, stops, exit evidence or presentation');
 sample.instruction=result;
}
assert.match(cases.find(row=>row.name==='one share remains').instruction.scopeText,/1 share would remain/);
assert.equal(sell(position,{action:'Hold'}),null,'Scope copy cannot create a Sell from Hold');

const file=path.resolve('components/C1AccountOpportunitiesView.js');
const compiled=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve('next/babel'),{'preset-env':{modules:'commonjs'}}]]}).code;
const record={exports:{}};
new Function('require','module','exports',compiled)(name=>name.startsWith('../lib/')?loader.load(name,file):name==='react'?React:require(name.startsWith('@babel/runtime/')?'next/dist/compiled/'+name:name),record,record.exports);
const render=record.exports.renderC1AccountOpportunitiesView;
function projection(sample,portfolioOnly){
 const instruction=sample.instruction,order=instruction.shares?{id:'fictional-checked-sell',symbol,side:'sell',shares:instruction.shares,estimatedPrice:95}:null;
 return {portfolioOnly,evidence:{pending:false},openingError:null,ready:false,decision:{current:true,sourceSessionDate:'2026-11-18',brokerageCash:1000,actionVersion:'fictional-action'},
  presentation:{},sellActions:[{symbol,holding:sample.presentation,stops:stops.map(row=>row.price),sellInstruction:instruction}],plainReason:()=>sample.presentation.reason,
  positionOrders:order?[order]:[],actionableBuys:[],holdingPresentation:()=>sample.presentation,verifyActions:[],exits:order?[order]:[],orders:order?[order]:[],
  ratedTiles:[{symbol,rating:'Watch',entryEvidence:{sector:'Fictional sector',close:95,momentumScore:80}}],waitingReason:'Purchase authorization remains separate.',actionTone:()=> 'red',buys:[],watch:[],watchView:{rows:[]},ratedRows:[]};
}
for(const sample of [cases[0],cases[1],cases[5],cases[6]])for(const portfolioOnly of [true,false]){
 const input=projection(sample,portfolioOnly),before=JSON.stringify(input),html=renderToStaticMarkup(render(input));
 if(sample.instruction.scopeText){
  assert(html.includes(sample.instruction.scopeText),'The actual '+(portfolioOnly?'Portfolio Action':'held Opportunities')+' view renders the exact sale scope');
  assert.match(html,/saleScope/);
  if(portfolioOnly)assert(html.includes(`Checked recommendation: sell ${sample.shares} shares`),'New copy does not replace or alter checked order quantity');
  else assert(html.includes(`SELL ${sample.shares} shares`),'Held Opportunities retains its existing Sell quantity');
 }else{
  assert(!/<p[^>]*class="[^"]*saleScope/.test(html),'Unknown scope cannot acquire full/partial numeric copy in either view');
  assert(!html.includes('Full exit:')&&!html.includes('0 shares would remain'),'Unknown quantity is not presented as a completed or full exit');
 }
 assert.equal(JSON.stringify(input),before,'Rendering cannot change plan quantities or any supplied account observations');
}
console.log('PASS: full/partial Sell scope and conditional shares remaining render consistently in Portfolio and held Opportunities; unknown evidence remains unknown, original quantities/instructions and all inputs stay unchanged.');
