# C1 release path reassessment — September 11, 2026

## Correction

C1 historical tests and the current provisional production feed use different datasets. It was incorrect to use the current compiler's point-in-time and survivorship disclaimers as if they described the historical C1 sources. The historical manifests are in docs/research/c1-actions on research/c1-1000-seed-control.

Nasdaq declares historical membership, complete member-date observations, 44 resolved removal outcomes (one conservative zero recovery), and adjusted prices. All six chunks have content hashes. S&P declares historical membership and delisted outcomes, but lacks per-chunk hashes. Both declare revision-unsafe fundamentals; C1's frozen signal source is price-only, so relevance must be traced to actual eligibility/calculation dependencies rather than assumed. The companion cost receipt records dataset hashes and successful boundary/size verification. These facts narrow the audit; metadata declarations alone do not establish all data claims.

## Fixed release scope

Preserve C1's frozen options and existing historical results. Do not restart the hypothesis search, retune inspected periods, or introduce another prospective waiting period. Keep the production kill switch until a complete recommendation path has been verified.

Use the exact frozen simulator for all three independent books and the tested event mapper for combined whole-share execution. Do not restore the legacy aggregate top-three recommender. Existing research calculations and synthetic tests are inputs to one release acceptance report, not separate declarations of readiness.

Remaining work must address:

1. Bind a declared production universe and provider-verified, timestamped prices to this exact engine. The live provisional broad cohort cannot silently inherit either historical index-universe result. Membership and corporate-action changes must be explicit.
2. Connect both Opportunities and Portfolio to the same model decision/order output, then replay the complete page/API path. Research-only projections in PR 144 do not establish this wiring.
3. Reconcile actual account records and partial fills before producing user-specific orders. Do not infer historical sleeve ownership from current aggregate shares.
4. Close the precise historical evidence checks: original fold results, model-selection interpretation, and source integrity. Keep fixed-candidate placebo results separate from family-wise correction.

A release decision must report each item as passed, failed or not established, with its actual evidence. More component passes alone are not a trading release. C1 remains suspended as of this reassessment.
