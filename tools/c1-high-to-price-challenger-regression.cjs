// Offline mechanics only. No provider, account, Blob or production route access.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const htp=loader.load('lib/c1HighToPriceChallenger.js');

const rows=Array.from({length:101},(_,index)=>({close:index===100?120:100+index/10,high:index===50?150:101+index/10}));
const observation=htp.c1HighToPriceObservation(rows);
assert.equal(observation.startPrice,100);assert.equal(observation.formationHigh,150);assert.equal(observation.endPrice,120);
assert(Math.abs(observation.prePeakReturnPct-50)<1e-9);assert(Math.abs(observation.postPeakReturnPct+20)<1e-9);
assert(Math.abs(observation.totalReturnPct-20)<1e-9);assert(Math.abs(observation.logIdentityError)<1e-12);

// Keep the superseded full-history transform here as a test-only reference.
// It proves that the bounded rolling implementation changes allocation, not
// semantics, across broad peer sets, missing bars, late entrants and churn.
function legacyReferenceTransform(source,{decisionOnly=false}={}){
 const dataset=JSON.parse(JSON.stringify(source)),history=new Map();
 dataset.metadata=dataset.metadata&&typeof dataset.metadata==='object'&&!Array.isArray(dataset.metadata)?dataset.metadata:{};
 dataset.metadata.c1HighToPriceChallenger={contract:htp.C1_HIGH_TO_PRICE_CONTRACT,
  formationStartSessions:htp.C1_HIGH_TO_PRICE_FORMATION_SESSIONS,
  skipRecentSessions:htp.C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS,
  substitutedFields:['researchFactors.return120Ex20','researchFactors.momentumPercentile'],perSignalDiagnostics:!decisionOnly};
 for(const session of dataset.sessions)for(const row of session.prices||[]){
  if(!history.has(row.symbol))history.set(row.symbol,new Map());
  if(history.get(row.symbol).has(session.date))throw new Error('Duplicate high-to-price observation for '+row.symbol+' on '+session.date);
  history.get(row.symbol).set(session.date,row);
 }
 const observed=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
 for(let sessionIndex=htp.C1_HIGH_TO_PRICE_FORMATION_SESSIONS;sessionIndex<dataset.sessions.length;sessionIndex++){
  const session=dataset.sessions[sessionIndex],rankedFields=['signals','positionSignals'];
  const outputFields=[...rankedFields,'accountHoldingSignals'],unavailable=new Set(),observations=[];
  const formationDates=dataset.sessions.slice(sessionIndex-htp.C1_HIGH_TO_PRICE_FORMATION_SESSIONS,
   sessionIndex-htp.C1_HIGH_TO_PRICE_SKIP_RECENT_SESSIONS+1).map(row=>row.date);
  const symbols=[...new Set(rankedFields.flatMap(field=>(session[field]||[]).map(signal=>signal.symbol).filter(Boolean)))];
  for(const symbol of symbols){
   const acceptedRows=rankedFields.flatMap(field=>(session[field]||[]).filter(signal=>signal.symbol===symbol));
   const states=new Set(acceptedRows.map(signal=>observed(signal?.researchFactors?.return120Ex20)));
   if(states.size!==1)throw new Error('Champion formation eligibility is inconsistent for '+symbol+' on '+session.date);
   if(!states.has(true)){unavailable.add(symbol);continue;}
   const formationRows=formationDates.map(date=>history.get(symbol)?.get(date));
   if(formationRows.some(row=>!row))throw new Error('Champion formation factor is observed but high-to-price history is incomplete for '+symbol+' on '+session.date);
   observations.push({symbol,...htp.c1HighToPriceObservation(formationRows)});
  }
  const ordered=observations.sort((left,right)=>left.prePeakReturnPct-right.prePeakReturnPct||left.symbol.localeCompare(right.symbol));
  const bySymbol=new Map(ordered.map((row,index)=>[row.symbol,{...row,percentile:ordered.length<2?50:index/(ordered.length-1)*100}]));
  for(const field of outputFields)for(const signal of session[field]||[]){
   if(unavailable.has(signal.symbol)){
    signal.researchFactors={...(signal.researchFactors||{}),return120Ex20:null,momentumPercentile:null,
     ...(!decisionOnly?{highToPricePrePeakReturnPct:null,highToPricePostPeakReturnPct:null,
      highToPriceFormationHigh:null,highToPriceContract:htp.C1_HIGH_TO_PRICE_CONTRACT}:{})};
    continue;
   }
   const row=bySymbol.get(signal.symbol);
   if(!row)throw new Error('High-to-price peer evidence is unavailable for '+signal.symbol+' on '+session.date);
   signal.researchFactors={...(signal.researchFactors||{}),return120Ex20:row.prePeakReturnPct,momentumPercentile:row.percentile,
    ...(!decisionOnly?{highToPricePrePeakReturnPct:row.prePeakReturnPct,highToPricePostPeakReturnPct:row.postPeakReturnPct,
     highToPriceFormationHigh:row.formationHigh,highToPriceContract:htp.C1_HIGH_TO_PRICE_CONTRACT}:{})};
  }
 }
 return dataset;
}

