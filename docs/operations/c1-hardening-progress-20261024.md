# C1 reliability cleanup — progress ledger

Owner instruction: continue the authorized infrastructure hardening and
behavior-preserving cleanup without stopping at status updates. C1's investment
thesis, trading rules, existing four-Swing cap, UI and accounting facts remain
unchanged. All four thesis challengers were rejected; no more thesis work is
part of this program.

## Verified starting point

Main and canonical production both identify
`a4c2373f15c12bc8a735d7d7f29930914a07602a` on October 24, 2026.
Production deployment `dpl_8SCvFCPmLJpKVh7cB9Vtn2YdHeoP` is READY.
Event-cache recovery/truthful copy, security dependency updates/CI gate,
shared price-bar normalization, four-Swing cap and armed-profit copy are live.

## Production verified: account API error classification

Branch: `harden/c1-api-errors-20261024`.

Reproduction: the real `/api/c1-account` catch labels every thrown error as
HTTP 409. The browser treats non-cash-update POST 409 responses as save
conflicts and issues a GET reload, hiding input/provider/storage failures.

The repair labels dependency outages 503, explicitly recognized invalid input
422, genuine ETag/revision conflicts 409, and unknown/integrity failures 500.
Success payloads, original guard predicates, canonical save/rebase logic and
account records remain unchanged. Arbitrary provider/SDK messages are hidden;
bounded reason/stage/request-id logs make failures traceable. No automatic
write retry is added. Failed writes are unconfirmed: the user must reload
before repeating a mutation, since a transport failure cannot prove whether a
remote write committed.

Released through PR #317. Local 118/118 regressions, freeze/integrity and build
passed. Reviewed head `80f9df0ead7b244e74facaf717037107da8f076b` passed CI #966
(run 40132150462) and preview `dpl_vjcLJAxoU3jzgupV6guAJ1MACEEt` was READY.
Production commit `cbd7e7a1b536acebf75ef465d7d86d2bbeed76f3` deployed READY
as `dpl_3Lm8DboH7hKa4ZQjkEcjD5fG33CZ`. Canonical version/health verified
commit, environment and scheduler configuration. Initial scoped error scan was
clear. Private-account parity remains NOT_VERIFIED; a preview authorization
wall was not bypassed. Public health does not prove live account acceptance.

## Production verified: proven-unused module retirement

Branch `harden/c1-unused-modules-20261024`, based on production `cbd7e7a`.
Remove only two unused April prototype modules (308 lines total), with all
surviving application files unchanged. Evidence and release checkpoint:
`docs/operations/c1-unused-modules-20261024.md`. PR #318 merged and production
verified at `1c423dc1de23a141e804169d78927a032f5e7d32`, deployment
`dpl_cYqswxJSDJboeNQ5h4fhneW9vMEe` READY, canonical version/health HTTP200,
all configuration checks true and scheduler configured. CI #968
(40135026856) passed and exact preview `dpl_92ngT6pVQDo6aZUWeHEpaYW2cV8g`
was READY. Initial scoped error/fatal scan was clear. No runtime speedup or
private-account parity is claimed.

## Production verified: read-only captured-response canary

Branch `harden/c1-readonly-canary-20261024`, starting from production `1c423dc`.
Add offline tooling and a synthetic composition regression, not a live route,
provider call, account mutation, UI or trading-policy change. It checks captured
screen/account/portfolio responses through the real C1 helpers and reports only
aggregate counts/reason codes. Exact limits and release status:
`docs/operations/c1-readonly-canary-20261024.md`. PR #319 merged at production
`3b6341c2bef960d72616053284b08d7fc6588a47`, deployment
`dpl_HYT9T2gGjmEKGXzqyHFW35qrtmgY` READY with canonical alias/version/health
HTTP200, all configuration checks true and scheduler configured. Initial
scoped error/fatal scan was clear. CI #970 (40136356595) SUCCESS; exact preview
`dpl_8YA1ufGPWnkyF4YKahBxiF7aKkQs` READY and version/health HTTP200.
119/119 local tasks and build passed. Captured-response tooling only; no live
private-account/browser acceptance was established.

## Production verified: passive account/opening diagnostics

Branch `harden/c1-live-account-diagnostics-20261024`, based on production `3b6341c`.
Observe already-computed successful analysis and opening-review responses;
emit one bounded, redacted `C1_ACCOUNT_OPERATIONAL` record. No new requests,
storage writes, payload changes, UI or trading decisions. Only account-boundary
state is assessed; screen composition and private-account parity remain
NOT_VERIFIED. Source/local and remote release evidence:
`docs/operations/c1-passive-account-diagnostics-20261024.md`. PR #320 released as
`cb2d2dfdb0ad6f97053417c70bbeb03ed8fc7c53`, deployment
`dpl_DbukF8ZrRJXarMAKVyrMFCQGcPpQ` READY with canonical alias/version/health,
all configuration checks true and scheduler configured. Initial scoped error
scan was clear. CI #972 (40140265361) SUCCESS and exact preview
`dpl_H6oVe1r6Hs1g4x8cfjoTE6oWAyA7` READY with matching version/health200.
120/120 local tasks/build passed. Initial account-operational log query found
no records; actual authenticated request emission and account/browser parity
remain unverified. Missing logs do not prove an account failure.

