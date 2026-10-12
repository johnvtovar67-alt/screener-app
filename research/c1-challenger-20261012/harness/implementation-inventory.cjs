'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {makeResearchLoaderFactory,PROGRAM_ROOT}=require('./research-loader.cjs');
const matrix=JSON.parse(fs.readFileSync(path.join(PROGRAM_ROOT,'experiments.json')));
const rows=matrix.experiments.map(experiment=>{
  const factory=makeResearchLoaderFactory(experiment.id,{baselineId:'production-equivalent'});
  return {experimentId:experiment.id,family:experiment.family,
    implementation:'source_pinned_research_overlay',syntheticVerificationRequired:true,
    historicalRuns:0,performanceVerified:false,baselineId:factory.baseline.id,
    overlaySupported:factory.overlay.metadata.supported};
});
assert.equal(rows.filter(row=>row.experimentId!=='champion').length,48);
assert(rows.every(row=>row.overlaySupported));
assert.throws(()=>makeResearchLoaderFactory('adv__usdm200',{baselineId:'audit-historical'}));
assert.throws(()=>makeResearchLoaderFactory('champion'));
const report={contract:'c1-complete-frozen-overlay-inventory-v1',passed:true,rows,
  challengerCount:48,finalComparisonBaseline:'production-equivalent',
  historicalAuditBaseline:'audit-historical',historicalPerformanceRuns:0,
  remainingExternalGate:'Exact licensed private input access and matched full baseline replay',
  productionChanged:false};
fs.writeFileSync(path.join(__dirname,'implementation-inventory.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:true,implementedChallengers:48,historicalPerformanceRuns:0}));
