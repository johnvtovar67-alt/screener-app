# C1 continuation — September 11, 2026

This branch continues PR #149. The frozen simulator, sleeve options and historical results are unchanged. C1 trading authority remains suspended; this is an index-source integration release.

## Implemented in this continuation

- Both hosted page APIs and the legacy refresh entry point read the explicit S&P 500 book. They never fall back to the old broad cohort.
- Production uses a stable versioned storage path independent of deployment commits.
- Initialization copies only the accepted PR #149 September 10 S&P observation, checking its recorded source hash and model-record integrity. Missing or changed seeds stop initialization. No model clock, historical fill or account holding is invented. The source record remains untouched.
- An authenticated 300-second cron advances the book after completed market sessions. Repeated runs skip collection once current. Provider failures, changed adjusted-price anchors, missing sessions and conflicting writes remain blocking conditions.
- Removed the every-minute research-program schedule. The frozen research artifacts and manual research endpoint remain intact.
- The protected preview's S&P acceptance route uses the same lifecycle implementation as the cron.

## Verification

Local `npm run prebuild` passed after the source/store/route changes. The focused dated-book and index-lifecycle regressions passed. The new lifecycle regression is included in the required policy checks. Hosted build and provider acceptance must be recorded after publication before merging.

Local dependency installation was cancelled by the execution environment's network approval flow. No application build is claimed from this checkout; use the GitHub/Vercel builds of the exact published commit.

## Remaining release blockers

1. Provider acceptance of the scheduled source path on the exact release commit and production deployment.
2. A prospective migration policy for actual existing holdings, account-sized entry/stop planning, and actual fill reconciliation. Current aggregate holdings must not be labeled historical sleeve fills. Confirmed manual account records are acceptable; a broker connection is not mandatory. Preserve Core MSTR and the SCHW purchase block.
3. The saved historical tests lack dated sector classification provenance. Fixed-candidate controls are post-selection diagnostics, and original evaluation boundaries must retain their original interpretation. These gaps cannot be fixed by renaming a build or replaying the same inspected data.

The user has already waived the 60-new-session waiting requirement. No waiting-period requirement is added. This source repair does not itself establish trading readiness or statistically validated alpha.
