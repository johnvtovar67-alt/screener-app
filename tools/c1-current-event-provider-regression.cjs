// Actual event provider pipeline with mutable clocks and offline FMP responses.
// No live network, storage, account, trade or historical-record access is used.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const observedShapes=require('./fixtures/c1-fmp-event-response-shapes-20261022.json');
const NativeDate=Date,originalFetch=global.fetch,originalKey=process.env.FMP_API_KEY;
const epoch=NativeDate.parse('2026-10-22T15:00:00.000Z'),fixtureKey='offline-current-event-provider-fixture',sentinel='PRIVATE_PROVIDER_ERROR_SENTINEL';
process.env.FMP_API_KEY=fixtureKey;
const plain=value=>JSON.parse(JSON.stringify(value));
const endpointKind=endpoint=>endpoint==='earnings-calendar'?'EARNINGS':endpoint==='mergers-acquisitions-latest'?'MERGERS':endpoint==='news/stock'?'NEWS':endpoint==='economic-calendar'?'MACRO':'UNKNOWN';
let cases=0;
function harness(initial={}){
 let milliseconds=epoch;const calls=[],feeds={...initial};
 class ClockDate extends NativeDate{constructor(...args){super(...(args.length?args:[milliseconds]));}static now(){return milliseconds;}}
 const fetcher=async raw=>{
  const url=new URL(raw),endpoint=url.pathname.split('/stable/')[1],kind=endpointKind(endpoint);
  assert.equal(url.hostname,'financialmodelingprep.com');assert.equal(url.searchParams.get('apikey'),fixtureKey);assert.notEqual(kind,'UNKNOWN');
  const query=Object.fromEntries([...url.searchParams].filter(([key])=>key!=='apikey'));calls.push({kind,endpoint,query});
  const configured=Object.hasOwn(feeds,kind)?feeds[kind]:[];
  if(configured instanceof Error)throw configured;
  const value=typeof configured==='function'?await configured({kind,endpoint,query,calls}):configured;
  if(value instanceof Error)throw value;
  if(value&&value.httpStatus)return new Response(JSON.stringify(value.body??{}),{status:value.httpStatus});
  return new Response(JSON.stringify(value));
 };
 global.Date=ClockDate;global.fetch=fetcher;
 let provider,read;
 try{const loader=createResearchModuleLoader(process.cwd());provider=loader.load('lib/eventRisk.js');read=loader.load('lib/c1CurrentEventEvidence.js').readC1CurrentEventEvidence;}
 finally{global.Date=NativeDate;global.fetch=originalFetch;}
 return {calls,set(kind,value){feeds[kind]=value;},advance(ms){milliseconds+=ms;},now:()=>new ClockDate(),read,
  async risk(symbol='CRWD'){const map=await provider.fetchEventRiskMap([symbol]);assert.equal(map.size,1);return map.get(symbol);},
  async map(symbols){return provider.fetchEventRiskMap(symbols);}};
}
function verification(risk,state,h){
 cases++;const evidence=risk.eventVerification;assert(evidence,'Actual provider result must include provenance');
 assert.equal(evidence.contract,'c1-current-event-evidence-v1');assert.equal(evidence.provider,'FMP');assert.equal(evidence.state,state);assert.equal(h.read(risk,h.now()),state);
 assert.equal(risk.eventRiskVerified,state!=='UNVERIFIED');assert.equal(risk.checkComplete,state!=='UNVERIFIED');
 assert.deepEqual(plain(evidence.sources.map(row=>row.kind).sort()),['EARNINGS','MERGERS','NEWS']);
 assert(evidence.reasons.every(code=>typeof code==='string'&&/^[A-Z0-9_]+$/.test(code)));
 for(const source of evidence.sources){assert(['earnings-calendar','mergers-acquisitions-latest','news/stock'].includes(source.endpoint));assert.equal(typeof source.complete,'boolean');assert.equal(typeof source.reason,'string');}
 if(state==='UNVERIFIED')assert.equal(risk.blockNewCapital,true,'Missing coverage must fail closed');
 else{
  assert(evidence.sources.every(source=>source.complete));assert(Number.isFinite(Date.parse(evidence.observedAt)));assert(Date.parse(evidence.expiresAt)>h.now().getTime());
  assert.equal(risk.blockNewCapital,state==='VERIFIED_BLOCKED');
 }
 assert.doesNotMatch(JSON.stringify(evidence),new RegExp(sentinel+'|'+fixtureKey),'Evidence must expose bounded reasons, never provider error bodies or credentials');
 return risk;
}
const earning=(date='2026-10-22',extra={})=>({symbol:'CRWD',date,...extra});
const news=(extra={})=>({symbol:'CRWD',publishedDate:'2026-10-22T13:00:00.000Z',title:'Synthetic routine company update',text:'Routine operating announcement.',url:'https://fixture.invalid/news/1',...extra});
const merger=(extra={})=>({symbol:'ACQ',companyName:'Synthetic acquirer',targetedSymbol:'CRWD',targetedCompanyName:'Synthetic target',transactionDate:'2026-10-21',...extra});
async function run(){
 const clear=harness(),first=verification(await clear.risk(),'VERIFIED_CLEAR',clear);assert.equal(first.status,'Clear');
 assert.equal(clear.calls.filter(row=>row.kind!=='MACRO').length,3,'Exactly the three existing required event feeds establish clear coverage');
 const requests=clear.calls.length,again=verification(await clear.risk(),'VERIFIED_CLEAR',clear);
 assert.equal(clear.calls.length,requests,'An immediate repeated review reuses current provider observations');
 assert.equal(again.eventVerification.observedAt,first.eventVerification.observedAt);
 assert.equal(clear.read(first,new NativeDate(first.eventVerification.expiresAt)),'UNVERIFIED','Evidence expires at the unchanged freshness boundary');
 for(const edit of [risk=>{risk.eventRiskVerified=false;},risk=>{risk.checkComplete=false;},risk=>{risk.newsCheckComplete=false;},risk=>{risk.blockNewCapital=true;},
  risk=>{risk.eventVerification.sources[0].complete=false;},risk=>{risk.eventVerification.sources[1]=plain(risk.eventVerification.sources[0]);},
  risk=>{risk.eventVerification.sources[0].expiresAt='2027-01-01T00:00:00.000Z';}]){
  const changed=plain(first);edit(changed);assert.equal(clear.read(changed,clear.now()),'UNVERIFIED','An inconsistent flag or receipt cannot borrow current verified authority');
 }

 const concurrent=harness();const concurrentResults=await Promise.all([concurrent.risk(),concurrent.risk(),concurrent.risk()]);
 for(const risk of concurrentResults)verification(risk,'VERIFIED_CLEAR',concurrent);
 assert.equal(concurrent.calls.filter(row=>row.kind!=='MACRO').length,3,'Concurrent reviews share endpoint requests');
 const generic=harness();verification(await generic.risk('AMD'),'VERIFIED_CLEAR',generic);
 const numericForeign=harness({EARNINGS:[earning('2026-10-24',{symbol:'0005.HK'})]});verification(await numericForeign.risk(),'VERIFIED_CLEAR',numericForeign);
 const known=harness();verification(await known.risk('IRDM'),'VERIFIED_BLOCKED',known);
 const perSymbol=harness({NEWS:[news({text:'Company cuts full-year guidance.'})]}),combined=await perSymbol.map(['CRWD','AMD']);
 verification(combined.get('CRWD'),'VERIFIED_BLOCKED',perSymbol);verification(combined.get('AMD'),'VERIFIED_CLEAR',perSymbol);
 const informational=harness({EARNINGS:[earning('2026-10-22',{symbol:'NVDA'}),earning('2026-10-23',{symbol:'AVGO'})],
  MACRO:[{country:'US',impact:'High',date:'2026-10-22T12:30:00.000Z',event:'Consumer Price Index'}]});
 const aware=verification(await informational.risk('AMD'),'VERIFIED_CLEAR',informational);
 assert.deepEqual(plain(aware.materialCatalysts.filter(row=>row.type==='Bellwether Earnings').map(row=>row.symbol).sort()),['AVGO','NVDA'],'Existing AI-exposure bellwether metadata remains available');
 assert(aware.materialCatalysts.some(row=>row.type==='Macro'&&row.label==='CPI inflation report today'),'Existing high-impact U.S. macro metadata remains available');
 assert.equal(aware.blockNewCapital,false,'Informational catalysts do not invent a new hard restriction');

 for(const [kind,value]of [['EARNINGS',[earning()]],['MERGERS',[merger()]],['NEWS',[news({title:'Synthetic guidance reduction',text:'Company cuts full-year guidance.'})]]]){
  const h=harness({[kind]:value});const risk=verification(await h.risk(),'VERIFIED_BLOCKED',h);assert.equal(risk.blockNewCapital,true);
 }
 const monotonic=harness({EARNINGS:[earning(),earning('2026-10-29')]});verification(await monotonic.risk(),'VERIFIED_BLOCKED',monotonic);
 const caution=harness({EARNINGS:[earning('2026-10-29')]});const reduced=verification(await caution.risk(),'VERIFIED_CLEAR',caution);assert.equal(reduced.reduceConviction,true,'Existing distant-earnings caution is retained without inventing a new hard block');
 const newsCaution=harness({NEWS:[news({text:'Synthetic company lawsuit and litigation notice.'})]});
 assert.equal(verification(await newsCaution.risk(),'VERIFIED_CLEAR',newsCaution).reduceConviction,true,'Existing caution-only news keeps its original conviction reduction');
 const benign=harness({NEWS:[news({title:'Split and unsolicited mini-tender reminder',text:'The July 2 four-for-one split is reflected in adjusted prices. An unsolicited third-party mini-tender offer is not a conventional company acquisition.'})]});
 verification(await benign.risk(),'VERIFIED_CLEAR',benign);

 const malformedCases=[
  ['EARNINGS',{error:sentinel}],['MERGERS',{message:sentinel}],['NEWS',{Error:sentinel}],
  ['EARNINGS',null],['MERGERS',null],['NEWS',null],['EARNINGS',[{}]],['MERGERS',[{}]],['NEWS',[{}]],
  ['EARNINGS',[earning('2026-02-30')]],['EARNINGS',[earning('2026-10-30')]],['EARNINGS',[earning('2026-10-19')]],
  ['EARNINGS',[earning('2026-10-22',{symbol:''})]],['MERGERS',[merger({transactionDate:'2026-02-30'})]],
  ['MERGERS',[merger({targetedSymbol:'',targetedCompanyName:''})]],['NEWS',[news({symbol:'MRNA'})]],['NEWS',[news({publishedDate:'2026-10-23T13:00:00Z'})]],
  ['NEWS',[news({publishedDate:'2026-10-19T13:00:00Z'})]],['NEWS',[news({publishedDate:'2026-02-30T13:00:00Z'})]],['NEWS',[news({title:'',text:''})]],
 ];
 for(const [kind,value]of malformedCases){const h=harness({[kind]:value});verification(await h.risk(),'UNVERIFIED',h);}
 for(const kind of ['EARNINGS','MERGERS','NEWS']){
  const h=harness({[kind]:new Error(sentinel)});verification(await h.risk(),'UNVERIFIED',h);
  const unavailable=harness({[kind]:{httpStatus:503,body:{private:sentinel}}});verification(await unavailable.risk(),'UNVERIFIED',unavailable);
 }
 const saturatedCalendar=harness({EARNINGS:Array.from({length:4000},(_,index)=>({symbol:'E'+index,date:'2026-10-24'}))});
 verification(await saturatedCalendar.risk(),'UNVERIFIED',saturatedCalendar);
 for(const failure of ['range','cap']){
  const daily=harness({EARNINGS:({query})=>query.from===query.to?[]:failure==='cap'?Array.from({length:4000},(_,index)=>({symbol:'E'+index,date:'2026-10-24'})):[earning('2026-10-30')]});
  verification(await daily.risk(),'VERIFIED_CLEAR',daily);
  const calendarCalls=daily.calls.filter(row=>row.kind==='EARNINGS');assert.equal(calendarCalls.length,11,'An incomplete range requires all ten exact-date observations');
  assert.equal(new Set(calendarCalls.filter(row=>row.query.from===row.query.to).map(row=>row.query.from)).size,10);
 }
 for(const failure of ['range','cap']){
  const partial=failure==='cap'?[earning(),...Array.from({length:3999},(_,index)=>({symbol:'E'+index,date:'2026-10-24'}))]:[earning(),earning('2026-10-30',{symbol:'0005.HK'})];
  const contradiction=harness({EARNINGS:({query})=>query.from===query.to?[]:partial});
  const risk=verification(await contradiction.risk(),'UNVERIFIED',contradiction);
  assert.equal(risk.eventVerification.sources.find(row=>row.kind==='EARNINGS').reason,'CONTRADICTORY_RESPONSE','A positive target observation cannot disappear behind otherwise-complete daily responses');
 }
 const confirmedPartial=harness({EARNINGS:({query})=>query.from!==query.to?[earning(),earning('2026-10-30',{symbol:'0005.HK'})]:query.from==='2026-10-22'?[earning()]:[]});
 verification(await confirmedPartial.risk(),'VERIFIED_BLOCKED',confirmedPartial);
 const missingDay=harness({EARNINGS:({query})=>query.from!==query.to?[earning('2026-10-30')]:query.from==='2026-10-25'?new Error(sentinel):[]});
 verification(await missingDay.risk(),'UNVERIFIED',missingDay);
 const invalidDay=harness({EARNINGS:({query})=>query.from!==query.to?[earning('2026-10-30')]:query.from==='2026-10-25'?[earning('2026-10-24')]:[]});
 verification(await invalidDay.risk(),'UNVERIFIED',invalidDay);
 const conflictingCalendar=harness({EARNINGS:[earning('2026-10-23',{fiscalYear:2026,fiscalPeriod:'Q3'}),earning('2026-10-24',{fiscalYear:2026,fiscalPeriod:'Q3'})]});
 verification(await conflictingCalendar.risk(),'UNVERIFIED',conflictingCalendar);
 const conflictingNews=harness({NEWS:[news({text:'Original routine update.'}),news({text:'Contradictory replacement text.'})]});
 verification(await conflictingNews.risk(),'UNVERIFIED',conflictingNews);
 const namedOnlyTarget=harness({MERGERS:[merger({targetedSymbol:null,targetedCompanyName:'CrowdStrike Holdings Inc.'})]});
 const namedOnlyRisk=verification(await namedOnlyTarget.risk(),'UNVERIFIED',namedOnlyTarget);
 assert(namedOnlyRisk.eventVerification.reasons.includes('MERGERS_TARGET_IDENTITY_UNAVAILABLE'),'A valid nullable target identity remains unresolved; it is not malformed or verified negative evidence');
 const observedMerger=harness({MERGERS:[observedShapes.mergerWithUnresolvedTarget]});
 const unresolved=verification(await observedMerger.risk(),'UNVERIFIED',observedMerger);
 assert(unresolved.eventVerification.reasons.includes('MERGERS_TARGET_IDENTITY_UNAVAILABLE'));
 assert(!unresolved.eventVerification.reasons.includes('MERGERS_MALFORMED_RESPONSE'),'The observed complete QCRH row has a valid nullable provider schema');
 const targetWithNullableNames=harness({MERGERS:[merger({targetedSymbol:'CRWD',targetedCompanyName:null,targetedCik:null})]});
 verification(await targetWithNullableNames.risk(),'VERIFIED_BLOCKED',targetWithNullableNames);
 for(const badTarget of [undefined,37,false,{},[], '', 'BAD SYMBOL']){
  const row=merger({targetedSymbol:badTarget});if(badTarget===undefined)delete row.targetedSymbol;
  const malformed=harness({MERGERS:[row]}),risk=verification(await malformed.risk(),'UNVERIFIED',malformed);
  assert(risk.eventVerification.reasons.includes('MERGERS_MALFORMED_RESPONSE'),'Missing or wrongly typed target identity remains genuinely malformed');
 }

 // Optional report-time enrichment changed four observed dates while leaving
 // the same 247-symbol/economic set intact. Only the four listed public rows
 // are observed; the remaining 243 entries below are synthetic fixture filler.
 const shape=observedShapes.earnings,changedSymbols=new Set(shape.changedRows.map(row=>row.symbol));
 assert.equal(shape.baseResponseCount,247);assert.equal(shape.enrichedResponseCount,247);assert.equal(shape.changedDateCount,4);
 const economicRow=row=>({symbol:row.symbol,epsActual:row.epsActual,epsEstimated:row.epsEstimated,revenueActual:row.revenueActual,revenueEstimated:row.revenueEstimated,lastUpdated:row.lastUpdated});
 const baseRows=shape.changedRows.map(row=>({...economicRow(row),date:row.baseDate}));
 const enrichedRows=shape.changedRows.map(row=>({...economicRow(row),date:row.enrichedDate,...row.optionalEnrichment}));
 for(let index=0;index<243;index++){
  const row={symbol:'SYNTHETIC'+index,date:shape.queriedDate,epsActual:1,epsEstimated:null,revenueActual:1000,revenueEstimated:null,lastUpdated:'2026-10-22'};
  baseRows.push({...row});enrichedRows.push({...row});
 }
 assert.equal(baseRows.length,247);assert.equal(enrichedRows.length,247);
 assert.deepEqual(baseRows.map(economicRow),enrichedRows.map(economicRow),'Optional enrichment does not change the observed economic set');
 assert.equal(baseRows.filter((row,index)=>row.date!==enrichedRows[index].date).length,4);
 assert.deepEqual(baseRows.filter((row,index)=>row.date!==enrichedRows[index].date).map(row=>row.symbol),[...changedSymbols]);
 for(const row of baseRows)for(const field of ['time','periodEnding','fiscalYear','fiscalPeriod','confirmed'])assert.equal(Object.hasOwn(row,field),false,'The base calendar shape contains no optional enrichment');
 for(const row of enrichedRows.filter(row=>changedSymbols.has(row.symbol))){assert.equal(row.fiscalYear,2026);assert.equal(row.epsEstimated,null);assert.equal(row.revenueEstimated,null);assert.equal(Object.hasOwn(row,'periodEnding'),true);assert.equal(Object.hasOwn(row,'periodEnd'),false);}
 const cappedRange=Array.from({length:4000},(_,index)=>({symbol:'SYNTHETICCAP'+index,date:'2026-10-22'}));
 const shapeFeed=forceEnriched=>({query})=>query.from!==query.to?cappedRange:query.from===shape.queriedDate?
  forceEnriched||query.includeReportTimes==='true'?enrichedRows:baseRows:[];
 const baseCalendar=harness({EARNINGS:shapeFeed(false)});
 verification(await baseCalendar.risk(),'VERIFIED_CLEAR',baseCalendar);
 const requiredQueries=baseCalendar.calls.filter(row=>row.kind==='EARNINGS');assert.equal(requiredQueries.length,11);
 for(const call of requiredQueries)assert.equal(Object.hasOwn(call.query,'includeReportTimes'),false,'Required earnings coverage must use the base dated provider response');
 assert.deepEqual(requiredQueries[0].query,{from:'2026-10-20',to:'2026-10-29'},'The existing calendar window is unchanged');
 assert.equal(new Set(requiredQueries.filter(call=>call.query.from===call.query.to).map(call=>call.query.from)).size,10);
 const enrichedCalendar=harness({EARNINGS:shapeFeed(true)}),ambiguous=verification(await enrichedCalendar.risk(),'UNVERIFIED',enrichedCalendar);
 assert(ambiguous.eventVerification.reasons.includes('EARNINGS_DAILY_OUT_OF_RANGE'),'The observed enriched-date response remains rejected when it contradicts an exact daily query');
 for(const [date,state,caution]of [['2026-10-20','VERIFIED_CLEAR',true],['2026-10-21','VERIFIED_BLOCKED',false],['2026-10-24','VERIFIED_BLOCKED',false],['2026-10-25','VERIFIED_CLEAR',true]]){
  const boundary=harness({EARNINGS:[earning(date)]}),risk=verification(await boundary.risk(),state,boundary);
  assert.equal(risk.reduceConviction,caution,'The existing -1/+2-day hard-block boundaries remain unchanged');
 }

 const pageRows={NEWS:Array.from({length:500},(_,index)=>news({title:'Synthetic routine update '+index,url:'https://fixture.invalid/news/'+index})),
  MERGERS:Array.from({length:1000},(_,index)=>merger({symbol:'A'+index,targetedSymbol:'T'+index,targetedCompanyName:'Synthetic target '+index}))};
 for(const kind of ['NEWS','MERGERS']){
  const terminal=harness({[kind]:({query})=>Number(query.page||0)===0?pageRows[kind]:[]});verification(await terminal.risk(),'VERIFIED_CLEAR',terminal);
  assert.deepEqual(terminal.calls.filter(row=>row.kind===kind).map(row=>row.query.page||'0'),['0','1'],'A full first page requires a terminal observation');
  const loop=harness({[kind]:pageRows[kind]});verification(await loop.risk(),'UNVERIFIED',loop);assert(loop.calls.filter(row=>row.kind===kind).length<=10,'Repeated pagination is bounded');
  const failedTail=harness({[kind]:({query})=>Number(query.page||0)===0?pageRows[kind]:new Error(sentinel)});verification(await failedTail.risk(),'UNVERIFIED',failedTail);
  const overlap=harness({[kind]:({query})=>Number(query.page||0)===0?pageRows[kind]:[pageRows[kind][0]]});verification(await overlap.risk(),'UNVERIFIED',overlap);
 }
 const noTerminal=harness({NEWS:({query})=>Array.from({length:500},(_,index)=>news({title:'Page '+query.page+' update '+index,url:'https://fixture.invalid/page/'+query.page+'/'+index}))});
 verification(await noTerminal.risk(),'UNVERIFIED',noTerminal);assert.equal(noTerminal.calls.filter(row=>row.kind==='NEWS').length,10,'A feed with no terminal page remains incomplete at the bounded page limit');

 // Required-feed cache freshness remains 5m / 15m / 1h. A prior verified
 // receipt is retained for audit, never promoted back to current authority.
 for(const [kind,advance]of [['NEWS',300001],['EARNINGS',900001],['MERGERS',3600001]]){
  const h=harness(),verified=verification(await h.risk(),'VERIFIED_CLEAR',h),before=plain(verified.eventVerification);
  h.advance(advance);h.set(kind,new Error(sentinel));assert.equal(h.read(verified,h.now()),'UNVERIFIED','An old boolean cannot outlive its provider evidence');
  const failed=verification(await h.risk(),'UNVERIFIED',h),source=failed.eventVerification.sources.find(row=>row.kind===kind);
  assert.equal(source.complete,false);assert.equal(source.fetchedAt,before.sources.find(row=>row.kind===kind).fetchedAt,'Stale fallback retains its real acquisition time');
  const last=failed.eventVerification.lastVerified;assert(last,'The previous verified snapshot must retain bounded provenance');
  assert.equal(last.state,'VERIFIED_CLEAR');assert.equal(last.observedAt,before.observedAt);assert.equal(last.expiresAt,before.expiresAt);assert.deepEqual(plain(last.sources),before.sources);
  const count=h.calls.length;verification(await h.risk(),'UNVERIFIED',h);assert.equal(h.calls.length,count,'Failure cooldown does not cause refresh loops');
 }
 const adverseIncomplete=harness({EARNINGS:[earning()],NEWS:new Error(sentinel)});verification(await adverseIncomplete.risk(),'UNVERIFIED',adverseIncomplete);
 const missingKey=harness();delete process.env.FMP_API_KEY;
 try{verification(await missingKey.risk(),'UNVERIFIED',missingKey);assert.equal(missingKey.calls.length,0);}finally{process.env.FMP_API_KEY=fixtureKey;}
 console.log('PASS: '+cases+' current event provider cases cover complete/adverse evidence, malformed/missing/contradictory feeds, bounded complete pagination, monotonic blockers, current cache/inflight reuse, expiration and retained verified provenance; no network or accounts.');
}
run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.Date=NativeDate;global.fetch=originalFetch;if(originalKey===undefined)delete process.env.FMP_API_KEY;else process.env.FMP_API_KEY=originalKey;});
