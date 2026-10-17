const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {c1HoldPillLabel:label,c1HoldPillStyle:style}=createResearchModuleLoader(process.cwd()).load('lib/c1HoldPill.js');
for(const value of ['Hold','HOLD','hold',' HOLD ']){
 assert.equal(label(value),'HOLD');assert.equal(style(value),style('HOLD'));
 assert.deepEqual(JSON.parse(JSON.stringify(style(value))),{display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',height:26,padding:'0 9px',fontSize:12,lineHeight:'24px',fontWeight:800,borderRadius:999,whiteSpace:'nowrap'});
 assert(!Object.keys(style(value)).some(k=>/color|background|margin|position/i.test(k)));
}
for(const value of ['Buy','Strong Buy','Add','Sell','SELL — STOP TRIGGERED','Verification needed','WATCH',null,undefined]){assert.equal(label(value),value);assert.equal(style(value),undefined);}
for(const [file,count] of [['pages/index.js',3],['components/C1AccountOpportunities.js',2]]){
 const source=fs.readFileSync(file,'utf8');assert.equal((source.match(/style=\{c1HoldPillStyle\(/g)||[]).length,count);assert.equal((source.match(/\{c1HoldPillLabel\(/g)||[]).length,count);
}
// Reverse the five declared presentation bindings and recover the exact
// deployed files. No handler, decision, color or layout body may drift.
for(const [file,labels,hash] of [
 ['pages/index.js',['a','displayAction'],'3697e36a01ecd7c5105125dd6365456302e7021d82b84c343964e5532b890849'],
 ['components/C1AccountOpportunities.js',["held?.label||(canPurchase?tile.rating:'NO PURCHASE')","row.holding?.label||'WATCH'"],'37d8898ef55fa9db4e5de509ab91449a571a264295dfec5f9f2465b3e94391d5']
]){
 let source=fs.readFileSync(file,'utf8').replace("<h2>{portfolioOnly?'Portfolio Action':'Opportunities'}</h2>","<h2>{portfolioOnly?'Portfolio actions':'Opportunities'}</h2>").replace("import {c1HoldPillLabel,c1HoldPillStyle} from '../lib/c1HoldPill';\n",'');
 for(const value of labels)source=source.replaceAll(' style={c1HoldPillStyle('+value+')} >{c1HoldPillLabel('+value+')}','>{'+value+'}');
 if(file==='pages/index.js')for(const [before,after] of require('./c1-non-cash-ui-seams.cjs')){assert.equal(source.split(after).length,2);source=source.replace(after,before);}
 assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'),hash,'Exact deployed source after reversing HOLD bindings: '+file);
}
console.log('PASS: all five HOLD pill paths share geometry and capitalization; colors and non-HOLD labels unchanged.');

assert(fs.readFileSync('components/C1AccountOpportunities.js','utf8').includes("<h2>{portfolioOnly?'Portfolio Action':'Opportunities'}</h2>"),'Exact requested visible Portfolio Action heading');
