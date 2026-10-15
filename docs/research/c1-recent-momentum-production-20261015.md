# C1 recent-momentum production release

Owner authorization: the October 15 request, “Complete and Release Recent-Momentum Decision Engine,” explicitly authorizes finishing `be24d87`, integrating the live Swing flow, opening a PR, passing normal review/CI, and merging/deploying only after release checks pass. This supersedes the earlier research-only authorization for this implementation. No account migration, reset, data acquisition, brokerage connection or execution is authorized or performed.

## Decision rules

Historical momentum scores, ordering and rank-to-size mapping stay unchanged. The shared gate reads six consecutive accepted adjusted closes and canonical same-session MACD direction. Missing, stale, duplicate, misaligned or future-available evidence blocks fresh capital and cannot confirm a new momentum exit.

Let R1/R3/R5 be the 1/3/5-session close returns, N mean R3 and R5 are negative, W mean R1 is negative and MACD is not improving, and recovery mean positive R1 with improving MACD. Buy/Add/partial completion requires `!W && (!N || recovery)`, as well as every existing C1 eligibility, liquidity, gap, cooldown, sizing, cash and concentration check. Exited names can qualify again; there is no permanent symbol ban. A reentry starts a new ownership lifecycle.

Ordinary holding deterioration starts when R1/R3/R5 are negative and MACD is not improving. It continues while N persists and MACD is not improving, allowing a small green bounce. Three consecutive completed confirmations queue a next-regular-open full exit. Clearing N or improving MACD resets that episode. There is no extra minimum holding age.

At a verified observed peak gain of at least 12%, profit protection latches for that ownership lifecycle even if gains later disappear or the entry basis changes after an Add. The same deterioration episode then requires two closes. An additional giveback path requires a verified same-lifecycle high and surrender of at least **half the earned peak gain**, `(peak-close)/(peak-entryBasis) >= 0.5`, plus negative R1 and non-improving MACD on each of two consecutive completed closes. A green close or improving MACD resets this additional counter. The half-gain threshold is the stated default for the owner's otherwise unspecified “meaningful giveback”; it is not optimized from performance results.

Only accepted adjusted daily highs actually observed while the position was owned can establish the supplemental peak. Missing older peaks are never filled in. Partial coverage is disclosed; an observed high is a conservative known peak, not a claim to the unknown lifetime maximum. Intraday verified quotes are separately dated advisories, expire after 120 seconds, and never update peaks or completed-session counters.

## Live integration and preserved facts

The existing Challenger generator and shared helper are reused. A small explicit live adapter applies recommendations from the October 14 completed session onward. Rebuilding prior actual ownership gathers gate state without retroactively vetoing recorded purchases or changing accepted fills. New recent-exit fills replay only after the original saved plan and posted economics reconcile through the existing private capability mechanism. The canonical Champion simulator, frozen options, historical comparison inputs and frozen experiments are unchanged.

Opportunities, Portfolio and opening projections consume the same gate. A weakening or unavailable holding is Review rather than an unqualified Hold. Existing stops/full risk exits take priority over a new momentum exit. New exits map to the existing next-open phase. A focused test exposed a prior-triggered stop being displayed as an intraday phase after its replacement buys; the projector now identifies that already-pending full risk exit as an opening carry sale before its funded purchases. If a pending recent-momentum exit opens through the existing stop, that stop retains its reason, fill calculation and cooldown, with a single opening sale before any funded replacement. New conditional standing stops keep their original phase. Sold-sleeve reviews are removed from intraday views while surviving ownership retains its own evidence.

Core holdings, 14% stops, portfolio breakers, sleeve limits, account scales, funding and execution controls remain in force. C1 remains manual decision support. Brokerage commission defaults to zero; the existing 12 bps estimated spread/slippage is explicitly identified in plan assumptions. Actual posted prices and factual recorded fees override estimates; previously recorded transactions are never rewritten.

## Verification and limits

Focused production tests cover DELL-like deterioration above its stop, MPC-like gain giveback while longer returns stay positive, correction/recovery, new Buys/Adds/completions, stop precedence, missing/stale evidence, partial and full recorded exits across all sleeves, duplicate fills, zero brokerage cash, immutable history, and actual reentry with fresh lifecycle state. These are mechanical tests using synthetic accounts, not evidence of superior investment returns. No historical performance advantage is claimed.

The release freeze is updated only for the explicitly authorized changed/new application files. The guard and build hooks are retained. Canonical integrity and its release-version regression require this exact release identifier; required health features identify the live implementation. The historical brokerage-parity source pins are updated only for the reviewed live adapters, phase mapping and stock classifier. Its original production fixture, canonical strategy pins and exact pre-cutover economic comparisons remain intact and pass.

Focused verification passes 86 giveback, 87 production-account integration and 52 UI/shared-decision assertions, plus the original 222 Challenger assertions. Full regression, production build, independent source review, PR CI, Vercel preview and production readback must pass before the release is reported as deployed. No private account records are used in the fixture tests or modified by release verification.
