# C1 observed-session execution replay — September 11, 2026

Implementation evidence only. No new backtest, holdout, model selection, promotion or brokerage execution.

The same frozen simulator now supports an observed-session projection covering opening execution and stop events through supplied observed bars. It rejects invalid OHLC ranges, future or wrong-session bar timestamps, missing adjusted prices, incomplete queues and invalid prior model records. Closing signals are not supplied. The projection does not save a replacement model account.

The 80-session synthetic replay compares 79 opening plans and 79 observed-session plans with the completed-session engine. Full modeled fills, aggregate whole-share positions and execution cash reconcile on every transition. It explicitly exercises a single-position 20% downward opening gap: the stop receives the modeled adverse opening fill instead of the unreachable stop level. Existing tests also cover intraday declines, a 4% entry gap, independent book cooldowns, differing holdings and immutable retries. A malformed synthetic high below the opening price was corrected in the fixture generator; validation was not relaxed.

A reported-fill reconciler distinguishes partial fills, complete fills matching model economics, and execution variance. It deduplicates identical execution IDs, rejects conflicting IDs, overfills, oversells, borrowing and future/out-of-order execution records. Actual prices and fees affect reconstructed cash. No model balances are changed and remaining quantities are informational, not reissued orders. Every replayed full-session plan is also reconciled against synthetic reported fills.

Validation: full npm verify passed; the subsequently extended downward-gap scenario and service replay passed independently. No historical data or frozen simulator/options were changed.

Remaining boundaries: price and execution records are caller supplied, not broker/provider verified. Daily observed ranges do not establish precise intraday event order. Corporate-action/membership changes need verified inputs. This work is not yet connected to the production recommendation pages. Historical data validity and release evidence remain unresolved. C1 stays suspended.
