const fs=require('fs');
const path='lib/expertDecision.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('const staleCapitalReview=')){console.log('Exit stabilization already applied.');process.exit(0);}

const oldExit="  const staleCapitalExit=forwardCapitalFailure&&!stabilizationPending&&(below50||day<0||pnlPct<=5);";
const newExit="  const structuralExitPressure=below200||(below50&&(technical<42||momentum<42||leadership<46));\n  const capitulationRisk=day<=-4&&thesis>=52&&risk<82&&!eventThesisBreak;\n  const staleCapitalExit=forwardCapitalFailure&&!stabilizationPending&&structuralExitPressure&&(activeDeterioration||day<=-.75)&&!capitulationRisk;\n  const staleCapitalReview=forwardCapitalFailure&&!stabilizationPending&&(capitulationRisk||(!structuralExitPressure&&(below50||day<0)));";
if(!s.includes(oldExit))throw new Error('exit stabilization: stale-capital marker missing');
s=s.replace(oldExit,newExit);

const oldBranch="    else if(staleCapitalExit){action='Exit';reason='This swing no longer earns trading capital on its own merits: forward setup, momentum, entry quality and relative strength are broadly weak. Exit to cash rather than waiting indefinitely for a replacement.';}";
const newBranch="    else if(staleCapitalReview){action='Review';reason=capitulationRisk?'Forward quality is weak, but today looks like a possible capitulation/flush while the thesis and risk profile are not independently broken. Do not sell reflexively into the downdraft; review for stabilization or follow-through before a full exit.':'Forward quality has weakened, but the price structure has not confirmed enough independent damage for a forced exit. Review and hold off on new capital until either stabilization or a true structural break is confirmed.';}\n    else if(staleCapitalExit){action='Exit';reason='This swing no longer earns trading capital on its own merits and the weakness is now structurally confirmed: forward setup, momentum, entry quality and relative strength are broadly weak with continued deterioration. Exit to cash rather than waiting indefinitely for a replacement.';}";
if(!s.includes(oldBranch))throw new Error('exit stabilization: action marker missing');
s=s.replace(oldBranch,newBranch);

const oldAudit='staleCapitalExit,forwardCapitalFailure,activeDeterioration,stabilizationPending,stabilizationSignals';
const newAudit='staleCapitalExit,staleCapitalReview,structuralExitPressure,capitulationRisk,forwardCapitalFailure,activeDeterioration,stabilizationPending,stabilizationSignals';
if(!s.includes(oldAudit))throw new Error('exit stabilization: audit marker missing');
s=s.replace(oldAudit,newAudit);

fs.writeFileSync(path,s);
console.log('Applied swing exit stabilization: structural confirmation plus capitulation review guard.');
