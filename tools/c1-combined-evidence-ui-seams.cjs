// Exact presentation-only column/copy grouping changes.
module.exports=[
  [
    "    const evidenceText=showMomentumEvidence&&<>{c1HoldingTiming({position,presentation,current:accountDecision?.current===true,evidence}).map(line=><p key={line}>{line}</p>)}{evidence.sourceSessionDate&&<small>As of {evidence.sourceSessionDate}</small>}</>;",
    "    const evidenceText=showMomentumEvidence?<><p>{d.reason}</p><p>{c1HoldingTiming({position,presentation,current:accountDecision?.current===true,evidence}).join(\" \u00b7 \")}</p>{evidence.sourceSessionDate&&<small>As of {evidence.sourceSessionDate}</small>}</>:d.reason;"
  ],
  [
    "{showMomentumEvidence&&<div className=\"mobileField momentumEvidenceText\"><small>Evidence</small>{evidenceText}</div>}<div className=\"mobileField\"><small>Why</small><p>{d.reason}</p></div>",
    "<div className={showMomentumEvidence?\"mobileField momentumEvidenceText\":\"mobileField\"}><small>Why / Evidence</small>{showMomentumEvidence?evidenceText:<p>{d.reason}</p>}</div>"
  ],
  [
    "<td className={showMomentumEvidence?\"momentumEvidenceText\":undefined}>{evidenceText}</td><td>{d.reason}</td>",
    "<td className={showMomentumEvidence?\"momentumEvidenceText\":undefined}>{evidenceText}</td>"
  ],
  [
    "<th>Evidence</th><th>Why</th>",
    "<th>Why / Evidence</th>"
  ]
];
