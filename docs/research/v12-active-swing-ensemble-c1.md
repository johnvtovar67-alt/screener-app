# V12 Active Swing Ensemble C1 — Frozen Research Candidate

Status: **qualified for prospective paper trading or a very small risk-capped pilot; not approved for full-capital production trading**.

Frozen on 2026-09-04 after point-in-time tests covering 2023-01-04 through 2026-09-01. Production V11 is unchanged.

## Mandate

- Pure active swing system; no passive-index sleeve.
- `MSTR` is explicitly blocked. It remains outside this system's mandate.
- Point-in-time Nasdaq and S&P 500 universes, including historical membership changes and delistings.
- Benchmarks: QQQ and SPY.

## Portfolio construction

Run three virtual sleeves and add their equity curves without inter-sleeve rebalancing:

| Weight | Sleeve | Sector cap | Portfolio cooldown |
|---:|---|---:|---:|
| 25% | Base momentum | 50% | 10 sessions |
| 50% | Extended-cooldown momentum | 50% | 15 sessions |
| 25% | Sector-capped momentum | 40% | 10 sessions |

Shared rules:

- Rank daily using price-only momentum.
- Hold the top 3 names; at most 2 positions per sector.
- Minimum hold: 30 sessions.
- Exit when a holding falls outside the top 9 after the minimum hold.
- Initial position stop: 14%.
- Portfolio drawdown breaker: 12% followed by the sleeve cooldown above.
- Minimum price: $5; minimum 20-day average dollar volume: $300 million.
- Backtest base case uses 12 bps slippage per transaction and no commissions.

## Frozen results

| Cost assumption | Universe | Return | Sharpe | Max drawdown | Alpha-positive periods | Top-3 gross-profit share |
|---|---|---:|---:|---:|---:|---:|
| 12 bps | Nasdaq | 268.65% | 1.405 | -20.17% | 6/8 | 39.99% |
| 12 bps | S&P 500 | 380.72% | 1.585 | -20.70% | 7/8 | 47.61% |
| 25 bps | Nasdaq | 260.01% | 1.381 | -20.50% | 6/8 | 42.27% |
| 25 bps | S&P 500 | 314.20% | 1.441 | -24.17% | 6/8 | 49.22% |
| 50 bps | Nasdaq | 232.88% | 1.309 | -21.09% | 6/8 | 43.15% |
| 50 bps | S&P 500 | 260.63% | 1.303 | -22.93% | 6/8 | 47.13% |

The two adjacent coarse weights, 20/50/30 and 30/50/20, also cleared every frozen gate at 12, 25, and 50 bps. The midpoint was selected to avoid choosing an edge of the passing region.

## Negative controls

With the 25/50/25 weights frozen, 60 random-ranking ensembles were run independently in each universe. None passed the complete acceptance gate (positive aggregate alpha versus both benchmarks, max drawdown no worse than 25%, at least 6 of 8 alpha-positive periods, and top-three gross-profit contribution no more than 50%). The empirical family-wise p-value was `(0 + 1) / (60 + 1) = 0.0164` in each universe.

## Known failure and limits

- Raising the minimum average dollar volume to $1 billion reduced consistency to 4/8 periods in both universes. The system is therefore not validated under that narrower opportunity set.
- Nasdaq and S&P replication are independent universe tests over overlapping dates, not a future time holdout.
- Many earlier theses were examined before C1 was frozen. The random controls do not fully erase researcher/model-selection bias.
- Backtests omit taxes and may understate market impact, borrow constraints, price gaps, and live data faults.
- Historical results do not establish a probability of future profit.

## Promotion gate

Do not replace production V11 until C1 completes a prospective ledger with no rule changes. Minimum promotion evidence: 30 closed paper trades and 90 calendar days, no greater than 12% prospective sleeve drawdown, realized cost within the 25 bps test, and no operational divergence between intended and executed holdings.
