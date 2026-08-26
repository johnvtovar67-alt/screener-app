const fs=require('fs');
const s=fs.readFileSync('lib/expertDecision.js','utf8');
const required=[
  'const structuralExitPressure=',
  'const capitulationRisk=',
  'const staleCapitalReview=',
  "else if(staleCapitalReview){action='Review'",
  'staleCapitalExit=forwardCapitalFailure&&!stabilizationPending&&structuralExitPressure',
  'staleCapitalReview,structuralExitPressure,capitulationRisk'
];
for(const marker of required)if(!s.includes(marker))throw new Error(`exit stability regression missing: ${marker}`);
if(s.includes('staleCapitalExit=forwardCapitalFailure&&!stabilizationPending&&(below50||day<0||pnlPct<=5)'))throw new Error('exit stability regression: legacy score-only exit is still active');
console.log('Swing exit stability regression passed.');
