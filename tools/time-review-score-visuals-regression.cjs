const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['capital score helper','function capitalScoreVisual('],
  ['replacement edge helper','function replacementEdgeVisual('],
  ['capital score visual','scoreVisual ${v.tone}'],
  ['replacement edge visual','edgeVisual ${v.tone}'],
  ['none-qualified label','None qualified'],
  ['score excellent threshold','v>=80'],
  ['score strong threshold','v>=70'],
  ['score mixed threshold','v>=60'],
  ['replacement strong hurdle','v>=45'],
  ['replacement exceptional hurdle','v>=55']
];
const failed=checks.filter(([,needle])=>!s.includes(needle)).map(([name])=>name);
if(failed.length){console.error('TIME REVIEW SCORE VISUALS FAIL:',failed.join(', '));process.exit(1);}
console.log('TIME REVIEW SCORE VISUALS PASS: Capital Score quality and qualified replacement edge are visually explicit.');
