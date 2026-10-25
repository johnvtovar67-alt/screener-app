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

## Production verified: isolate production-disabled research engine loading

Branch `harden/c1-research-runtime-isolation-20261025`, based on `e0aef6f`.
The preview-alpha-lab route's production404 guard cannot prevent a static engine
import from loading/failing first. Defer only that import after the existing
guard. Keep the route, preview response/finalizer contracts, research cron/oracles,
all normal crons and economic/account behavior. Source parity and synthetic
failure checks pass; full release verification pending.
Evidence: `docs/operations/c1-preview-research-isolation-20261024.md`.
PR #324 verified October24 at8:43 PM CDT: main/production
`daff5c07c58230a1167d5e55cb25a05f0c95a8d1`, deployment
`dpl_6djG56NqpG7517mkAqWKzvSpZf4z` READY with canonical version/health200,
all configuration checks true and scheduler configured; production route still
returns exact404. Initial scoped error scan clear. Local122/122/build PASS;
exact head `cb37527eb547a56ce6b4d0454e7f0fd2dcad3d9f` passed CI #981 (40151172463);
preview `dpl_t7NnkevsugVJm32dULcvzYK18gmL` READY/version/health200. Exact reviewed/
merged tree `49396928d6d0b7a723e031333bf6f01b8452576a` matched. Native compiled
route loads zero research chunks versus476,413 bytes before; engine remains
packaged for preview, all53 research routes remain, no general speedup claimed.

## Production verified: preserve expected emptiness, propagate unexpected screen failures

Branch `harden/c1-account-screen-failure-20261025`, based on `daff5c0`.
Actual service fault injection proves every builder error became an empty screen.
Preserve exact fallback for the frozen0/1/2-of3 insufficient-candidate cases;
unexpected errors reach the existing sanitized API500/retained-client boundary.
Only service catch changes, no classifier/trading/UI/account/guard changes.
Source reversal, old/current full/empty account parity, real-service/API memory
fault/recovery, post-save failure/no-retry and existing client checks pass.
Evidence: `docs/operations/c1-account-screen-failure-20261024.md`.
PR #325 verified October24 at9:37 PM CDT: main/production
`21d5380ad14c5520ed8df1cc7db12b92e79788e8`, deployment
`dpl_DKjftHGG5nDVxH6bmn2nri3iwwzZ` READY with canonical version/health200,
all configuration checks true and scheduler configured; initial scoped error
scan clear. Local122/122/build PASS; exact head
`54b9f18787e73d1a8de532e0f177e968d4b09a83` passed CI #983 (40154600072);
preview `dpl_6xBzXuiMxfwDHWzAxrxHZRiePwVd` READY/version/health200. Exact local/
reviewed/merged tree `87ea34af65358fee9dd967524552854caf6d5878` matched.
Synthetic failure-path proof, not a verified live incident/account acceptance.

## Production verified: conditional performance-ledger writes across instances

Branch `harden/c1-performance-cas-20261025`, based on `21d5380`.
Two actual store instances with synthetic storage reproduce two successful
responses while one acknowledged observation is lost. Bind both writes to
origin body-read ETags; creation never overwrites. Keep existing deadline/local
lock, merge/retention/signal/account rules. Stale/uncertain writes fail without
automatic retry. Focused race, legacy uncontended parity, metadata, recovery
and deadline checks pass. PR326 verified October24 at10:30PM CDT:
main/production `8b7b1c54e3cc3ce5ef195422bd287445c65e4f5e`, deployment
`dpl_BdkGjWh2hcMk3YLoyLat34e1ukwr` READY, canonical version/health200,
all configuration checks true and scheduler configured. Initial scoped error
scan clear. Local123/123/build PASS; exact head
`9f362b43edcf846e81e5824ae84fe7a18d88d7ba` passed CI985 (40157858911);
preview `dpl_2fNNAuRrf5cYi6i5MASG7AbaqFdQ` READY/version/health200.
Exact reviewed/merged tree `e2382dd257e951c54f62ff26fcd2193b86614c6f` matched.
Live conditional-write/account/browser acceptance remains NOT_VERIFIED.
Evidence: `docs/operations/c1-performance-conditional-writes-20261024.md`.
No active edits remain on the merged branch; safe handoff complete.