const marketSession=loader.load('lib/marketSession.js'),broadDates=[];
for(let date=new Date('2024-01-02T00:00:00Z');broadDates.length<320;date.setUTCDate(date.getUTCDate()+1)){
 const key=date.toISOString().slice(0,10);if(marketSession.isUsMarketSessionDay(key))broadDates.push(key);
}
const broadStable=Array.from({length:32},(_,index)=>'B'+String(index).padStart(2,'0'));
const broadPriceExists=(symbol,index)=>symbol==='LATE'?index>=170:symbol==='GAP'?index!==75:symbol==='CHURN'?index>=20&&index<=230:true;
const broadFactorObserved=(symbol,index)=>index>=htp.C1_HIGH_TO_PRICE_FORMATION_SESSIONS&&
 Array.from({length:htp.C1_HIGH_TO_PRICE_FORMATION_OBSERVATIONS},(_,offset)=>index-htp.C1_HIGH_TO_PRICE_FORMATION_SESSIONS+offset)
  .every(priceIndex=>broadPriceExists(symbol,priceIndex));
const broadSessions=broadDates.map((date,index)=>{
 const availableSymbols=[...broadStable,'GAP','LATE','CHURN'].filter(symbol=>broadPriceExists(symbol,index));
 const prices=availableSymbols.map((symbol,ordinal)=>{const close=40+ordinal*3+index*.07+(index%17)*.03;
  return {symbol,date,open:close*.999,high:close*(1.01+(ordinal%5)*.002),low:close*.99,close,volume:2000000+ordinal*10000,adjusted:true};});
 const row=symbol=>{const price=prices.find(candidate=>candidate.symbol===symbol)?.close??50,eligible=broadFactorObserved(symbol,index);
  return {symbol,sector:'Sector '+symbol.at(-1),price,action:'Strong Buy',entryTiming:{},
   researchFactors:{return120Ex20:eligible?10:null,momentumPercentile:eligible?60:null,volatility60Pct:20}};};
 const peers=index<120?[]:[...broadStable,'GAP',...(index>=225?['LATE']:[]),...(index>=140&&index<=220?['CHURN']:[])];
 const signals=peers.filter((_,ordinal)=>(ordinal+index)%3!==0).map(row);
 const positionSignals=peers.filter((_,ordinal)=>(ordinal+index)%3===0).map(row);
 const holdingSymbol=peers[0];
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals,positionSignals,
  accountHoldingSignals:holdingSymbol?[row(holdingSymbol)]:[],universeSymbols:availableSymbols,corporateActions:[]};
});
const broadDataset={metadata:{benchmarkSymbol:'SPY'},sessions:broadSessions},broadSnapshot=JSON.stringify(broadDataset);
const broadReference=legacyReferenceTransform(broadDataset),broadRolling=htp.buildC1HighToPriceDataset(broadDataset);
assert.equal(JSON.stringify(broadDataset),broadSnapshot,'The rolling immutable helper must not alter its broad accepted input');
const broadRollingJson=JSON.stringify(broadRolling),broadReferenceJson=JSON.stringify(broadReference);
if(broadRollingJson!==broadReferenceJson){
 const mismatch=[...broadRollingJson].findIndex((character,index)=>character!==broadReferenceJson[index]);
 throw new Error('Rolling/reference mismatch near '+mismatch+' rolling='+broadRollingJson.slice(Math.max(0,mismatch-120),mismatch+240)+
  ' reference='+broadReferenceJson.slice(Math.max(0,mismatch-120),mismatch+240));
}
assert.equal(broadRolling.sessions[150].signals.concat(broadRolling.sessions[150].positionSignals).find(row=>row.symbol==='GAP').researchFactors.return120Ex20,null,'A missing formation bar retains accepted unavailability');
assert(Number.isFinite(broadRolling.sessions[196].signals.concat(broadRolling.sessions[196].positionSignals).find(row=>row.symbol==='GAP').researchFactors.return120Ex20),'A symbol becomes eligible only after the missing bar exits the exact formation window');
const decisionOnlyInput=JSON.parse(JSON.stringify(broadDataset)),preservedFactors=decisionOnlyInput.sessions[120].signals[0].researchFactors;
const decisionOnly=htp.applyC1HighToPriceDecisionDatasetInPlace(decisionOnlyInput);
assert.strictEqual(decisionOnly.sessions[120].signals[0].researchFactors,preservedFactors,'The disposable transform assigns into existing factor objects instead of replacing them');
assert.equal(decisionOnly.metadata.c1HighToPriceChallenger.perSignalDiagnostics,false);
for(let index=120;index<decisionOnly.sessions.length;index++)for(const field of ['signals','positionSignals','accountHoldingSignals'])
 for(let rowIndex=0;rowIndex<(decisionOnly.sessions[index][field]||[]).length;rowIndex++){
  const actual=decisionOnly.sessions[index][field][rowIndex].researchFactors,expected=broadReference.sessions[index][field][rowIndex].researchFactors;
  assert.deepEqual([actual.return120Ex20,actual.momentumPercentile],[expected.return120Ex20,expected.momentumPercentile],
   'Decision-only rolling output must equal the two legacy fields consumed by the simulator');
  assert.equal(Object.hasOwn(actual,'highToPriceContract'),false,'The memory-bound path must not grow every signal with diagnostic properties');
 }

