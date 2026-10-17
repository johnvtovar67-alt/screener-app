const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['capital score helper','function capitalScoreVisual('],
  ['replacement edge helper','function replacementEdgeVisual('],
  ['shared plain reason','c1PlainDecisionReason({action:displayAction'],
  ['internal evidence retained','evidence=showMomentumEvidence?momentumEvidenceFor(s):null'],
  ['original evidence badge','momentumBadge ${evidence.tone}'],
  ['existing saved timing copy','c1HoldingTiming({position,presentation,current:accountDecision?.current===true,evidence})'],
  ['accepted evidence date','<small>As of {evidence.sourceSessionDate}</small>'],
  ['original plan trigger','c1DecisionTrigger({action:a'],
  ['none-qualified label','None qualified'],
  ['score excellent threshold','v>=80'],
  ['score strong threshold','v>=70'],
  ['score mixed threshold','v>=60'],
  ['replacement strong hurdle','v>=45'],
  ['replacement exceptional hurdle','v>=55']
];
const failed=checks.filter(([,needle])=>!s.includes(needle)).map(([name])=>name);
if(failed.length){console.error('TIME REVIEW SCORE VISUALS FAIL:',failed.join(', '));process.exit(1);}
if(s.includes('<p>{evidence.explanation}</p>'))throw new Error('The full technical narrative must not replace concise evidence');
if(!s.includes('<th>Why / Evidence</th>'))throw new Error('The combined Why / Evidence column must remain present');
console.log('TIME REVIEW SCORE VISUALS PASS: capital-score thresholds and internal momentum evidence are preserved with original evidence and plan-trigger slots.');
