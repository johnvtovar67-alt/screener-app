const fs=require('fs');
const path='lib/expertDecision.js';
let s=fs.readFileSync(path,'utf8');
if(s.includes('const materialEventReview=')){console.log('Material event override already applied.');process.exit(0);}

const eventMarker="  const eventBlocksNewCapital=Boolean(eventRisk?.blockNewCapital)||Boolean(eventRisk?.manualCheckRequired)||['blocked','manual'].includes(String(eventRisk?.status||'').toLowerCase());";
if(!s.includes(eventMarker))throw new Error('material event override: event marker missing');
const eventInsert=`${eventMarker}\n  const eventStatus=String(eventRisk?.status||'').toLowerCase(),eventSeverity=String(eventRisk?.severity||eventRisk?.riskLevel||'').toLowerCase(),eventAction=String(eventRisk?.action||eventRisk?.recommendedAction||'').toLowerCase();\n  const eventThesisBreak=Boolean(eventRisk?.thesisBreak||eventRisk?.thesisBroken||eventRisk?.invalidateThesis||eventRisk?.invalidatesThesis||eventRisk?.hardExit||eventRisk?.exitRequired)||['thesis-broken','thesis_break','invalidated','critical'].includes(eventStatus)||['critical','severe'].includes(eventSeverity)&&eventAction==='exit'||eventAction==='exit';\n  const materialEventReview=!eventThesisBreak&&(Boolean(eventRisk?.material)||Boolean(eventRisk?.requiresReview)||eventBlocksNewCapital||['review','elevated','blocked','manual'].includes(eventStatus)||['high','elevated','material'].includes(eventSeverity));`;
s=s.replace(eventMarker,eventInsert);

const mergerMarker="  const mergerRotationCandidate=role==='Swing'&&merger.active&&merger.priced&&merger.opportunityCost&&Boolean(rotateTarget)&&rotationTargetEligible;\n  let action='Hold',reason='The position still earns a place, but is not a priority for fresh money.';";
if(!s.includes(mergerMarker))throw new Error('material event override: merger marker missing');
s=s.replace(mergerMarker,`${mergerMarker}\n  const eventDetail=eventRisk?.detail||eventRisk?.reason||eventRisk?.label||'A material event requires immediate re-underwriting.';`);

const swingMarker="  }else{\n    if((eventBlocksNewCapital||quoteBlocksNewCapital||fundamentalsBlockNewCapital)&&(authoritativeAction==='Strong Buy'||authoritativeAction==='Buy'))";
if(!s.includes(swingMarker))throw new Error('material event override: swing branch marker missing');
const swingReplacement="  }else{\n    if(eventThesisBreak){action='Exit';reason=`Immediate event-driven exit: the new information explicitly invalidates the Swing thesis. ${eventDetail}`;}\n    else if(materialEventReview){action='Review';reason=`Immediate event review: a material development overrides the normal time-in-trade stage. Re-underwrite the thesis, risk, and expected return before continuing to hold or adding. ${eventDetail}`;}\n    else if((eventBlocksNewCapital||quoteBlocksNewCapital||fundamentalsBlockNewCapital)&&(authoritativeAction==='Strong Buy'||authoritativeAction==='Buy'))";
s=s.replace(swingMarker,swingReplacement);

const priorityOld="  const capitalPriority=action==='Add'?'New capital justified':action==='Exit'?'Redeploy':action==='Rotate'?(mergerRotationCandidate?`Rotate capped deal to ${rotateTarget}`:`Rotation candidate vs ${rotateTarget}`):action==='Trim'?(profitProtection?'Bank profits':'Exceptional risk reduction'):merger.active?'Merger spread hold':eventBlocksNewCapital?'Event hold':fundamentalsBlockNewCapital?'Fundamental data hold':quoteBlocksNewCapital?'Stale quote hold':'No new capital';";
if(!s.includes(priorityOld))throw new Error('material event override: priority marker missing');
const priorityNew="  const capitalPriority=action==='Add'?'New capital justified':action==='Exit'?'Redeploy':action==='Review'?'Immediate event review':action==='Rotate'?(mergerRotationCandidate?`Rotate capped deal to ${rotateTarget}`:`Rotation candidate vs ${rotateTarget}`):action==='Trim'?(profitProtection?'Bank profits':'Exceptional risk reduction'):merger.active?'Merger spread hold':eventBlocksNewCapital?'Event hold':fundamentalsBlockNewCapital?'Fundamental data hold':quoteBlocksNewCapital?'Stale quote hold':'No new capital';";
s=s.replace(priorityOld,priorityNew);

const returnOld="eventRisk:{blocked:eventBlocksNewCapital,status:eventRisk?.status||'',label:eventRisk?.label||''},mergerReview:";
if(!s.includes(returnOld))throw new Error('material event override: return marker missing');
s=s.replace(returnOld,"eventRisk:{blocked:eventBlocksNewCapital,status:eventRisk?.status||'',label:eventRisk?.label||'',materialReview:materialEventReview,thesisBreak:eventThesisBreak},mergerReview:");

fs.writeFileSync(path,s);
console.log('Applied immediate material-event review and thesis-break exit overrides.');
