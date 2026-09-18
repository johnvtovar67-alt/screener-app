const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const review=createResearchModuleLoader(process.cwd()).load('lib/c1SessionRevisionReview.js').C1_SESSION_REVISION_REVIEW;
const account={adoption:{sourceSessionDate:'2026-09-15',seeds:{}},records:[],positionContext:{}};
const audit={contract:'c1-reviewed-session-revision-v1',...review,originalInputsPreserved:true,identicalModelEconomics:true,correctedPrices:[{symbol:'AAA',close:99.9}]};
const book={reconciliations:[audit],captures:[{sessionDate:'2026-09-17',observedAt:'2026-09-17T23:47:40Z'}],model:{sessions:[{date:'2026-09-16',prices:[{symbol:'AAA',close:100}]},{date:'2026-09-17',prices:[{symbol:'AAA',close:101}]}]}};
let changedState=false,changedPlan=false;
const box={C1_SESSION_REVISION_REVIEW:review,c1CompletionPolicy:()=>({}),
continueC1ActualAccount:({sessions})=>({books:{cash:100},replay:{},actualCash:100,sleeves:{base:{trades:[],pendingDecisions:[],accountRisk:{paused:changedState&&sessions[0].prices[0].close!==100},actualCash:100,openPositions:[{symbol:'AAA',shares:1,lastPrice:sessions[0].prices[0].close}]}}}),
planC1ContinuedAccountOpening:({sessions})=>({orders:[{shares:changedPlan&&sessions[0].prices[0].close!==100?2:1}]})};
vm.createContext(box);vm.runInContext(fs.readFileSync('lib/c1AccountInput.js','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'')+'\nglobalThis.check=assertC1AccountRevisionCoverage;',box);
const before=JSON.stringify({book,account});box.check(book,account,'2026-09-17');assert.equal(JSON.stringify({book,account}),before);
changedState=true;assert.throws(()=>box.check(book,account,'2026-09-17'),/reconciliation/);changedState=false;
changedPlan=true;assert.throws(()=>box.check(book,account,'2026-09-17'),/reconciliation/);changedPlan=false;
for(const key of ['priorRecordHash','evidenceHash','previousSessionDate']){const bad=JSON.parse(JSON.stringify(book));bad.reconciliations[0][key]='different';assert.throws(()=>box.check(bad,account,'2026-09-17'),/reconciliation/);}
console.log('PASS: reviewed correction preserves inputs and rejects changed private risk, orders and review identity');
