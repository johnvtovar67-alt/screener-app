const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['capital score helper','function capitalScoreVisual('],
  ['replacement edge helper','function replacementEdgeVisual('],
  ['collapsed momentum evidence','<C1PositionDetails'],
  ['existing evidence source','evidence={momentumEvidenceFor(s)}'],
  ['none-qualified label','None qualified'],
  ['score excellent threshold','v>=80'],
  ['score strong threshold','v>=70'],
  ['score mixed threshold','v>=60'],
  ['replacement strong hurdle','v>=45'],
  ['replacement exceptional hurdle','v>=55']
];
const failed=checks.filter(([,needle])=>!s.includes(needle)).map(([name])=>name);
if(failed.length){console.error('TIME REVIEW SCORE VISUALS FAIL:',failed.join(', '));process.exit(1);}
const details=fs.readFileSync('components/C1PositionDetails.js','utf8');
for(const label of ['Recent momentum','Rank / protection state','Stop information','Data freshness'])if(!details.includes('<h4>'+label+'</h4>'))throw new Error('Structured technical group missing: '+label);
if(!details.includes("['Source session',decision?.sourceSessionDate"))throw new Error('Accepted source session is missing from freshness details');
console.log('TIME REVIEW SCORE VISUALS PASS: legacy capital-score and replacement-edge thresholds preserved; existing momentum evidence and accepted dates remain in collapsed structured details.');
