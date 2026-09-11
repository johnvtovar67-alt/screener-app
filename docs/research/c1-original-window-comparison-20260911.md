# C1 original-window comparison — September 11, 2026

The previously missing comparison across the original eight reporting windows is now calculated from saved dated equity curves. **Nasdaq beats both SPY and QQQ in 6/8 windows; S&P beats both in 7/8.** This supplies descriptive fold-comparison evidence, not selection-adjusted validation or trading authorization.

## Method

Use the windows declared in `tools/run-local-risk-family.mjs` and the first-included-close to last-included-close convention in `slicePointInTimePortfolioRun` at implementation base `7296d40a2ffeccc1d889a052f09b0cb4096343e7`. Each ensemble equity is 25% base + 50% cooldown15 + 25% sector40 equity, with no resets or rebalancing between sleeves. Use adjusted SPY and QQQ closes from the existing frozen S&P dataset on the same endpoint dates. The last window is shorter.

The original reporting convention omits returns between one window's last close and the next window's first close. Consequently these window returns must not be compounded to reproduce the continuous full-period return. No simulation, historical control, sector relabeling or new holdout test was run.

Whole-period benchmark checks give SPY 107.5921% and QQQ 171.7407%, matching the previously saved rounded benchmark totals. Weighted saved terminal curves give Nasdaq 268.65228% and S&P 380.7204925%, matching the completed historical assessment. Input SHA256 hashes are retained in the companion JSON.

## Results

All values are cumulative percentage returns within the stated window.

| Start | End | C1 Nasdaq | C1 S&P | SPY | QQQ |
|---|---|---:|---:|---:|---:|
| 2023-01-04 | 2023-07-06 | 42.21 | 46.17 | 15.43 | 38.69 |
| 2023-07-07 | 2024-01-04 | 18.21 | -5.87 | 7.36 | 8.63 |
| 2024-01-05 | 2024-07-08 | 4.10 | 28.29 | 19.42 | 25.72 |
| 2024-07-09 | 2025-01-06 | 15.31 | 26.37 | 7.81 | 5.70 |
| 2025-01-07 | 2025-07-10 | 11.50 | 17.00 | 6.95 | 8.10 |
| 2025-07-11 | 2026-01-08 | 35.58 | 37.29 | 11.20 | 12.23 |
| 2026-01-09 | 2026-07-13 | 29.12 | 24.53 | 8.51 | 13.85 |
| 2026-07-14 | 2026-09-01 | -7.02 | 4.30 | 1.32 | -1.67 |

## Disposition

- Original-window return comparison: completed.
- Historical selection adjustment: remains unestablished; all these dates were already inspected.
- Historical sector materiality: remains unmeasured.
- Existing private account-to-order verification: unchanged.
- No waiting period, extra release gate or runtime change is added.

This receipt narrows the outstanding work recorded in [the bounded decision](c1-bounded-research-decision-20260911.md). It must not be represented as a fresh independent performance result or complete acceptance of all earlier fold requirements.
