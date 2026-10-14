# C1 Priority 2 — actionable portfolio momentum evidence

Owner authorization: October 14, 2026 request to replace duration-based evidence labels with Momentum Accelerating, Momentum Intact, Momentum Weakening and Exit Risk. The owner explicitly prohibits changes to trading rules, sizing, stops, the 30-session framework, momentum/profit protection, account records, deployment without approval, Challenger research and Blob configuration.

## Inspection and scope

`portfolioGovernor.js:swingTimeReview` chooses Setup, Proof, Re-underwrite, Opportunity Cost and Long Swing Review from calendar-day buckets (<10, <25, <45, <60 and 60+). Technical scores affect review flags but not these labels. `pages/index.js:PortfolioRow` displayed the buckets even when its position action came from the independent actual-account C1 decision.

The actual-account decision already exposes authoritative opportunity rank, recorded stops, pending exits, early-rank/profit-protection confirmation streaks, and the 30-session rule. Accepted session records contain the published opportunity pool, adjusted holding closes, five-session price returns, 20-session moving-average slope, MACD direction and relative returns versus SPY. Prior ranks were not exposed in the account response. The new read-only extractor reconstructs at most six consecutive accepted sessions using the canonical eligibility function, momentum-only ordering and symbol tie break. Private held-stock comparison ranks never replace authoritative opportunity ranks.

## Classification

Evidence is informational and independently displayed beside the existing position action and Why. Each row includes its accepted-session date and observed reasons.

- **Momentum Accelerating:** comparable authoritative rank improves, five-session return and moving-average slope are positive, MACD is improving, and verified positive 20-session relative strength versus SPY improves from the comparison session. Available relative-strength horizons must not be negative.
- **Momentum Intact:** current rank remains inside its recorded holding range, price return and moving-average slope support the position, and available verified relative strength is nonnegative, without observed weakening.
- **Momentum Weakening:** comparable rank deteriorates or is outside the holding range; verified relative performance is negative; or price damage includes a falling-knife signal or both negative five-session return and moving-average slope.
- **Exit Risk:** an existing exit is queued, the accepted close is at/below or within 3% downside of a recorded stop, an active recorded early/profit exit streak is one confirmation from its existing requirement, or the existing minimum holding period has elapsed with rank outside its exit buffer. The 3% band is a display warning only; it does not move the stop or create a sell instruction.

Confirmed risk takes precedence over momentum support. Classification never returns a trade action, quantity, stop adjustment or fill. Duration only affects applicability of existing risk rules. The decision engines and trading-policy, sizing, stop and execution rules remain unchanged.

## Data limitations

No new data provider, acquisition, archive or infrastructure is required. Evidence comes from accepted completed sessions, not intraday momentum or unverified browser quote changes. Rank comparisons span up to five session intervals and require equal eligible-pool sizes; missing histories or changed pool sizes are explicit limitations. An empty or defaulted momentum pool cannot establish a verified rank.

Compacted timing omits some raw indicators and sometimes `asOf`; the accepted session date supplies provenance. Explicit mismatched/stale timing is rejected. Missing numeric observations remain missing. One available verified relative-strength horizon may support a partial assessment; the absent horizon is explained. Unknown, stale or unsupported evidence has no manufactured classification. Core holdings and portfolio/account mismatches show unavailable C1 evidence.

The durable account, holdings, transactions, original model observations and trading policy are not written or changed. Each serialized assessment is bound to the shares, basis, stops, exits and review rules it inspected. Intraday fills that change that risk state invalidate the old classification until the updated position has a completed-session review. Any current queued exit remains explicitly Exit Risk, with the limitation explained; an already-filled exit cannot remain in the evidence explanation. Opening-plan exits remain independent.

## Verification and release

New classifier and extraction regressions cover all four outcomes, stale/missing evidence, session gaps, empty/defaulted pools, exact canonical simulator rank parity, stop-warning boundaries, recorded confirmation requirements, and input/action immutability. A real in-memory intraday fill projection verifies that a filled sleeve's exit/stop cannot remain in a surviving holding's assessment. Rendered desktop/mobile regressions verify badges, explanations, dates and independent actions. The pinned-production parity test excludes only the newly authorized `momentumEvidence` annotation from its original complete decision comparison, preserves every prior economic/action/risk field and rule-source pin, and separately proves the annotation is unchanged by broker-cash changes. Only retired presentation assertions change in existing UI tests. The required complete suite and build are run before delivery; their exact result is recorded in the delivery report.

Final verification: `npm run build` passed, including release-freeze and canonical-integrity checks, all 92 regression scripts and the trade simulation (93/93). The Next.js production build completed successfully. `git diff --check` passed and the complete review patch applies cleanly to an archive of the inspected base commit. The initial sandbox could run children but incorrectly reported `EPERM`; normal local subprocess access resolved that environment issue. Full-suite failures from obsolete presentation assertions and the newly added informational output field were corrected before this final successful run.

Only the hashes for `pages/index.js`, `lib/c1AccountService.js`, `lib/c1MomentumEvidence.js` and `lib/c1MomentumEvidenceInput.js` are updated in `docs/c1-release-freeze.json`, with this explicit owner authorization. The freeze checker, canonical integrity check, regression runner and build hooks are unchanged.

Base: main and production commit `339f519ad1716325cfc2ee2cdb2cadacb1c8eacf`, checked read-only during this task. No push, merge, preview or production deployment is performed. Deployment awaits owner approval.