const dates=[];for(let date=new Date('2025-01-02T00:00:00Z');dates.length<260;date.setUTCDate(date.getUTCDate()+1)){
 const key=date.toISOString().slice(0,10);if(marketSession.isUsMarketSessionDay(key))dates.push(key);
}
const symbols=['AAA','BBB','CCC'];
const sessions=dates.map((date,index)=>{
 const prices=symbols.map(symbol=>{const formation=index===50?(symbol==='AAA'?150:symbol==='BBB'?125:110):100+Math.min(index,100)*.2,currentHigh=index===120?999:formation;return {symbol,date,open:formation,high:currentHigh,low:formation,close:index===100?120:formation,volume:1000000,adjusted:true};});
 const row=symbol=>({symbol,sector:symbol,price:prices.find(price=>price.symbol===symbol).close,action:'Strong Buy',entryTiming:{},researchFactors:{return120Ex20:20,momentumPercentile:symbol==='CCC'?7:50}});
 return {date,decisionAt:date+'T21:00:00.000Z',prices,signals:['AAA','BBB'].map(row),positionSignals:[row('CCC')],universeSymbols:symbols,corporateActions:[]};
});
const dataset={metadata:{benchmarkSymbol:'SPY'},sessions},transformed=htp.buildC1HighToPriceDataset(dataset),target=transformed.sessions[120];
const aaa=target.signals.find(row=>row.symbol==='AAA').researchFactors,bbb=target.signals.find(row=>row.symbol==='BBB').researchFactors;
const ccc=target.positionSignals.find(row=>row.symbol==='CCC').researchFactors;
assert(aaa.highToPricePrePeakReturnPct>bbb.highToPricePrePeakReturnPct);assert.equal(aaa.momentumPercentile,100);assert.equal(bbb.momentumPercentile,50);
assert.equal(ccc.momentumPercentile,0);assert.equal(ccc.highToPriceContract,htp.C1_HIGH_TO_PRICE_CONTRACT,'Holding-only signals must not retain the Champion rank');
assert.equal(aaa.highToPriceFormationHigh,150,'The current-session high cannot leak into the lagged formation window');
assert.equal(dataset.sessions[120].signals[0].researchFactors.highToPriceContract,undefined,'The accepted input dataset remains immutable');
const evaluationStartIndex=252,retainedStartIndex=evaluationStartIndex-htp.C1_HIGH_TO_PRICE_REQUIRED_PRE_EVALUATION_SESSIONS;
assert.equal(htp.C1_HIGH_TO_PRICE_SIMULATOR_WARMUP_SESSIONS,2);
assert.equal(htp.C1_HIGH_TO_PRICE_REQUIRED_PRE_EVALUATION_SESSIONS,122);
assert.equal(retainedStartIndex,130);
assert.equal(htp.c1HighToPriceRetainedStartIndex(dates,dates[evaluationStartIndex]),retainedStartIndex);
// MBC-shaped late entrant: the accepted compiler includes a security after 50
// observations but correctly leaves its 120-ex-20 factor absent until 121.
// The Challenger must preserve that eligibility state, exclude it from the
// dated peer denominator, and never manufacture a shorter history.
const lateEntrantDataset=JSON.parse(JSON.stringify(dataset));
for(let index=200;index<lateEntrantDataset.sessions.length;index++){
 const session=lateEntrantDataset.sessions[index],close=80+(index-200)*.1;
 session.prices.push({symbol:'LATE',date:session.date,open:close,high:close*1.01,low:close*.99,close,volume:5000000,adjusted:true});
}
const lateRow={symbol:'LATE',sector:'Industrials',price:85.2,avgVolume:5000000,action:'Strong Buy',entryTiming:{},researchFactors:{return120Ex20:null,momentumPercentile:null}};
lateEntrantDataset.sessions[evaluationStartIndex].signals.push(JSON.parse(JSON.stringify(lateRow)));
lateEntrantDataset.sessions[evaluationStartIndex].positionSignals.push(JSON.parse(JSON.stringify(lateRow)));
const lateTransformed=htp.buildC1HighToPriceDataset(lateEntrantDataset),lateSession=lateTransformed.sessions[evaluationStartIndex];
for(const field of ['signals','positionSignals']){
 const factors=lateSession[field].find(row=>row.symbol==='LATE').researchFactors;
 assert.equal(factors.return120Ex20,null);assert.equal(factors.momentumPercentile,null);
 assert.equal(factors.highToPricePrePeakReturnPct,null);assert.equal(factors.highToPriceFormationHigh,null);
 assert.equal(factors.highToPriceContract,htp.C1_HIGH_TO_PRICE_CONTRACT);
}
const baselineAtLateDate=htp.buildC1HighToPriceDataset(dataset).sessions[evaluationStartIndex];
for(const field of ['signals','positionSignals'])for(const signal of baselineAtLateDate[field])
 assert.equal(lateSession[field].find(row=>row.symbol===signal.symbol).researchFactors.momentumPercentile,signal.researchFactors.momentumPercentile,'An ineligible late entrant must not change observed peer ranks');
