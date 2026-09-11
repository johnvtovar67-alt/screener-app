# C1 continuation — September 11, 2026

## Current release decision

**C1 is still suspended.** Production remains `0b4d7f574f9a206c97744384ca5116e59e688764` on `screener-app-cq5t.vercel.app`. Health was checked during this continuation. Do not describe PR #147 as a trading release or as a completed connection to the live recommendations.

The user requested completion of trade and portfolio readiness, without restarting model selection or waiting 60 new sessions. That waiting requirement was already waived. Frozen options, simulator, saved historical results, and control seeds must stay intact.

## Completed in this continuation

[PR #147](https://github.com/johnvtovar67-alt/screener-app/pull/147), branch `fix/c1-dated-live-input`, adds a separate dated input collector. The old historical index compiler is frozen through September 1; the currently deployed snapshot reads a different provisional broad cohort. Refreshing either store does not close that mismatch.

The new collector uses the existing historical signal compiler for just the newly observed completed session. Prior prices warm the indicators; current members and sector labels do not become historical decisions. Its normalized source compiler and compactor match the preserved archived-replay files byte for byte. The endpoint is available only outside production, and all results remain non-executable.

Protected-preview acceptance on commit `39f40a7fe07f9625ef122576775f3ce36d4b38f5` returned HTTP 200:

- September 10 completed price data; observed September 11 at 02:58:14 UTC.
- All 102 provider Nasdaq index members and both benchmarks collected: 104 price histories.
- 100 members evaluated. HONA and SPCX lacked 253 observations and stayed in the declared universe but were excluded from ranking by the existing compiler rule.
- Membership and current sectors matched before and after collection.
- Price calendars, current closes, adjusted OHLC validity and source hashes passed the collector's checks.

The exact result is in `docs/research/c1-live-input-acceptance-20260911.json`. It is current-source acceptance, not historical certification, a backtest, a trading book, or a brokerage order. Subsequent small guards reject malformed JSON without echoing provider content and reject invalid history start dates.

Validation: `node tools/c1-live-input-regression.cjs` passes. The complete `npm run build` passed before the two additional input-error guards. It includes existing C1 software gates, accounting fixture checks and service-equivalence regressions. Git-connected Vercel preview builds verify the published commit. No synthetic positions were uploaded and no account data or credentials were committed.

## Remaining work — do not replace this list with another general audit

1. **Production source and model connection.** Declare which tested index universe the production strategy uses. The new hosted collector currently checks the provider Nasdaq index; the S&P compiler accepts offline supplied data, but the hosted route does not acquire its 500 histories. Persist accepted daily source records separately from frozen research data and the old broad diagnostic book. Bind the selected source, immutable observation identity, corporate-action handling and model record to both pages. The new input collector does not yet do this. Its changing observation timestamp must not be confused with a market-data revision when persistence is added.
2. **Historical evidence.** Dated sector classifications are unavailable in the historical manifests. C1 consumes the sector labels through its 50%/50%/40% caps. Current sector observations do not repair that evidence. Original eight-period results still need their original boundaries and interpretation; the 1,000-seed tests are fixed-candidate post-selection diagnostics, not family-wise correction. No new holdout is created by replaying inspected data.
3. **Actual account and recommendation path.** Obtain current confirmed Swing holdings, share counts and available cash. The memory summary and synthetic fixtures are not current account records. A broker connection is optional; confirmed manual records are acceptable. Reconcile actual partial fills and compare both pages with the same server-owned model decision before any account-specific orders. Current aggregate shares must not be labeled undocumented historical sleeve fills. Preserve Core MSTR and the SCHW purchase block.

The new input path is a substantive source repair in preview. It does not resolve these remaining dependencies or justify switching any trading authorization flag.
