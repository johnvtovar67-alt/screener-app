# C1 production equivalence audit — September 10, 2026

Disposition: incomplete; full trading authority remains suspended.

The two completed fixed-candidate controls are historical diagnostics, not a
certificate that the production recommendation engine matches the simulator.

## Findings and corrections

| Rule | Previous live value | Frozen value | Correction |
|---|---:|---:|---|
| Rank retention buffer | 9 | 6 | Read from frozen options |
| Maximum sector names | 1 | 2 per sleeve | Read from frozen options |
| Maximum position weight | 34% | 33.333333% per sleeve | Read from frozen options |

These corrections do not establish aggregate three-sleeve equivalence. The
legacy recommendation path remains an aggregate policy with operational quote
and event checks. The frozen paper model has three independent cash books.
Do not reactivate the legacy path on the strength of these parameter fixes.

Existing historical fixture tests verify 976 fills and 5,508 ledger checkpoints,
frozen simulator identity, next-open execution, paper order mapping, and
shared-symbol rounding. Those checks establish the tested paper components;
they do not establish a production brokerage execution certificate.

## Forward input revision

A read-only comparison of the private production paper record against the
latest compiled chunk found substantive changes to September 9 inputs:

- Prices: 226 rows in both versions, no symbol additions/removals; 217 changed
  rows (216 volumes, 3 highs, 2 lows, 2 opens, 1 close).
- Fresh-capital signals: 192 rows in both; 189 changed rows, including research
  factors, timing, and recommendations.
- Position-only signals: 32 rows in both; 26 changed rows.

Source: GitHub Actions run 34535407835, read-only diagnostic, September 10.
These are rebuilt-data revisions, not merely JSON ordering differences. The
upstream reason for the revisions is not established by this comparison.

The original record is preserved. The forward model continues to reject the
revised overlap and now exposes the affected date and top-level fields in a
structured inputRevision receipt. No sessions are appended, replaced, or
relabeled valid by this change. A usable forward feed must supply the original
recorded vintages, with any corporate-action or provider corrections explicitly
reconciled before they can affect validation.

## Remaining release conditions

Resolve source-vintage consistency without rewriting known history; verify
end-to-end production decisions against the independent sleeves on identical
inputs; reconcile actual brokerage execution separately; retain all unchanged
promotion gates. Fixed-candidate controls do not correct the prior model search
or provide new sealed data. No live activation is authorized by this audit.
