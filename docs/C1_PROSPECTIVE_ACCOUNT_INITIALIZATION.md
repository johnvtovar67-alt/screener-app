# C1 prospective account initialization

## Implemented

The historical simulator remains byte-for-byte unchanged. A generated runtime adds explicit account initialization and origin metadata. Its generator is pinned to the historical source hash and asserts each declared replacement occurs exactly once. A required check verifies the generated file has no additional changes. With no account supplied, all three sleeves return exactly the same results as the unchanged reference on the regression dataset.

An account can initialize from current Swing positions and explicit cash at a completed close. Initialization creates opening balances, not fabricated historical buys or same-day sales. Original position dates and cost bases determine holding periods and initial stops. Core MSTR is excluded. Current issuer and sector identities use the frozen engine's existing functions.

The prospective policy assigns whole shares of each current Swing holding by largest remainder at 25%/50%/25%, then balances sleeve capital to those weights with cash. It rejects allocations that would require borrowing rather than inventing migration trades. Each sleeve runs in the original $100,000 units, with a recorded conversion back to actual account units. This preserves the original minimum trade, integer model sizing, and portfolio parameters instead of silently retuning them to a smaller account. Summing the three sleeves recovers the entered share quantities and cash exactly within numeric tolerance.

Initialization requires a capital record reconciled to the entered balances. The existing observed capital peak is retained as an initial loss limit; the initializer cannot erase it. A recorded breaker date determines the remaining 10/15/10-session cooldowns. A sleeve whose recorded cooldown has completed resumes through the engine's existing next-opening reset rule. This is an explicit prospective allocation policy, not a claim that the current holdings historically occupied these sleeves.

## Actual-account continuation and shared views

The account runtime now accepts an explicit actual-fill ledger for every completed session. Missing sessions fail; zero-fill sessions retain actual ownership. Partial quantities, actual execution prices and fees feed the next strategy session without resetting the original unit conversion, holding dates, stops, portfolio peak or cooldowns. Triggered unfilled risk exits persist. Conditional standing stops are reconciled only when actually filled.

The coordinator regenerates plan identities from dated inputs and reconciles its final shares and cash against the independent fill ledger in each sleeve. The account service binds accepted input hashes and rejects stale revisions. The private account API uses the existing portfolio sync credential, isolated preview storage and conditional writes; existing accounts cannot be reset by another adoption request. It only reads the dated index book and never initializes the provider.

Opportunities and Portfolio use one account decision. Portfolio Hold/exit-candidate explanations bypass the legacy re-underwriting text. Edited quantities, basis, dates or cash invalidate the displayed account result. The activity form records actual partial fills and complete no-fill sessions. All these outputs remain explicitly account analysis and proposals, not granted live trading authority.

## Remaining release work

- The browser URL security policy blocked the separate dated-provider initialization acceptance. That blocked action has not been retried through another channel.
- Verify live provider observations and the opening-price path end to end before treating proposed opening orders as current trade instructions. The current account API displays completed-session analysis; the tested opening planner is not a verified intraday feed.
- Complete hosted build and browser acceptance of the combined release. These changes are a draft, not a production trading release.

Account-specific screenshots, holdings and transactions are not embedded in this public repository. They are separate private input records.
