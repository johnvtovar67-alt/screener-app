# C1 Priority 3: intraday advisory — local review package

## Authorization and reference

The owner's October 14 pasted instruction explicitly authorizes implementing and testing a read-only intraday advisory interface locally, with manual on-demand refresh. It prohibits changing authoritative scoring, Buy/Sell/Hold decisions, sizing, stops, exits, the three-sleeve/30-session framework, accounts, production data, infrastructure or credentials, and prohibits deployment without approval. Momentum responsiveness is research design and initial evidence only; no alternative trading rules or 48-Challenger study are authorized.

Reference main/production: `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`, deployment `dpl_DDBfxBKupMFdHaH5sATk2VCMcPvC`. The isolated local branch is `feat/c1-intraday-advisory`. No push or deployment is part of this package.

## A. Implementation

The Opportunities and My Portfolio pages gain one separate Intraday intelligence panel. Its button fetches symbols only through a new GET endpoint. It never sends the account, stop levels, holdings, shares, cost basis or sync key. Response quotes stay in component memory and never update existing screen/portfolio quote rows, official decisions, evidence, ranks, confirmation streaks, trade plans or records.

- `lib/c1IntradayAdvisory.js`: pure target selection and disposable observations. Targets are the authoritative dated nine-name screen and matching recorded C1 Swing holdings; Core/cash and unrelated broad-screen names are excluded. Holding mismatches suppress holding observations rather than inventing recorded levels. Candidate/holding rank context remains dated and unmodified.
- `lib/c1IntradayAdvisoryProvider.js`: one FMP `/stable/batch-quote` request per uncached symbol set; maximum 32 symbols. Bounded process-memory caching (60 seconds, 24 sets), shared inflight requests (maximum eight sets), 20-second failure cooldown, and explicitly stale fallback for at most 15 minutes. Errors never disclose URLs, response bodies or credentials. No historical bars, storage or account acquisition.
- `pages/api/c1-intraday-advisory.js`: GET only, validates bounded public symbols before acquiring quotes, rejects extra query parameters, returns no-store responses and sanitized failures. No writes, new service, credential setup or cron.
- `components/C1IntradayAdvisory.js`: manual button, observation timestamps in America/Chicago, descriptive gap/open/current context, synchronized SPY/QQQ/available sector comparisons, actual recorded-stop distance, daily evidence/rank context, and clear fresh/delayed/stale/unavailable states. No automatic network polling. Local timers/focus handlers age observations; account/session/revision/target changes abort and discard obsolete responses.
- `pages/index.js`: two additive lines only, importing/rendering the new panel. Existing UI actions, data flow, account functions and all decision calculations are byte-for-byte preserved after removing those insertions.

## Freshness and comparison controls

- Fresh: valid regular-session observation, same open session, age at most 120 seconds.
- Delayed: same session, over 120 seconds and at most 15 minutes; no current relative or stop-distance confirmation.
- Stale: older/different/closed session or flagged fallback. Closing prices may remain visible as dated references.
- Unavailable: missing/duplicate/invalid price, unknown timestamp/receipt identity, future timestamps or invalid snapshot contract. No zero substitutes or fabricated measurements.
- Quote market timestamps and receipt timestamps remain separate. Epoch seconds/milliseconds are normalized; request completion cannot certify market freshness. Feed latency itself remains unverified.
- Relative observations require both quotes fresh with timestamps within 60 seconds. Their UI validity expires when the earliest stock or benchmark input expires. A review found and fixed this benchmark-aging boundary; a dedicated regression now covers it.
- Stops come only from actual recorded decision stop rows, retaining multiple sleeve levels. No average-cost-derived stop is created. Stop distances and daily/current divergence require the accepted prior-session close/date to match the quote previous-close basis at numeric precision. Basis disagreement suppresses the comparison.
- Only dated accepted sector labels supply sector ETFs. If a holding is outside the nine-name dated screen and has no accepted sector metadata, sector comparison is explicitly unavailable; no extra profile project/call is introduced.

## Example output and its limits

The mocked preview is explicitly synthetic, not a brokerage account or current stock prices. For a synthetic DELL observation of $98, open $101 and prior close $100, synchronized SPY rising from $100 to $101, the panel reports:

> Fresh · provider observation Oct 14, 2026, 11:00:00 AM CDT. Overnight gap +1.00%; since open −2.97%; from prior close −2.00%; SPY-relative since open −3.97 percentage points. Daily rank #2 remains dated. “Historical momentum / current weakness”: strong completed-session momentum coexists with a decline from open and synchronized SPY underperformance. A supplied recorded $95 stop remains unchanged; its distance is 3.06% of observed price.

