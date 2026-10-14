# C1 Priority 2 production release authorization — October 14, 2026

The owner explicitly approves deploying the reviewed momentum-evidence enhancement to production C1 through the existing GitHub/Vercel workflow. Release requires evidence-only scope, unchanged trading/account behavior, successful release checks, a rollback reference, and production version/smoke verification. The owner prohibits changes to Challenger research and Blob configuration.

## Preserved rollback reference

- Production Git commit: `339f519ad1716325cfc2ee2cdb2cadacb1c8eacf` on canonical `main`.
- Vercel deployment: `dpl_4q3DwNs1jJsRLo3sbT2Nnk9Q4nVT` (`READY`).
- Immutable deployment URL: `https://screener-app-cq5t-js934v7zf-johnvtovar67-7543s-projects.vercel.app`.
- Canonical project: `screener-app-cq5t` / `prj_9MJJaMsEfOdtQKXj4VFI7TfJcBjQ`.
- Team: `team_vBLhac1QJ54zPEiWFFK7XmGN`.
- Production alias: `https://screener-app-cq5t.vercel.app`.

These references were verified before release with the Vercel deployment record, current GitHub main, `/api/version`, and healthy `/api/health` responses. Keep the prior deployment and original Git lineage; rollback can select the preserved deployment without modifying account records, market inputs, cash or fills. Vercel rollback can disable automatic alias assignment until the next explicit promotion; inspect that state before a later release.

## Approved change and safeguards

The change replaces holding-age evidence badges with four momentum classifications, dated explanations, and explicit unavailable/stale states. Server code derives a read-only annotation after the existing account decision is evaluated. The portfolio UI displays the annotation independently of its pre-existing actions and Why.

The account decision engines, simulator, entries, exits, sizing, stop policy, cash accounting, persistence, and 30-session framework are unchanged. Existing momentum exits and profit protection remain intact. Source eligibility, ranking formula, accepted-session inputs, actual holdings and recorded transactions are preserved. No new market-data acquisition is required. Intraday changes invalidate an old assessment rather than retaining a filled exit or obsolete stop explanation.

Only four application freeze entries change: `pages/index.js`, `lib/c1AccountService.js`, `lib/c1MomentumEvidence.js`, and `lib/c1MomentumEvidenceInput.js`. Existing guard implementations, build hooks, CI workflow, Vercel configuration and environment configuration are unchanged. The manifest records the explicit implementation and deployment authorizations; existing test presentation assertions are updated, while original rule/planner pins and economic comparisons remain enforced.

## Verification and workflow

The completed local build passed all 92 regression scripts and the trade simulation (93/93), release freeze, canonical integrity, and the Next.js production build. A new independent review confirmed the restricted scope and reran focused rank/input/classification/UI and pinned-production parity checks. Trading parity compares all three sleeves, complete ledger, opening orders, holdings, rank, stops, quantities, cash and recorded fills. Only the newly authorized informational annotation is excluded from the original complete-decision comparison, and its independence from brokerage cash is separately verified.

Release uses a temporary review branch and pull request into canonical main, with the existing Screener CI and Vercel Git integration. All required checks must pass before main is merged; production must serve that exact main commit. No direct deployment of uncommitted files, CI/configuration changes, migrations, storage writes, account refresh mutations, or research jobs are authorized by this release.

The owner subsequently directs release verification to use the existing application code, fixtures, regression tests and build, with no new production credentials, storage connections or account path requests. The presentation-only boundary must demonstrate unchanged holdings, transactions, account balances, reconciliation, sizing, signals and actions. Production private-account comparison was not performed and must not be claimed.

Production smoke checks cover `/api/version`, `/api/health`, the application document and served portfolio bundle, and deployment error logs. Verify that the new classifications/explanations are served. Original actions and persistence are independently validated by frozen source parity and fixtures, including real-handler and intraday tests. The final deployed commit, CI result and immutable deployment are recorded in the release report with the private-data verification limitation.

## Private-data verification limitation and release boundary

Scope, frozen source hashes, focused tests, canonical integrity and rollback verification passed. The existing production application/version/health responses are successful, with no error/fatal log groups reported in the inspected 30-minute baseline window.

Secure live-account verification was not completed. Bounded read-only metadata requests using the configured connection returned no production C1 account or synced-portfolio records. These results do not establish that the owner has no production account: the connection was not mapped conclusively to the canonical account store. No account/portfolio record was read, changed, reset or created. No provider acquisition or account refresh/save endpoint was invoked, and no Blob configuration was modified. All probing stopped after the owner's clarification.

Live holdings comparison is not essential to safely release this exact presentation change. The service adds `momentumEvidence` only after the existing account decision has been evaluated; neither that annotation nor the display helper is consumed by account persistence, reconciliation, signals, orders, sizing, stops, cash or execution. Those source files and storage schemas are unchanged; there is no migration or data mutation. Canonical rule/source pins and complete fixture decision/economic comparisons verify the boundary, excluding only the new annotation and separately checking its independence from cash. The actual production record contents, quantities, balances, transactions and live action list have not been inspected and are not certified by these checks.

The original explicit production-deployment approval remains applicable after these safeguards pass. Release uses the existing GitHub/Vercel workflow and stops if any source, regression, build or release safeguard fails. No additional infrastructure or production-data access is introduced.
