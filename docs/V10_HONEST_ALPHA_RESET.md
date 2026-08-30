# Version 10 honest-alpha reset

V7 through V9 did not establish a usable benchmark-beating screener. V7 lost
money and stopped out 58 of 59 closed trades. V8 improved risk-adjusted results
but returned only 5.51% while SPY returned 29.05% and QQQ returned 38.12%. V9
then placed idle cash into SPY. That completion sleeve is rejected because it
would make the portfolio look competitive without improving stock selection.

V10 starts from a clean research question: can one predeclared, fully disclosed
stock-ranking policy beat both passive indices after realistic execution costs,
with cash kept as cash?

## Frozen thesis

Every session begins with the full liquid, evidence-complete research universe.
No production Buy label or narrow factor threshold determines membership. The
portfolio ranks qualifying stocks with one fixed score:

| Evidence | Weight |
|---|---:|
| Medium-term momentum rank | 30% |
| Fundamental quality rank | 25% |
| Relative strength versus SPY/QQQ | 15% |
| Sector-relative quality | 10% |
| Stability rank | 10% |
| Short-term technical condition | 5% |
| Controlled-entry timing | 5% |

The book targets 12 approximately equal-weight stocks, refreshes ranks every
five sessions and replaces a holding after at least ten sessions when it falls
outside the top 12. Issuer and sector caps remain. The old stop ratchet,
break-even ratchet, narrow entry bands and regime gate are removed. An 18%
catastrophic stop remains as disaster protection; normal exits come from rank
deterioration or the 126-session maximum lifecycle. Orders execute at the next
session's open with 12 bps slippage and whole shares.

These values are a single frozen hypothesis, not a parameter grid. V10 has no
candidate selector and no optimization score.

The provisional runner checkpoints after each complete three-window fold
(train, validation and audit) instead of waiting for three separate scheduled
invocations. This changes only orchestration speed; it does not combine folds,
reuse prior-version returns or alter any signal, fill, cost or evidence rule.

## Controls and passing standard

SPY and QQQ are fully invested passive benchmarks. Their simple returns are the
primary comparisons. Exposure-matched figures may explain cash drag but cannot
pass the alpha gate.

The same audit folds also run:

- a simple momentum-only rank;
- a simple quality-only rank;
- a transparent, non-repainting technical bull-cycle/pullback rank; and
- deterministic random-symbol ranks with the same universe, position count,
  sizing, rebalance clock, exits and costs.

The technical bull-cycle control was added after reviewing Peter DiCarlo's THT
Bull Cycle framework. It is not a reproduction of THT. The public THT rules
combine a favorable trend, higher-timeframe buying pressure, a pullback toward
fair value and a predeclared invalidation. The published Monthly BX overlay
explicitly says that it repaints, and both THT TradingView scripts are
closed-source. V10 therefore uses only a transparent point-in-time analogue:
price above the 50-session average, the 50-session average above the 200-session
average, a bullish SPY regime, a passing non-chase timing check, and a rank made
from medium-term momentum, short-term technical condition and controlled
pullback. This control can falsify the value of V10's fundamental layer; it can
never be selected after the audit merely because it performed better.

The provisional current-cohort diagnostic uses 25 random seeds to catch obvious
failure quickly. The strict point-in-time audit requires at least 1,000 seeds
and the active thesis must exceed their 95th-percentile return.

Every evidence gate must pass: simple total-return alpha versus both SPY and
QQQ; alpha against each in most folds; positive expectancy; profit factor above
one; at least 30 closed round trips; at least 80% average active-stock exposure;
better return than both simple-factor controls; zero benchmark-sleeve exposure;
better return than the transparent bull-cycle/pullback control; and better
return than the random 95th percentile.

## What the next audit can and cannot prove

The FMP/Vercel audit still uses today's cohort, lacks delistings and historical
membership, uses statement values that are not certified revision-safe, and
lacks complete as-known material news. It also reuses dates already inspected
during V7 through V9. It is therefore a contaminated development falsification
test and can never authorize capital, even if every numerical gate passes.

A credible result requires the exact frozen thesis on a sealed
`screener-pit-v1` dataset with historical membership, delisting outcomes,
revision-safe fundamentals, complete point-in-time events, at least three audit
folds and at least 1,000 placebo seeds. Passing that audit makes V10 eligible for
independent review only. Live promotion still requires an immutable forward
paper record. Until those steps succeed, the current recommendation engine is
unchanged and no claim of demonstrated alpha is permitted.
