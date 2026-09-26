# C1 early momentum-loss experiment — 2026-09-26

## Owner instruction

The owner asked to test whether C1's 14% position stop is too wide and whether
the strategy should act on a sustained loss of momentum before the existing
30-session rank-retention rule becomes active.

## Isolation

This work adds a disabled-by-default simulator option and a preview-only
research endpoint. It does not alter `C1_FROZEN_OPTIONS`, the C1 account, saved
positions, production recommendations, production execution, or production
deployment.

## Predeclared comparison

- Current C1: 14% catastrophic stop; rank exit outside the top six after 30
  sessions.
- Stop-only candidate: 12% catastrophic stop; otherwise unchanged.
- Primary candidate: 12% catastrophic stop plus an early exit after session
  five when the holding ranks outside the top nine for three consecutive
  completed sessions; the existing post-session-30 top-six rule remains.
- Attribution candidate: retain the 14% stop and add only the early top-nine
  rule.

Every candidate uses next-session-open execution and the unchanged C1 ranking,
sizing, sector limits, portfolio drawdown breaker, slippage, and whole-share
accounting. The comparison runs separately on the frozen point-in-time S&P 500
and Nasdaq evidence sets and combines the three existing C1 sleeves.

## Decision standard

The candidate must improve drawdown without materially degrading total return
or QQQ excess return. Window consistency, turnover, early-exit count, and
ten-session same-symbol re-entry are reported to identify churn and whipsaw.
No candidate is authorized for production by this experiment alone.

## Results

The frozen evidence covered 918 completed sessions from 2023-01-04 through
2026-09-01 in each universe.

| Universe | Policy | Return | Max drawdown | Sharpe | Turnover | Early exits | 10-session re-entry |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nasdaq | Current 14% | 92.19% | -38.01% | 0.723 | 1291% | 0 | 0% |
| Nasdaq | 12% stop only | 55.93% | -45.37% | 0.537 | 1345% | 0 | 0% |
| Nasdaq | 12% + top-9 x3 | 135.63% | -44.68% | 0.891 | 1714% | 103 | 3.88% |
| Nasdaq | 14% + top-9 x3 | 124.79% | -35.55% | 0.859 | 1575% | 108 | 2.78% |
| S&P 500 | Current 14% | 337.46% | -33.18% | 1.288 | 1354% | 0 | 0% |
| S&P 500 | 12% stop only | 568.99% | -33.53% | 1.566 | 1374% | 0 | 0% |
| S&P 500 | 12% + top-9 x3 | 558.40% | -31.99% | 1.585 | 1928% | 138 | 5.80% |
| S&P 500 | 14% + top-9 x3 | 424.22% | -32.04% | 1.466 | 1751% | 151 | 3.31% |

The 12% stop is not robust: it improved S&P 500 return but materially reduced
Nasdaq return and worsened Nasdaq drawdown. The 14% stop plus the early rank
rule improved aggregate return, drawdown and Sharpe in both universes, but it
beat the current policy in only eight of the sixteen subperiods and increased
turnover materially. The aggregate gain is therefore directionally supportive
of an early momentum-loss rule, not sufficient evidence that top-nine for three
sessions is the stable production parameter.

## Decision

- Retain the 14% catastrophic stop pending stronger evidence.
- Do not promote the 12% stop.
- Add a production candidate for an early downside momentum override: from
  session five through session 30, exit at the next session open after three
  consecutive completed sessions outside the top nine. This remains subject
  to owner approval and a production implementation review.
- Add a separate production candidate for protecting a profitable position:
  after its peak gain reaches 12%, exit at the next session open when its rank
  finishes outside the top six for two consecutive completed sessions. This
  overrides the 30-session minimum hold; a one-session wobble does not.
- Do not use the tested fixed 4% or 6% trailing-price exits. They produced far
  more turnover and were materially less robust than rank-based deterioration.
- Production remains unchanged.

## Expanded parameter grid

The follow-up grid retained the 14% catastrophic stop and tested early rank
deterioration at top-nine, top-12, and top-15 thresholds with two, three, and
five-session confirmation. It also tested two forms of upside protection:

- rank deterioration after the position first reached an 8% or 12% peak gain;
- a fixed 4% or 6% trailing-price exit after an 8% or 12% peak gain.

All overrides were limited to sessions five through 30 and executed at the
next session open. The same 918-session point-in-time evidence and eight
subperiod windows per universe were used.

### Selected downside comparison

| Universe | Policy | Return | Max drawdown | Sharpe | Turnover | Window wins |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Nasdaq | Current 14% | 92.19% | -38.01% | 0.723 | 1291% | — |
| Nasdaq | Outside top 9 x3 | 124.79% | -35.55% | 0.859 | 1575% | 5/8 |
| S&P 500 | Current 14% | 337.46% | -33.18% | 1.288 | 1354% | — |
| S&P 500 | Outside top 9 x3 | 424.22% | -32.04% | 1.466 | 1751% | 3/8 |

Nearby downside parameters were unstable between universes. Top-15 x3 was
best in aggregate on Nasdaq but slightly trailed the current policy on S&P 500;
top-15 x2 was strongest on S&P 500 but less consistent across its subperiods.
Top-nine x3 is therefore the more conservative continuation candidate, not a
claim that the grid identified a universally optimal threshold.

### Upside protection comparison

| Universe | Policy | Return | Max drawdown | Sharpe | Turnover | Profit exits | Window wins |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nasdaq | Current 14% | 92.19% | -38.01% | 0.723 | 1291% | 0 | — |
| Nasdaq | +12%, outside top 6 x2 | 214.37% | -36.88% | 1.108 | 1319% | 44 | 4/8 |
| S&P 500 | Current 14% | 337.46% | -33.18% | 1.288 | 1354% | 0 | — |
| S&P 500 | +12%, outside top 6 x2 | 649.29% | -29.61% | 1.677 | 1507% | 67 | 6/8 |

The +12% / outside-top-six / two-session rule improved aggregate return,
drawdown, and Sharpe in both universes, won 10 of 16 subperiod return
comparisons, and added much less turnover than the fixed trailing-price rules.
It is the strongest tested candidate for the owner's stated goal of protecting
a winner such as NTRA without selling merely because of one weak day.

The fixed trailing-price rules generated 231–384 exits in the S&P evidence and
240–351 in the Nasdaq evidence, roughly doubled annualized turnover, and
materially underperformed the rank-based candidates. They are rejected.

## Proposed operating behavior

For a C1 Swing holding during its first 30 sessions:

1. The existing 14% catastrophic stop remains active.
2. If the holding has not reached a 12% peak gain, three consecutive completed
   sessions outside the top nine may trigger an early momentum-loss exit.
3. Once the holding reaches a 12% peak gain, two consecutive completed sessions
   outside the top six trigger a profit-protection exit at the next session
   open.
4. A single weak session creates a warning, not an exit.
5. After an exit, re-entry requires a fresh C1 Buy qualification and normal
   portfolio-risk checks; the prior symbol receives no automatic preference.

This is a policy recommendation from a bounded historical experiment, not a
live instruction to sell NTRA. NTRA would first need to satisfy the confirmed
rank-deterioration condition using completed-session data.
