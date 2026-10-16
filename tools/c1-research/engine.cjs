// Isolated in-memory research transformations. Never imported by application code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('./module-loader.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('Research seam changed or ambiguous: '+from.slice(0,90));return source.replace(from,to);}
function verifySources(root){const manifest=require('./champion-source-manifest.json');for(const f of manifest.files){let bytes=fs.readFileSync(path.join(root,f.path));if(f.path==='vercel.json'){const v=JSON.parse(bytes);delete v.git.deploymentEnabled['research/c1-program-20261016'];bytes=Buffer.from(JSON.stringify(v,null,2)+'\n');}if(hash(bytes)!==f.sha256)throw Error('Champion source mismatch: '+f.path);}return manifest.production_commit;}
function createEngine(root,arm,cost=12){
 const changes=[];const change=(file,source,from,to)=>{changes.push({file,seam:from});return replaceOnce(source,from,to);};
 const sizing=typeof arm.sizing==='object'?arm.sizing:null,cap=arm.entry_selection_cap??3;
 const loader=createResearchModuleLoader(root,(file,source)=>{
  const c=(from,to)=>{source=change(file,source,from,to);};
  if(file==='lib/c1FrozenOptions.js'){
   const settings=Object.fromEntries(['base','cooldown15','sector40'].map((id,i)=>[id,{initialCapital:[25000,50000,25000][i],slippageBps:cost,minimumTrade:750*[25000,50000,25000][i]/100000,...(sizing?{maxPositions:arm.position_capacity,buyMaxPositionPct:sizing.high,strongBuyMaxPositionPct:sizing.high}: {})}]));
   c('// Owner-authorized live-account overlay.',`for(const [id,values] of Object.entries(${JSON.stringify(settings)}))Object.assign(C1_FROZEN_OPTIONS[id],values);\n// Owner-authorized live-account overlay.`);
  }
  if(file==='lib/c1AccountSeed.js')c('finite(seed.highWater,100000)','finite(seed.highWater,config.initialCapital)');
  if(file==='lib/c1RecentMomentumLivePolicy.js')c("C1_RECENT_MOMENTUM_LIVE_SOURCE_DATE='2026-10-14'","C1_RECENT_MOMENTUM_LIVE_SOURCE_DATE='1900-01-01'");
  if(file==='lib/c1StockClassification.js'&&cap===9){c('const V11_PRODUCTION_TARGET_COUNT=3,','const V11_PRODUCTION_TARGET_COUNT=9,');c('candidates.length < V11_PRODUCTION_TARGET_COUNT','candidates.length < 3');}
  if(file==='lib/c1RecentMomentumGate.js'){
   if(arm.id==='M-entry-off')c('entryAllowed: !weakLatest && (!negativeWindows || recovery)','entryAllowed: true');
   if(arm.id==='M-macd-off'){
    c('const weakLatest = ret1 < 0 && macdImproving === false;','const weakLatest = ret1 < 0;');
    c('const recovery = ret1 > 0 && macdImproving === true;','const recovery = ret1 > 0;');
    c('entryAllowed: !weakLatest && (!negativeWindows || recovery)','entryAllowed: !negativeWindows || ret1 > 0');
    c('const canStart = negativeWindows && ret1 < 0 && macdImproving === false;','const canStart = negativeWindows && ret1 < 0;');
    c('const canContinue = consecutive && previousStreak > 0 && negativeWindows && macdImproving === false;','const canContinue = consecutive && previousStreak > 0 && negativeWindows;');
   }
   if(arm.id==='M-deterioration-off'){
    c('const canStart = negativeWindows && ret1 < 0 && macdImproving === false;','const canStart = false;');
    c('const canContinue = consecutive && previousStreak > 0 && negativeWindows && macdImproving === false;','const canContinue = false;');
   }
   if(arm.id==='M-giveback-off')c('const profitGivebackQualified = meaningfulGiveback && weakLatest;','const profitGivebackQualified = false;');
  }
  if(file==='lib/c1RecentMomentumChallengerSimulator.js'){
   // Common study adapter: causal screen membership, without altering holding ranks.
   c('const candidates = rankedEligibleSignals\n        .filter(signal => {','const candidates = rankedEligibleSignals\n        .filter(signal => config.researchScreenAllowed(session,signal))\n        .filter(signal => {');
   if(sizing){
    c('      const rankedExitBuffer = Math.max(\n        rankedTargetCount,','      const rankedExitBuffer = Math.max(\n        1,');
    c('          targetPct: Array.isArray(config.rankedTargetWeights)','          researchTargetDollars: config.researchTargetPct(signal,session)*equityValue(cash,positions,prices),\n          researchLowerDollars: config.researchLowerPct*equityValue(cash,positions,prices),\n          targetPct: config.researchTargetPct(signal,session) ?? (Array.isArray(config.rankedTargetWeights)');
    c('            : null,\n          factor: factorOf(signal),','            : null),\n          factor: factorOf(signal),');
    c('Math.max(0,currentEquity * targetPct-existingValue)','Math.max(0,(order.researchTargetDollars ?? currentEquity * targetPct)-existingValue)');
    c('        if (!recordedBuy && (shares < 1 || cost < config.minimumTrade || cost > cash))',"        if(!completion && !recordedBuy && shares*fill+fill < order.researchLowerDollars){noteEntrySkip('research-minimum-allocation');continue;}\n        if (!recordedBuy && (shares < 1 || cost < config.minimumTrade || cost > cash))");
   }
  }
  return source;
 });
 const {buildC1StockScreenSnapshot, classifyC1StockScreen}=loader.load('lib/c1StockClassification.js');
 const {C1_FROZEN_OPTIONS}=loader.load('lib/c1FrozenOptions.js');
 const {simulatePointInTimePortfolio}=loader.load('lib/c1RecentMomentumChallengerSimulator.js');
 function run(dataset,startDate,endDate,cost){
  const snapshots=new Map(),allowed=new Map(),screenDecisions=[];
  for(let i=0;i<dataset.sessions.length;i++){
   const s=dataset.sessions[i];if(s.date<startDate||s.date>endDate)continue;
   let snap;try{snap=buildC1StockScreenSnapshot(s,new Date(s.decisionAt),dataset.sessions.slice(0,i+1));}catch(e){if(!/insufficient qualified/.test(e.message))throw e;snap={sourceSessionDate:s.date,candidates:[]};}
   snapshots.set(s.date,snap);
   // No invented quote/event facts: required screenRows arrive in audited inputs.
   const classifications=classifyC1StockScreen({snapshot:snap,rows:s.screenRows,current:true});screenDecisions.push(...classifications.map(row=>({date:s.date,...row})));allowed.set(s.date,new Set(classifications.filter(x=>['Buy','Strong Buy'].includes(x.rating)).map(x=>x.symbol)));
  }
  const runs={};
  for(const id of ['base','cooldown15','sector40']){
   const config={...C1_FROZEN_OPTIONS[id],startDate,endDate,liquidateAtEnd:false,slippageBps:cost,warmupSessions:253,
    researchScreenAllowed:(session,signal)=>allowed.get(session.date)?.has(signal.symbol)===true};
   if(sizing){config.researchLowerPct=sizing.low;config.researchTargetPct=(signal,session)=>{const r=snapshots.get(session.date)?.candidates.find(x=>x.symbol===signal.symbol)?.researchRank;if(!r||r>9)throw Error('Source rank unavailable');return sizing.low+(sizing.high-sizing.low)*(9-r)/8;};}
   const seed={contract:'c1-prospective-account-seed-v1',sleeve:id,asOfSession:startDate,prospectiveAdoptionConfirmed:true,cash:config.initialCapital,highWater:config.initialCapital,remainingCooldownSessions:0,resumeAtNextOpen:false,positions:[]};
   runs[id]=simulatePointInTimePortfolio(dataset,config,seed);
  }
  const dates=runs.base.curve.map(x=>x.date);
  for(const run of Object.values(runs))if(JSON.stringify(run.curve.map(x=>x.date))!==JSON.stringify(dates))throw Error('Sleeve dates differ');
  const curve=dates.map((date,i)=>({date,equity:Object.values(runs).reduce((a,r)=>a+r.curve[i].equity,0),cash:Object.values(runs).reduce((a,r)=>a+r.curve[i].cash,0)}));
  return {arm:arm.id,cost,curve,screenDecisions,sleeves:runs,trades:Object.entries(runs).flatMap(([sleeve,r])=>r.trades.map(t=>({...t,sleeve}))),limitations:['Current production model source applied retrospectively with a common historical screen adapter. Not exact historical live-account/quote-authority replay.','No inter-sleeve transfers. No production/account reads or writes.'],seams:changes};
 }
 return {run,loader,changes};
}
module.exports={createEngine,verifySources,replaceOnce};