const contradictory=JSON.parse(JSON.stringify(lateEntrantDataset));
for(const field of ['signals','positionSignals'])contradictory.sessions[evaluationStartIndex][field].find(row=>row.symbol==='LATE').researchFactors.return120Ex20=12;
assert.throws(()=>htp.buildC1HighToPriceDataset(contradictory),/Champion formation factor is observed but high-to-price history is incomplete for LATE/,'Observed Champion formation evidence must still fail closed if its accepted price history is contradictory');
const comparisonArgs={startDate:dates[evaluationStartIndex],endDate:dates.at(-1)};
const ordinary=htp.runC1HighToPriceComparison({dataset:lateEntrantDataset,...comparisonArgs});
const progress=[];
const memoryBound=htp.runC1HighToPriceComparisonMemoryBound({dataset:JSON.parse(JSON.stringify(lateEntrantDataset)),...comparisonArgs,onProgress:event=>progress.push(event)});
assert.deepEqual(memoryBound,ordinary,'The memory-bounded preview must exactly match the immutable comparison');
const trimmedDataset={metadata:JSON.parse(JSON.stringify(lateEntrantDataset.metadata)),sessions:JSON.parse(JSON.stringify(lateEntrantDataset.sessions.slice(retainedStartIndex)))};
const trimmed=htp.runC1HighToPriceComparisonMemoryBound({dataset:trimmedDataset,...comparisonArgs});
assert.deepEqual(trimmed,memoryBound,'The exact 120-session formation plus two-session simulator warmup must reproduce the full-history comparison');
assert.deepEqual(progress.map(event=>`${event.phase}:${event.sleeve||''}`),[
 'champion-sleeve-start:base','champion-sleeve-end:base','champion-sleeve-start:cooldown15','champion-sleeve-end:cooldown15',
 'champion-sleeve-start:sector40','champion-sleeve-end:sector40','challenger-transform-start:','challenger-transform-end:',
 'challenger-sleeve-start:base','challenger-sleeve-end:base','challenger-sleeve-start:cooldown15','challenger-sleeve-end:cooldown15',
 'challenger-sleeve-start:sector40','challenger-sleeve-end:sector40',
],'Preview progress must expose only the fixed restore/arm/sleeve sequence');

