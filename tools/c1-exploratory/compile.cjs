const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createResearchModuleLoader}=require('../c1-research/module-loader.cjs');
const root=path.resolve(__dirname,'../..');
function compile(raw){
 const loader=createResearchModuleLoader(root),{compilePointInTimeSignals}=loader.load('lib/historicalSignalEvaluator.js');
 const compiled=compilePointInTimeSignals(raw,{minimumHistoryRows:253,resume:{sessions:[],completedSessions:raw.sessions.findIndex(s=>s.date==='2024-12-31'),decisionMemory:[]}});
 const {compactReplaySession}=loader.load('lib/replayDatasetCompaction.js');compiled.sessions=compiled.sessions.map(compactReplaySession);
 // Explicit simulation assumptions, NEVER certified live/PIT evidence.
 for(const session of compiled.sessions){
  for(const row of [...session.signals,...session.positionSignals]){
   row.eventRisk={status:'Exploratory unknown-event omission',blockNewCapital:false,checkComplete:false};row.preTradeCheck=row.eventRisk;
   row.expertDecision={...(row.expertDecision||{}),metrics:{...(row.expertDecision?.metrics||{}),quoteFreshnessPass:true}};
   if(row.recommendation?.expertDecision)row.recommendation.expertDecision={...row.recommendation.expertDecision,metrics:{...row.recommendation.expertDecision.metrics,quoteFreshnessPass:true}};
  }
  session.screenRows=session.positionSignals;
 }
 return{metadata:{...compiled.metadata,track:'exploratory-retrospective-v1',pointInTime:false,eventCoverageVerified:false,quoteAuthorityVerified:false},sessions:compiled.sessions,historyWarmup:raw.sessions.filter(s=>s.date<'2024-12-31')};
}
if(require.main===module){const dir=process.argv[2],ds=compile(JSON.parse(fs.readFileSync(path.join(dir,'raw.json'))));fs.writeFileSync(path.join(dir,'compiled.json'),JSON.stringify(ds));console.log(JSON.stringify({sessions:ds.sessions.length,signals:ds.sessions[0].signals.length,positionSignals:ds.sessions[0].positionSignals.length,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compiled.json'))).digest('hex')}));}
module.exports={compile};
