// Real recorder, fictional already-filled protective sale. No broker access,
// saved-account write, generated price or liquidation-policy change.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {createResearchModuleLoader}=require('./research-module-loader.cjs'),loader=createResearchModuleLoader(process.cwd()),
 {recordC1IntradayActivity:record}=loader.load('lib/c1IntradayActivity.js'),{buildC1SaleAttributionHold:hold}=loader.load('lib/c1SaleAttributionHold.js');
const file=path.resolve('tools/c1-sale-attribution-hold-regression.cjs'),source=fs.readFileSync(file,'utf8'),boundary=source.indexOf('\nfunction view(');assert(boundary>0);
const fixtureModule=new Module(file,module);fixtureModule.filename=file;fixtureModule.paths=Module._nodeModulePaths(path.dirname(file));
fixtureModule._compile(source.slice(0,boundary)+'\nmodule.exports={fixture,now,ids};',file);
const {fixture,now,ids}=fixtureModule.exports,account=fixture(),before=JSON.stringify(account),plan=account.intradayActivity.plan,
 ticket={id:'fictional-verified-protective-sale',symbol:'ZZZ',side:'sell',shares:3,price:20.5,fee:.03,executedAt:'2026-11-25T16:00:00.000Z',
  saleSelection:{kind:'stop',orderIds:ids.map(id=>'fictional:'+id+':stop:ZZZ')}};
assert(hold({account,now}),'The fixture demonstrates the existing planned-sale misattribution');
const after=record({account,plan,ticket,expectedRevision:account.revision,now}),newFills=after.intradayActivity.fills.filter(fill=>fill.id.startsWith(ticket.id+':'));
assert.equal(newFills.length,3);assert(newFills.some(fill=>fill.orderId==='fictional:sector40:stop:ZZZ'),'The same-allocation protective stop remains recordable');
assert(newFills.every(fill=>ticket.saleSelection.orderIds.includes(fill.orderId)));assert.equal(newFills.reduce((sum,fill)=>sum+fill.shares,0),3);
assert.equal(JSON.stringify(after.intradayActivity.plan),JSON.stringify(plan),'No saved plan order is removed or rewritten');
assert.equal(JSON.stringify(after.intradayActivity.fills.slice(0,account.intradayActivity.fills.length)),JSON.stringify(account.intradayActivity.fills));
assert.equal(JSON.stringify(account),before);assert.equal(record({account:after,plan,ticket,expectedRevision:after.revision,now}),after,'An identical completed-stop retry adds no execution');
assert(hold({account:after,now}),'The unrelated completed stop does not revive disputed planned sales');
const withoutHold=JSON.parse(before);withoutHold.intradayActivity.tickets[0].saleSelection={kind:'planned',orderIds:['fictional:sector40:planned:ZZZ']};
assert.equal(hold({account:withoutHold,now}),null);
assert.throws(()=>record({account:withoutHold,plan:withoutHold.intradayActivity.plan,ticket,expectedRevision:withoutHold.revision,now}),/selected sale orders changed/,
 'Without demonstrated quarantine, the original same-allocation unconditional suppression stays intact');
console.log('PASS: actual recorder accepts all verified protective-stop allocation IDs under the demonstrated hold, preserves raw plans/prior fills, remains idempotent and retains the original selector guard outside that hold.');