const previewRunner='pages/api/research/c1-high-to-price-historical.js';
const appSources=['pages','components'].flatMap(dir=>fs.readdirSync(dir,{recursive:true}).filter(file=>/\.(js|jsx|ts|tsx)$/.test(file)).map(file=>dir+'/'+file));
for(const file of appSources)if(file!==previewRunner)assert(!fs.readFileSync(file,'utf8').includes('c1HighToPriceChallenger'),file+' must not import the offline challenger');
const runnerSource=fs.readFileSync(previewRunner,'utf8');
assert(runnerSource.includes("process.env.VERCEL_ENV==='production'"),'The one-time historical runner must refuse production');
assert(runnerSource.includes("phase:'restore-chunk-end'")&&runnerSource.includes("phase:'result-summary'")&&
 runnerSource.includes("phase:'response-ready'"),'The one-time runner must emit bounded phase timings and a recoverable aggregate result');
assert(runnerSource.includes('ACCEPTED_RETAINED_START_INDEX=130')&&runnerSource.includes("ACCEPTED_RETAINED_FIRST_SESSION='2022-07-12'"),'The accepted preview must retain the exact registered causal window');
assert(!runnerSource.includes('Promise.all(batch.map'),'The accepted preview must restore one chunk at a time');
assert(!runnerSource.includes('put(')&&!runnerSource.includes('FMP_API_KEY'),'The one-time historical runner must not write or acquire provider data');
const source=fs.readFileSync('lib/c1HighToPriceChallenger.js','utf8');
assert(!/fetch\s*\(|@vercel\/blob|process\.env|pages\/api/.test(source),'The challenger must not acquire data or depend on runtime infrastructure');
console.log('PASS: fixed 120-to-20 high-to-price decomposition, exact log identity, causal observed-only cross-sectional rank, Champion-parity late-entrant eligibility, immutable inputs, equivalent memory-bounded execution and one read-only preview runner that refuses production.');
