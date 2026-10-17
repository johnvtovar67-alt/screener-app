// Read-only timing bindings; reverse only for pinned presentation comparisons.
module.exports=[
  [
    "c1DecisionTrigger,c1CompactMomentumEvidence}",
    "c1DecisionTrigger,c1CompactMomentumEvidence,c1HoldingTiming}"
  ],
  [
    "    const evidenceText=showMomentumEvidence&&<><p>{c1CompactMomentumEvidence(evidence)}</p>{evidence.sourceSessionDate&&<small>As of {evidence.sourceSessionDate}</small>}</>;",
    "    const evidenceText=showMomentumEvidence&&<>{c1HoldingTiming({position,presentation,current:accountDecision?.current===true,evidence}).map(line=><p key={line}>{line}</p>)}{evidence.sourceSessionDate&&<small>As of {evidence.sourceSessionDate}</small>}</>;"
  ]
];