## Production verified: honor provider non-retryable responses

Branch `harden/c1-fmp-client-errors-20261025`, based on `8b7b1c5`.
Actual offline provider transport reproduces duplicate permanent-client-error
requests. A local flag stops only400/401/404/405/410/422;408/425/other client
responses and unfollowed3xx keep legacy retry behavior after independent review.
Success/fallback/cache outputs, other retry/cooldown/deadline and bulk behavior
retain exact fixture parity. No trading/UI/account/auth/config changes.
PR327 verified October24 at11:36PM CDT: main/production
`62d5c0ce90583efa2f1ab7f60ed20b40c43eec2f`, deployment
`dpl_6isWtbLcUAja9XA3m8nt8opU8gBz` READY, canonical version/health200,
all checks true and scheduler configured; initial scoped error scan clear.
Local124/124/build PASS; exact head `1a9ddd60ae4846377ba550a4d163a4652a06bb1c`
passed CI987 (40161843248); preview `dpl_DD6kixeC5bpsMq96oNYRd9P1rGPG`
READY/version/health200. Exact reviewed/merged tree
`94da1f506f1daa4a5e78b206bb83d5f15203f321` matched.
Evidence: `docs/operations/c1-fmp-client-error-retry-20261024.md`.
No active edits on merged branch; safe handoff complete. Synthetic proof only;
private-account/browser/CAS acceptance remains unverified.

## Active slice: compatible Undici security patch

Fresh audit identifies0critical/5high package nodes. Patch only Undici6.28.1 to
6.29.1 within existing Blob2.8.0 range; preserve all other versions and auth/config
policy. Real installed SDK/MockAgent verifies identity GET/ETag, conditional PUT,
stale precondition error and non-overwriting creation without live network or
credentials. Focused PASS; full125-task/build and remote release gates pending.
Final local125/125/freeze/canonical/optimized build PASS; independent review PASS.
Fresh audit0critical/4high, Undici finding removed; exact CI/preview/production
verification PENDING. No claim all vulnerabilities are fixed.
Evidence: `docs/operations/c1-undici-security-20261024.md`.
Root owns security branch until verified handoff. Residual bundled Zod/CLI-config/
OIDC/Blob advisory chain is NOT fixed; no audit-force downgrade/override or guard
exclusion. Research schema-only runtime isolation remains next cleanup candidate
after this security release, not another concurrent implementation.

## Remaining audit work

| Work | State |
|---|---|
| API error types and accurate retry behavior | PR317 and unexpected account-screen propagation PR325 production verified; private-account parity not established |
| Read-only end-to-end operational acceptance canary | Screen/account instrumentation released; screen emission observed; private-account/browser/cross-boundary acceptance pending |
| Common provider/error adapters and canonical symbol boundary | Safe screen errors PR322 and shared provider spelling PR323 production verified; broader adapters pending |
| Proven-unused research runtime isolation/retirement | PR324 verified; schema-only simulator dependency is next concrete isolation candidate. HTTP endpoint retirement requires operational evidence/specific owner decision |
| Single producer and immutable screen reads | PR326 production verified; proposed daily-only observation fails actual-function golden parity. Preserve intraday sequence or obtain explicit timing-policy decision; live CAS acceptance remains unverified |
| Broader duplicate/dead-code cleanup | PR318 verified; remaining126 lib modules have actual runtime/test/CLI consumers. Bounded additional whole-module deletion review closed: no safe candidate found |
| Account allowlisting/rate limits | Requires a controlled identity/configuration decision; do not silently tighten policy |
| Dependency advisories | Undici compatible patch in verification; bundled Zod chain requires genuine compatible upstream remediation, not scanner-only override or Blob downgrade |

Finite disposition and read-only parallel-review evidence:
`docs/operations/c1-remaining-disposition-20261024.md`. No endless blanket
cleanup obligation or completed private acceptance is inferred from these rows.

## Release gate

Every slice requires focused behavioral tests, the full regression suite,
freeze/integrity checks, an optimized build, matching GitHub CI and preview,
and exact production-commit verification before it is called live. Normal
crons remain unchanged. The checklist distinguishes source implementation from
production acceptance and must not label private account parity verified based
on a public health endpoint alone.
