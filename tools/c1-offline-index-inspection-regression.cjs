const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {inspect}=require('./inspect-c1-index-transition.cjs');
const loader=createResearchModuleLoader(process.cwd()),{acceptC1DatedInput:accept}=loader.load('lib/c1DatedBook.js');
const clone=value=>JSON.parse(JSON.stringify(value)),symbols=['AAA','BBB','CCC','CVX','DOC','FDX','LLY','WFC','SPY','QQQ'];
function input(date,previous){
 const observedAt=date+'T22:00:00.000Z';
 return {contract:'c1-dated-index-input-v1',universe:'sp500',sourceSessionDate:date,observedAt,metadata:{},
  sourceReceipt:{provider:'FMP',membershipCheckedTwice:true},priorSessionPrices:{date:previous,closes:Object.fromEntries(symbols.map(s=>[s,100]))},
  session:{date,decisionAt:observedAt,universeSymbols:symbols.filter(s=>!['SPY','QQQ'].includes(s)),
   prices:symbols.map(symbol=>({symbol,date,open:100,close:100,high:101,low:99,volume:10000000,adjusted:true})),
   signals:symbols.slice(0,3).map((symbol,index)=>({symbol,sector:'Sector'+index,price:100,researchFactors:{momentumPercentile:100-index,volatility60Pct:20},
    entryTiming:{available:true,liquidityPass:true,averageDollarVolume20:500000000}}))}};
}
function observation(payload){return {contract:'c1-index-observation-v1',observationHash:crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
 observedAt:payload.observedAt,sourceSessionDate:payload.sourceSessionDate,acceptedModelInput:false,executable:false,payload};}
const first=input('2026-11-02','2026-10-30'),second=input('2026-11-03','2026-11-02');
const book=accept(accept(null,first,new Date(first.observedAt)),second,new Date(second.observedAt));
const current=input('2026-11-04','2026-11-03');current.priorSessionPrices.closes.CVX=99.9;
current.priceEvidence={contract:'c1-provider-price-fields-v1',endpoint:'historical-price-eod/dividend-adjusted',rows:[...book.model.sessions.at(-1).prices,...current.session.prices].map(p=>
 ({symbol:p.symbol,date:p.date,adjOpen:p.open,adjHigh:p.high,adjLow:p.low,adjClose:p.date==='2026-11-03'&&p.symbol==='CVX'?99.9:p.close,volume:p.volume}))};
const earlier=clone(current);earlier.observedAt=earlier.session.decisionAt='2026-11-04T21:00:00.000Z';
const observations=[observation(earlier),observation(current)];
fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/c1-offline-inspection-'));
const bookFile=path.join(dir,'accepted-market-book.json.gz'),files=observations.map((o,index)=>path.join(dir,'observation-'+index+'.json.gz'));
fs.writeFileSync(bookFile,zlib.gzipSync(JSON.stringify(book)));for(let index=0;index<files.length;index++)fs.writeFileSync(files[index],zlib.gzipSync(JSON.stringify(observations[index])));
const before=fs.readFileSync(bookFile),run=options=>inspect({bookFile,observationFiles:files,outputDir:path.join(dir,'report'),...options});
const report=run();assert.equal(report.status,'accepted');assert.equal(report.completeChangedPathCount,0);assert.equal(report.privateAccountsRead,false);assert.equal(report.networkRequests,0);
assert.equal(report.storageWrites,0);assert.equal(report.productionConclusion,'requires-actual-incident-artifacts');
assert.equal(report.comparedFields.length,5);assert.equal(report.simulatorStateChangedPathCount,0);
assert.deepEqual(fs.readFileSync(bookFile),before,'Local inspection must preserve source market book bytes');
const exact=JSON.parse(fs.readFileSync(path.join(dir,'report','complete-model-differences.json')));assert.deepEqual(exact,[]);
assert(fs.existsSync(path.join(dir,'report','simulator-state.json')),'Stop/high-water evidence is separately captured locally');
assert.throws(()=>run(),/EEXIST/,'Existing local evidence is never overwritten');
const partialDir=path.join(dir,'partial-output');fs.mkdirSync(partialDir);fs.writeFileSync(path.join(partialDir,'transition-report.json'),'existing evidence');
assert.throws(()=>run({outputDir:partialDir}),/EEXIST/,'Partial older evidence cannot mix with a new inspection');
assert.deepEqual(fs.readdirSync(partialDir),['transition-report.json']);assert.equal(fs.readFileSync(path.join(partialDir,'transition-report.json'),'utf8'),'existing evidence');

const changed=clone(current);changed.priorSessionPrices.closes.AAA=1;
const a=changed.priceEvidence.rows.find(row=>row.date==='2026-11-03'&&row.symbol==='AAA');a.adjOpen=1;a.adjHigh=1.01;a.adjLow=.99;a.adjClose=1;
const early=clone(changed);early.observedAt=early.session.decisionAt=earlier.observedAt;
const badFiles=[observation(early),observation(changed)].map((o,index)=>{const file=path.join(dir,'changed-'+index+'.json');fs.writeFileSync(file,JSON.stringify(o));return file;});
const rejected=run({observationFiles:badFiles,outputDir:path.join(dir,'rejected')});assert.equal(rejected.status,'rejected');
assert(rejected.completeChangedPathCount>0,'Actual replay exposes financially meaningful changes without accepting them');
assert.equal(rejected.rejection.providerRevision.stage,'model-parity');
const full=JSON.parse(fs.readFileSync(path.join(dir,'rejected','complete-model-differences.json')));
assert(full.length>0);assert.equal(full.length,rejected.completeChangedPathCount);
assert(full.some(row=>row.path.startsWith('/ledger/')),'Complete local evidence includes model accounting changes');
assert(JSON.parse(fs.readFileSync(path.join(dir,'rejected','complete-simulator-differences.json'))).length>0);

const tampered=clone(observations[0]);tampered.payload.priceEvidence.rows[0].adjClose++;
const tamperedFile=path.join(dir,'tampered.json');fs.writeFileSync(tamperedFile,JSON.stringify(tampered));
assert.throws(()=>run({observationFiles:[tamperedFile,files[1]],outputDir:path.join(dir,'tampered-output')}),/payload hash failed/);
assert(!fs.existsSync(path.join(dir,'tampered-output')),'Invalid evidence cannot produce an inspection artifact');
assert.throws(()=>run({observationFiles:[files[0],files[0]],outputDir:path.join(dir,'duplicate-output')}),/Duplicate local/);
assert.throws(()=>run({targetHash:'f'.repeat(64),outputDir:path.join(dir,'missing-output')}),/target observation/);
console.log('PASS: offline real accepted-book transition inspection, complete market-only field/stop differences, confirmed harmless and material revisions, immutable sources, hash/envelope validation and refusal to overwrite evidence; no production conclusion.');