Separate local HTTP verification used real existing FMP access: GET requested DELL/SPY/QQQ/XLK and returned HTTP 200, the correct contract, four sanitized quotes and a live-response receipt at `2026-10-14T22:40:36.665Z`. Because the probe was after market close, it does not establish an operational fresh-session signal, feed delay guarantee, or actual account baseline. No production route/account was called.

The 1% movement and 3% stop-proximity bands are descriptive heuristics, not calibrated forecasts or trading thresholds. Strengthening/weakening describes open-to-current movement; a rebound can coexist with a large negative gap. A single quote snapshot cannot establish a continuous path, acceleration, VWAP, volume confirmation, execution or a profitable reversal. Manual refresh cannot alert while the owner is absent.

## B. Responsiveness assessment

See `c1-priority3-momentum-responsiveness-20261014.md` and the separately captured market-only `c1-priority3-dell-evidence-20261014.json`.

Verified: the score's latest-price sensitivity is intentionally zero for its skipped windows. Five-session optimality is unproven. The entire system still responds through current price gates/stops and existing recent daily warnings. DELL's October 14 1/3/5/10-session returns were −11.27%/−13.33%/−12.27%/−5.58%, while its lagged input returns remained +165.97%/+43.25%. No actual DELL percentile, account action or stop was inferred. This illustrates lag, not exploitable alpha; the existing falling-knife diagnostic already recognizes the five-session decline once accepted.

The separate design compares current production C1, including its authorized exit overlay and daily Momentum Evidence, with recent 1/3/5/10-session explanatory signals, volatility-relative severity, equal-window acceleration and a small fixed recent-component mixture defined on paper only. No alternative is implemented or evaluated for performance. Require point-in-time membership/sectors/delistings, contemporaneous availability, realistic later fills/costs, controlled multiple testing and untouched chronological/prospective evidence. Misleading-signal frequency and net portfolio benefit are unknown.

## C. Priorities and legitimate decision value

| Enhancement | Increment and earliest availability | Legitimate current use | Misleading-signal evidence / next gate |
|---|---|---|---|
| Quote advisory | Current-session information before the next accepted daily close; first manually requested synchronized quotes | Direct attention to price divergence, verify broker quote/recorded-stop status, recheck existing entry authority | Rate unknown; snapshot noise, reversals, delay and adjustment basis. Review local UI; require live-session verification before a release. |
| Recent 1/3-session divergence and volatility severity | Completed close, adds shorter-horizon/magnitude context beyond current five-session evidence | Future explanatory evidence only | Conditional prediction, useful lead time and false-warning burden must be measured. |
| Recent 5/10-session confirmation or small rank component | Completed close | Research specification; no new selection/exit authority | Must beat existing daily evidence and the full current Champion after costs in independent periods. |
| VWAP/RVOL/bar acceleration or proactive scheduling | Requires validated bars or justified observation cadence | Deferred | Earlier feasibility probes found unresolved bar volume/close/coverage differences. No benefit or reliability claim. |

Prepare the quote panel for review now. Do not release until the owner approves deployment after reviewing the implementation and limitations. Do not change the score or exits. Reject DELL-specific optimization, continuous polling, unvalidated indicators and any performance claim derived solely from more observations.

## D. Verification and change control

Focused suites: `tools/c1-intraday-advisory-regression.cjs` and `tools/c1-intraday-advisory-ui-regression.cjs`. They cover immutable frozen inputs, target boundaries, missing/duplicate quotes, timestamp units and future values, 2/15-minute transitions, holidays/early close, benchmark skew and aging, exact recorded stops/basis suppression, bounded single requests/cache/inflight/cooldown, sanitized failures, manual-only fetching, malformed response/JSON, obsolete responses, and unmount cleanup.

Actual-browser verification uses a separate scratch preview with synthetic data and mocked requests. Desktop 1280×960 and mobile 390×1000 passed click/race/error/overflow checks with no external/account requests or page errors. Full build/guard/regression results are recorded in `c1-priority3-change-control-20261014.md` once completed; focused/browser checks are software evidence, not alpha evidence.

The existing release guard and build hooks remain unchanged. Only the five authorized affected/new application file hashes are updated in `docs/c1-release-freeze.json`, with this owner instruction recorded in `intradayAdvisoryAuthorization`. Tests are automatically discovered by the existing runner. No canonical strategy, policy, account/storage API, source history, credentials, cron, allocation, stop, holding rule, momentum exit or profit rule is modified.
