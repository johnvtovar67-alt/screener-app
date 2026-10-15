# C1 Priority 3 — GitHub PR readiness

## Authorization and source identity

The owner explicitly authorizes publishing the complete local implementation from `0e11650cf514661bd3f62ecd9dfe5c822bdc4991` on a dedicated feature branch and opening a reviewable PR against current `main`. Merge and every deployment remain prohibited without separate explicit approval. No infrastructure or credential work is authorized.

At the publication audit, fetched `origin/main` and current production both point to `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`; the original implementation is already based on that exact commit. No rebase, strategy change or alternative responsiveness implementation is needed. Branch: `feat/c1-intraday-advisory`. The original implementation commit remains intact in local history, with every application, test and evidence file preserved. Published content is verified by Git tree/file identity; publication through the existing GitHub app can produce different commit metadata and SHAs from local Git.

The command-line remote has no configured GitHub login. Publication uses the existing connected GitHub app's Git-data API instead; no credentials are requested, installed, rotated or inspected. The original implementation tree and the final review tree must each match their local Git tree SHA exactly before creating the remote branch. The PR records the resulting published commit identities and the original local reference explicitly.

## No-deployment publication

Before the branch's first push, `vercel.json` adds exactly `git.deploymentEnabled["feat/c1-intraday-advisory"] = false`. Vercel documents this as disabling automatic deployments for the named branch: https://vercel.com/docs/project-configuration/git-configuration . Existing branch settings and both cron definitions remain unchanged. This is a branch-specific repository guard, not new infrastructure, a project-wide setting change, or an authorization to deploy main. No ignore-build command, deployment API, promotion or merge is used.

The GitHub Actions workflow remains unchanged: PRs against main run the standard production build, including both integrity guards and the full discovered regression suite. It contains no deploy or account-write step. The PR head and deployment list must be checked after publication to verify CI status and the absence of a feature deployment.

## Advisory isolation

The only existing application-file delta is the two-line import/render integration in `pages/index.js`. Removing those lines restores production's page byte-for-byte. The advisory component receives data-only props; it receives no decision setter, account mutation function, execution callback or sync key.

The request graph is component manual button → GET `/api/c1-intraday-advisory?symbols=...` → bounded FMP batch quote. No account, model-collection, storage or execution route is requested. The API import graph contains only the advisory provider/core, existing calendar and pure daily-evidence/frozen-options helpers; it contains no account service, store, authoritative collector, storage SDK or order generator. Its only effects are provider GETs, bounded process-memory quote maps and isolated client state/timers.

Authoritative score/rank functions, five-session exclusion, Buy/Sell/Hold actions, account and execution services, sizing, stops, sleeve allocation, 30-session framework, momentum exits, profit protection and confirmation streaks remain byte-identical to current main. The manifest updates remain restricted to the five explicitly authorized advisory/integration application files. Guard implementations and build hooks are unchanged. The separate responsiveness design and captured descriptive DELL evidence neither implement alternative rules nor modify the frozen 48-Challenger protocol.

## Required verification

Run `npm run build` in a clean detached current-main worktree and in the feature worktree. This executes the release freeze guard, canonical integrity, every discovered regression and existing trade simulation, then optimized Next production compilation/static generation/tracing. Record the exact published head, base and results in the PR. Before final status, compare the remote feature ref with the local final commit and recheck production/main identity.

The focused suites exercise manual-only requests and request counts; no account/model requests or writes; input immutability; exact recorded stops; seconds/milliseconds and receipt identity; future/missing/duplicate observations; current, delayed, stale and closed-session handling; early closes/holidays; missing/skewed/aging benchmarks; conflicting prior-close bases; safe fallback/cooldown; and obsolete-response/unmount cleanup. Both suites are included in the existing full runner. Earlier desktop/mobile mocked-browser and real local quote-route evidence are recorded in the original implementation report; neither involved actual account or production-data access.

## Remaining limits and recommendation

- Freshness is observation age, not an independently certified exchange-feed delay guarantee. The real local FMP smoke was after close; a fresh-session end-to-end check remains a release-validation item.
- Manual on-demand snapshots cannot warn while the user is absent and cannot establish an intraday path, acceleration, execution or persistence.
- Accepted sector metadata is absent for some holdings outside the daily nine-name screen; sector comparisons are explicitly unavailable.
- Missing or stale benchmarks suppress relative observations. A conflicting accepted prior-close/date basis suppresses stop distance and historical/current divergence, even when a quote itself is fresh.
- The 1% movement and 3% stop-proximity bands are descriptive heuristics with unknown predictive value and misleading-signal rates. A rebound since open can coexist with a large overnight loss.
- No bar-volume, VWAP or unvalidated technical indicator is used; no return/drawdown improvement is claimed.

Recommendation: GO for a reviewable PR once the current-base/head checks pass and automatic branch deployments are blocked. NO-GO for merge or deployment in this authorized phase. No scoring or trading-rule change is proposed. Deployment approval should be considered only separately after PR review and appropriate live-session validation.
