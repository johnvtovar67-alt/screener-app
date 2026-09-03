# V21 / R11 Parallel Nasdaq Research

Status: research-only. V11 production remains `2026-09-01-v11-setup-tolerance`.

## Why the earlier results are quarantined

The earlier S&P point-in-time runs cannot be treated as reliable evidence until
they are reproduced under the corrected data and execution contract. The audit
found two defects capable of making a result look better than it was:

1. Membership coverage counted the presence of a company profile, not an actual
   adjusted price bar for every member-date observation.
2. A holding removed from the index could survive because its signal disappeared
   before the ranked-exit path could schedule a sale.

R11 fixes both defects. It measures actual member-date price coverage and requires
100%. It also emits a dated `universe-removal` action and realizes the position at
the first later session open, with the same 12 bps slippage as every other sale.
Regression tests cover both behaviors. No earlier headline return is inherited by
R11.

## Frozen experiment

- Research generation: R11
- Production candidate label: V21
- Candidate freeze: 2026-09-03
- First genuinely prospective date: 2026-09-04
- Data range: 2022-01-01 through 2026-09-01
- Universe source: FMP's current and historical Nasdaq index endpoints
- Benchmarks: SPY and QQQ
- Execution: signal at close, whole-share fill at next session open
- Costs: 12 bps slippage per side; zero commission
- Idle capital: cash, never a benchmark completion sleeve
- Historical membership: effective on the first observable session after the
  provider's effective date
- Missing member-date or removal-open prices: fail closed before returns are
  evaluated

FMP calls the endpoint the “Nasdaq index” without unambiguously identifying NDX.
The builder therefore preserves that provider label and refuses data whose live
roster is outside 90–125 names. This run is an independent large-growth-universe
test, not proof that the source is Nasdaq-100.

## Ten preregistered mechanisms

1. R8 dual-benchmark residual-rank replication
2. Absolute-momentum matched-lifecycle control
3. Residual momentum plus gradual-information continuity
4. Residual momentum plus continuity, acceleration, and lottery restraints
5. Residual momentum plus an acceleration restraint
6. Residual momentum plus a maximum-daily-return lottery restraint
7. Residual momentum plus a realized-volatility restraint
8. 52-week-high anchored gradual leadership
9. High-volume near-high continuation
10. Trend-conditioned short-horizon pullback

The price-only signals are motivated by published work on residual momentum,
information discreteness, momentum acceleration, and extreme daily returns:

- [Residual Momentum](https://doi.org/10.1016/j.jempfin.2011.01.003)
- [Frog in the Pan](https://doi.org/10.1093/rfs/hhu003)
- [Momentum Acceleration and Reversal](https://joim.com/article/momentum-acceleration-and-reversal/)
- [Maxing Out](https://www.nber.org/papers/w14804)

R11 does not label price stability as QMJ and does not use current fundamentals
as if they were point-in-time history.

## Parallel holdout funnel

The unit of parallel work is a frozen calendar window. Independent serverless
workers write immutable, SHA-256-bound results. A coordinator refuses missing,
duplicated, re-ordered, or fingerprint-mismatched shards.

| Phase | Workers | Candidates | Selection rule |
| --- | ---: | ---: | --- |
| Development | 3 | 10 per worker | One passing champion per economic family; at most four advance |
| Validation | 2 | Frozen finalists only | Exactly one passing candidate is frozen |
| Historical audit | 2 | The one frozen winner | Audit cannot change the selected ID |
| Forward diagnostic | 1 | The same frozen winner | Report-only; never selects |

The phases remain sequential. Only windows inside a phase run concurrently, so
the speedup does not expose validation or audit as tuning surfaces.

## Evidence gates

Development, validation, and audit each require positive strategy return,
positive alpha against both SPY and QQQ, positive expectancy, profit factor above
1, adequate exposure/trade count, at least half of windows with positive alpha,
and maximum drawdown no worse than -25%.

The historical audit adds Newey–West HAC statistics strictly greater than 3
against both SPY and QQQ and a trade-concentration check. A deterministic pass is
not an alpha claim: it only unlocks a separately implemented 1,000-seed
maximum-statistic matched-placebo test. At least 60 genuinely new sessions and an
independent review are still required before any alpha or live-capital claim.

## Production run order

The existing authenticated research cron advances this state machine. Public
GET requests are read-only; every acquisition, force, worker, freeze, and
finalization mutation is POST-only and protected by the timing-safe cron secret.
For multi-window phases the cron dispatches separate serverless requests with
`Promise.all`, and the stored worker timestamps report whether wall-clock overlap
actually occurred.

1. Build and freeze the private membership universe.
2. Acquire adjusted histories and compile durable chunks until complete.
3. Pass the exact price/membership integrity audit.
4. Launch all three development shards concurrently.
5. Freeze validation; if finalists exist, launch both validation shards
   concurrently.
6. Freeze exactly one audit candidate; if one exists, launch the two audit shards
   and forward diagnostic concurrently.
7. Finalize once. Preserve rejection or advance only to the placebo stage.

All R11 endpoints and stored reports explicitly return
`productionChanged:false`, `eligibleForAlphaClaim:false`, and
`eligibleForLiveCapital:false`.
