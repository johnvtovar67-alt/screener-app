# C1 forward service equivalence — September 10, 2026

Result: PASS for the bounded synthetic service-wiring test. Trading release: NOT authorized.

The actual advanceC1ForwardModel service was advanced through 80 synthetic market sessions. At nine dates, each of its three books was compared to a direct frozen-simulator run over precisely the same input prefix (27 book checkpoints). The scenario includes changing rankings, a 4% opening gap, and a 16% down day. Book allocations differ even after normalizing their capital weights.

Assertions check every fill's symbol, side, session, price, and weighted quantity; exact pending queue content and ordering; independent cash balances; immutable prior records; idempotent same-session retries; and false live-capital and alpha-claim authority throughout. The simulator and frozen options are unchanged. The test is required by the production regression entry point, so both verify and prebuild execute it.

This establishes that the paper service preserves the frozen model's book-level results for these scenarios. It does not establish broker execution, complete input provenance, every market state, or equivalence of the legacy Opportunities/Portfolio recommendation path. It is not a backtest performance result, a sealed holdout, or prospective evidence.

Remaining: replace the legacy aggregate recommendation path with an audited common decision contract; establish a valid input vintage and observation baseline without rewriting the rejected record; reconcile actual fills separately; satisfy all unchanged promotion gates. Current holdings cannot be assigned historical book ownership from share counts alone. C1 remains suspended.
