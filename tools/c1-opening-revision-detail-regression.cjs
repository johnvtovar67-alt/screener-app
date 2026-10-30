const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createWorkflowFixture}=require('./fixtures/c1-trading-workflow.cjs');
const {restore}=require('./c1-opening-revision-detail-seams.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const f=createWorkflowFixture();f.setCash(5000);
const logs=[],source=fs.readFileSync('lib/c1OpeningPriceReview.js','utf8');
function load(text){
 const deps={};text=text.replace(/import\s*{([^}]+)}\s*from\s*['"]([^'"]+)['"];?/g,(_,names,file)=>{const m=f.loader.load(file,require('node:path').resolve('lib/c1OpeningPriceReview.js'));for(const name of names.split(',').map(n=>n.trim()))deps[name]=m[name];return '';}).replace(/export function /g,'function ');
 const box={...deps,console:{warn:(...args)=>logs.push(args)},Date};vm.createContext(box);vm.runInContext(text+';globalThis.exports={reviewC1OpeningPriceRevisions,verifiedC1OpeningPriceBasis,...(typeof c1OpeningRevisionFailure===\'function\'?{c1OpeningRevisionFailure}: {})};',box);return box.exports;
}
const old=load(restore(source)),current=load(source),explain=current.c1OpeningRevisionFailure;
const base={orders:[],blockedOrders:[],entryReviews:[],openingBooks:{base:{cash:5555,positions:{}}},projectedBooks:{},riskBySleeve:{base:{paused:false}}};
for(const [category,field] of [['orders','shares'],['blockedOrders','estimatedPrice'],['entryReviews','reason']]){
 const a=clone(base),b=clone(base);a[category]=[{symbol:'MRNA',side:'buy',[field]:123456789}];b[category]=[{symbol:'MRNA',side:'buy',[field]:987654321}];
 const bytes=JSON.stringify([a,b]),message=explain('opening',a,b);assert.match(message,new RegExp(category+' MRNA '+field));assert(message.length+32<=200);assert.equal(JSON.stringify([a,b]),bytes);
}
for(const category of ['orders','blockedOrders','entryReviews']){const b=clone(base);b[category]=[{symbol:'TGT',side:'buy',id:'SECRET_ID',shares:987654321}];assert.match(explain('current-price',base,b),new RegExp(category+' TGT membership'));}
const changed=clone(base);changed.orders=[{symbol:'MRNA',side:'buy'}];const other=clone(changed);other.orders[0].symbol='TGT';assert.match(explain('opening',changed,other),/orders MRNA TGT symbol/);
const cash=clone(base);cash.openingBooks.base.cash=987654321;assert.match(explain('opening',base,cash),/openingBooks cash/);
const pa=clone(base),pb=clone(base);pa.openingBooks.base.positions.CRWD={shares:123456789,avgCost:99};pb.openingBooks.base.positions.CRWD={shares:987654321,avgCost:99};assert.match(explain('opening',pa,pb),/openingBooks CRWD shares/);
const risk=clone(base);risk.riskBySleeve.base.paused=true;assert.match(explain('opening',base,risk),/riskBySleeve paused/);
const hostile=clone(base);hostile.orders=[{symbol:'PRIVATE_ACCOUNT_ID<script>',shares:987654321}];assert(!explain('opening',base,hostile).includes('PRIVATE_ACCOUNT'));
const logged=JSON.stringify(logs);for(const forbidden of ['MRNA','TGT','CRWD','123456789','987654321','5555','SECRET_ID','PRIVATE_ACCOUNT'])assert(!logged.includes(forbidden),forbidden+' must not enter telemetry');
const sessions=f.book.model.sessions.filter(s=>s.date>=f.account.adoption.sourceSessionDate),saved=sessions.at(-1).prices.find(p=>p.symbol==='MRNA');
const {planC1ContinuedAccountOpening:plan}=f.loader.load('lib/c1AccountExecution.js');
const {c1CompletionPolicy}=f.loader.load('lib/c1AccountLedger.js');
const before=JSON.stringify({account:f.account,book:f.book});
for(const close of [100,99.99,99.9,99])for(const funding of [false,true])for(const capacity of [false,true]){
 const opening=f.opening();opening.receipt.previousAdjustedClosesUnchanged=false;opening.priceBasisRevisions=[{symbol:'MRNA',savedClose:saved.close,rechecked:true,observedBar:{...saved,close,low:Math.min(saved.low,close)}}];
 const p=plan({adoption:f.account.adoption,sessions,historySessions:f.book.model.sessions,records:f.account.records,cashReconciliations:f.account.cashReconciliations,opening,observedAt:opening.receipt.observedAt,completionPolicy:c1CompletionPolicy(f.account.positionContext),purchaseFundingIndependent:funding,additionalSwingCapacity:capacity});
 const input={account:f.account,sessions,historySessions:f.book.model.sessions,opening,plan:{...p,sourceReceipt:opening.receipt},now:f.now};
 let a,b,ea,eb;try{a=old.reviewC1OpeningPriceRevisions(input);}catch(e){ea=e.message;}try{b=current.reviewC1OpeningPriceRevisions(input);}catch(e){eb=e.message;}
 if(ea){assert(eb);assert(eb.startsWith(ea+' (')||eb===ea);assert(eb.length<=200);assert(eb.includes('orders')||eb.includes('limits'));}else{assert.equal(eb,undefined);assert.deepEqual(clone(b),clone(a),'Complete successful plan/receipt parity');}
 assert.equal(JSON.stringify({account:f.account,book:f.book}),before);
}
assert.equal(f.writes,0);
console.log('PASS: exact comparison and successful-output parity across 16 policy/revision cases; rejected plan still rejected, bounded first-field explanation, immutable input and values/symbols absent from telemetry');