## Production verified: passive screen-response diagnostics

Branch `harden/c1-screen-diagnostics-20261024`, based on production `cb2d2df`.
Extend the existing request-diagnostics module, not a new framework. Summarize
already-computed screen feed statuses/counts and replace the raw exception log
with redacted failure codes. Preserve response identity and all I/O/decision
behavior. Evidence/checkpoint: `docs/operations/c1-passive-screen-diagnostics-20261024.md`.
PR #321 released as production `32500001899d59b78107c071fc21f4bd3b1162e0`,
deployment `dpl_46c6nn8g7xfcoiinDFfyvr8btTxQ` READY with canonical
alias/version/health200, all configuration checks true and scheduler configured.
Initial scoped error/fatal scan was clear. Local121/121/build passed; CI #974
(40143080374) SUCCESS; exact preview `dpl_8XKf9gVjacr1upxnyvtpYetMLJsQ`
READY with version/health200. Two normal production GET records emitted the
new screen diagnostic at 23:39:36–37 UTC. This verifies the observer, not C1
private-account selection, account opening or browser parity.

## Production verified: public screen-error detail redaction

Branch `harden/c1-screen-error-details-20261024`, based on production `3250000`.
The real catch-response seam copied an arbitrary synthetic provider marker into
HTTP503 detail with zero network or writes. Reuse the existing response module
and its controlled fallback wording; accept only a timeout boolean, never a raw
error. Preserve success responses, status/retryability/timeouts and all economic
behavior. Evidence: `docs/operations/c1-screen-public-error-redaction-20261024.md`.
PR #322 released as `cddfe3e70a3276f81b4bf1c2b4245f5c8105df59`, deployment
`dpl_J2wTt8pXQNnHbn9n8x1H7ie2Mm4S` READY, canonical version/health200,
all configuration checks true and scheduler configured. Initial scoped error
scan was clear. Exact reviewed/merged tree `13544b0d639d35cabec23d3e90edebf4511acab8`
matched. Local121/121/build passed; CI #976 (40144012838) SUCCESS; exact preview
`dpl_8XxWMvQvHCNRu4tGumAumdaydBqf` READY with matching version/health200.
No live failing-provider request or private-account/browser parity is claimed.

## Production verified: shared provider-symbol spelling

Branch `harden/c1-symbol-boundary-20261025`, based on production `cddfe3e`.
Two independently maintained identical provider spelling expressions are moved
to a tiny pure shared helper. Only quotes/fundamentals migrate; distinct account
alias and other normalization contracts remain untouched. Differential input,
exact source reversal and actual offline request/cache characterization retain
legacy first-replacement/coercion/rejection behavior. No economic/I/O change.
Evidence: `docs/operations/c1-fmp-symbol-boundary-20261024.md`.
PR #323 verified October24 at7:48 PM CDT: main/production
`e0aef6f16c2be4a2ef062cff614527aab148e4fd`, deployment
`dpl_BBD2qTmMyKbqLkAnaMW2fsMGumog` READY with canonical version/health200,
all configuration checks true and scheduler configured. Initial scoped error
scan clear. Local121/121/build passed; exact final head `177a7671b942dd696ca724956326269052dca6ca`
passed CI #979 (40147590281); matching preview
`dpl_9k1oSid7MxKpdETdmG72iRK74o8c` READY/version/health200. Reviewed/merged
tree `53a9cc6a75a2cb0178c025141dbfc8340934276d` identical. Initial explicit-import
deadline fixture failure was repaired by loading the real helper, not weakening
any assertion. This removes duplication, not a demonstrated runtime speedup.

## Active slice: isolate production-disabled research engine loading

Branch `harden/c1-research-runtime-isolation-20261025`, based on `e0aef6f`.
The preview-alpha-lab route's production404 guard cannot prevent a static engine
import from loading/failing first. Defer only that import after the existing
guard. Keep the route, preview response/finalizer contracts, research cron/oracles,
all normal crons and economic/account behavior. Source parity and synthetic
failure checks pass; full release verification pending.
Evidence: `docs/operations/c1-preview-research-isolation-20261024.md`.
This run owns the branch until exact release/handoff; no concurrent edits.

## Remaining audit work

| Work | State |
|---|---|
| API error types and accurate retry behavior | Production verified through PR #317; private-account parity not established |
| Read-only end-to-end operational acceptance canary | Screen/account instrumentation released; screen emission observed; private-account/browser/cross-boundary acceptance pending |
| Common provider/error adapters and canonical symbol boundary | Safe screen errors PR322 and shared provider spelling PR323 production verified; broader adapters pending |
| Proven-unused research runtime isolation/retirement | One already-production-disabled engine import under verification; broader retirement pending, no endpoint assumed unused |
| Single producer and immutable screen reads | Pending; characterization first |
| Broader duplicate/dead-code cleanup | Two unused modules retired in production via PR #318; broader cleanup pending |
| Account allowlisting/rate limits | Requires a controlled identity/configuration decision; do not silently tighten policy |

## Release gate

Every slice requires focused behavioral tests, the full regression suite,
freeze/integrity checks, an optimized build, matching GitHub CI and preview,
and exact production-commit verification before it is called live. Normal
crons remain unchanged. The checklist distinguishes source implementation from
production acceptance and must not label private account parity verified based
on a public health endpoint alone.
