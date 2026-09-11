# C1 prospective account initialization

## Implemented

The historical simulator remains byte-for-byte unchanged. A generated runtime adds explicit account initialization and origin metadata. Its generator is pinned to the historical source hash and asserts each declared replacement occurs exactly once. A required check verifies the generated file has no additional changes. With no account supplied, all three sleeves return exactly the same results as the unchanged reference on the regression dataset.

An account can initialize from current Swing positions and explicit cash at a completed close. Initialization creates opening balances, not fabricated historical buys or same-day sales. Original position dates and cost bases determine holding periods and initial stops. Core MSTR is excluded. Current issuer and sector identities use the frozen engine's existing functions.

The prospective policy assigns whole shares of each current Swing holding by largest remainder at 25%/50%/25%, then balances sleeve capital to those weights with cash. It rejects allocations that would require borrowing rather than inventing migration trades. Each sleeve runs in the original $100,000 units, with a recorded conversion back to actual account units. This preserves the original minimum trade, integer model sizing, and portfolio parameters instead of silently retuning them to a smaller account. Summing the three sleeves recovers the entered share quantities and cash exactly within numeric tolerance.

Initialization requires a capital record reconciled to the entered balances. The existing observed capital peak is retained as an initial loss limit; the initializer cannot erase it. A recorded breaker date determines the remaining 10/15/10-session cooldowns. A sleeve whose recorded cooldown has completed resumes through the engine's existing next-opening reset rule. This is an explicit prospective allocation policy, not a claim that the current holdings historically occupied these sleeves.

## Still required for live use

- Bind the initializer to the server's dated index input and the actual account's accepted record.
- Advance subsequent strategy sessions from accepted actual fills, retaining all strategy state. The first-opening adapter now produces funded whole-share proposals and reconciles partial fills and fees per sleeve, but does not yet authorize subsequent model advancement.
- Bind the first-opening adapter, which excludes MSTR and SCHW purchases, to verified server observations.
- Integrate the resulting single account decision into Opportunities and Portfolio.
- Complete provider and release acceptance. This runtime is not wired to live trading authority.

Account-specific screenshots, holdings and transactions are not embedded in this public repository. They are separate private input records.
