const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['stage tone helper','function stageTone(stage)'],
  ['setup blue','stageBadge.setup{background:#dbeafe'],
  ['proof green','stageBadge.proof{background:#dcfce7'],
  ['re-underwrite yellow','stageBadge.reunderwrite{background:#fef9c3'],
  ['opportunity orange','stageBadge.opportunity{background:#ffedd5'],
  ['long swing red','stageBadge.long{background:#fee2e2'],
  ['portfolio stage badge','stageTone(time.stage)'],
  ['special situation badge','specialSituationBadge']
];
const failed=checks.filter(([,needle])=>!s.includes(needle)).map(([name])=>name);
if(failed.length){console.error('STAGE BADGES FAIL:',failed.join(', '));process.exit(1);}
console.log('STAGE BADGES PASS: Setup/Proof/Re-underwrite/Opportunity Cost/Long Swing visual progression verified.');
