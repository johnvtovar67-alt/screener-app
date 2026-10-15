const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['capital score helper','function capitalScoreVisual('],
  ['replacement edge helper','function replacementEdgeVisual('],
  ['momentum evidence badge','momentumBadge ${evidence.tone}'],
  ['evidence explanation','<p>{evidence.explanation}</p>'],
  ['accepted evidence date','<small>As of {evidence.sourceSessionDate}</small>'],
  ['none-qualified label','None qualified'],
  ['score excellent threshold','v>=80'],
  ['score strong threshold','v>=70'],
  ['score mixed threshold','v>=60'],
  ['replacement strong hurdle','v>=45'],
  ['replacement exceptional hurdle','v>=55']
];
const failed=checks.filter(([,needle])=>!s.includes(needle)).map(([name])=>name);
if(failed.length){console.error('TIME REVIEW SCORE VISUALS FAIL:',failed.join(', '));process.exit(1);}
console.log('TIME REVIEW SCORE VISUALS PASS: original capital-score thresholds, row momentum evidence and accepted source dates are preserved.');
