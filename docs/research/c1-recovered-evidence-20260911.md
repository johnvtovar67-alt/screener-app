# C1 recovered evidence — September 11, 2026

This index recovers completed work. Do not rerun it merely because the current checkout lacks its outputs.

## Completed controls

[Successful run 34528408162](https://github.com/johnvtovar67-alt/screener-app/actions/runs/34528408162), commit 2eff3d2cb7879415c3e57b3b1934e58f61f7d621, completed September 10 at 21:48 UTC. Merge job 103061624946 validated exactly seeds 0–999 per universe and the unchanged input/configuration contract.

| Universe | Controls | Return exceedances | Fixed-candidate p |
|---|---:|---:|---:|
| Nasdaq | 1000 | 27 | 0.027972027972027972 |
| S&P 500 | 1000 | 3 | 0.003996003996003996 |

Both completion records explicitly say eligibleForLiveCapital:false.
Artifact c1-complete-results, ID 10174691584, contains final JSONL outputs. The local JSONL prefixes are incomplete; do not mistake them for these completed results.
These are fixed-candidate random-ranking diagnostics, not correction for the full adaptive strategy search, not independent future evidence, and not the probability that C1 will lose money.

## Recovered original datasets and cost reports

The earlier workspace /workspace/scratch/72d4008e26cf contains nasdaq-frozen/manifest.json and six chunks, sp500-frozen/manifest.json and 24 chunks, and c1-cost-nasdaq.json / c1-cost-sp500.json. Do not request another user export while these files remain accessible.
Durable manifest/checkpoint references are on research/c1-1000-seed-control under docs/research/c1-actions/. Private raw data are referenced by the existing manifest; no credentials belong in this index.

The accounting fixtures and their prior parity reports are already committed. The weighted saved curves reproduce 268.65228% Nasdaq and 380.7204925% S&P returns; maximum drawdowns are -20.17189994% and -20.70105150%. Rechecking this arithmetic is not new validation.

## Actual unresolved work

- Establish dated sector classifications compatible with the compiler's sector semantics. The manifests' pointInTime flag alone does not prove sector provenance.
- Recover the complete adaptive candidate-selection history, or explicitly limit statistical conclusions to inspected historical diagnostics. Do not call the existing controls family-wise significance.
- Verify production input initialization separately from software deployment. Do not claim a scheduled cron succeeded without runtime evidence.
- Latest date repair was deployed as 0f54f6e. Existing account integration and date tests should be reused; user's private account was not remotely modified.

No new 60-session waiting requirement is imposed. No release authority is enabled by this document.
