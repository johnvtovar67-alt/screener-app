# C1 causal opening replay

This is implementation evidence, not a backtest or live trading release.

The opening projection calls the exact frozen simulator for each independent book. It uses the recorded prior sessions and caller-supplied adjusted opening prices. A synthetic opening bar has open=high=low=close, and no new closing signals. Only execution phases 0–3 are projected; intraday stop events are excluded. The projection does not persist a new model or execution account.

The service equivalence regression now compares all 79 next-session opening projections against the opening fills of the completed-session simulator across 80 synthetic sessions. It also checks the existing independent book balances, queues, immutable history, event mapping and no trading authority. All tests passed on September 11, 2026.

Missing opening quotes for held or queued securities and benchmarks, unadjusted or duplicate prices, incomplete queues, invalid observation clocks, and invalid model history fail closed. Model phases use known opening inputs; no future high, low, close or new ranks are consumed to generate the opening plan.

Remaining limitations: caller prices have not been provider verified; new membership and corporate-action events require verification; intraday stop orders and brokerage partial fills are not implemented by this function. The production pages are not wired to execute this research projection. No readiness, alpha, brokerage reconciliation, or restored authority is claimed.
