# C1 paper execution price audit — September 11, 2026

Finding: the frozen simulator uses opening prices for queued orders, while the forward service supplied closing marks to its whole-share paper mapping. That account was not an execution-equivalence receipt.

Correction: the forward service supplies opening quotes, and the adapter verifies each model fill against the supplied price plus the frozen side-specific cost. Intraday stops and other mismatched-price events are blocked for event-level reconciliation instead of being repriced at the open. Closing marks remain appropriate for portfolio valuation only.

The execution account now identifies its price basis. An older account without that identity is preserved and rejected for reconciliation. No historical cash record is silently repriced. The separate frozen model ledger and its historical results are unchanged. The existing invalid production baseline remains rejected.

Verification: an 80-session synthetic service run retains 27 frozen-book parity checkpoints and checks the opening-price cash mapping. The scenario also triggers an intraday event mismatch; the adapter rejects that event and preserves the execution account. Additional adapter tests reject closing-price substitution and old price-basis accounts. These are software checks, not new performance evidence.

Release limitation: the adapter is a retrospective, non-executable paper mapping. It does not yet support a complete event-level execution account and does not provide a next-session live order plan. Model equivalence of the recommendation pages, point-in-time input provenance, a valid forward baseline and all unchanged promotion gates remain outstanding. No C1 reactivation.
