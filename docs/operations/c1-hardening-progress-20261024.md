# C1 reliability cleanup — progress ledger

## October26 after-hours capacity copy — source checkpoint

Owner explicitly requests repair of MPC's false full-slot message after close.
Require a ready review before inferring legacy allocation occupancy; otherwise
retain the existing closed-session explanation and render it plainly. Two display
files only; no capacity/order/record change. Release gates pending; see
c1-afterhours-capacity-copy-20261026.md. PR337's final verified release record
supersedes its older pending status below:41d4062,147 checks/build/CI1008,
matching preview and exact production/canonical health/scheduler verified.
Normal October26 index update succeeded20:18:15UTC after repeat confirmation;
no code change or safeguard bypass was needed for that recovery.

## October26 owner-approved holding copy — source checkpoint

Three presentation-only changes after verified PR336/a483b02: Your position /
Purchase check heading, narrowly supported new-holding pending-review copy, and
single armed protection status. Focused actual-fill/desktop/mobile and negative
evidence cases pass; no classification, authority, order or record change. Full
suite/build/CI/preview/production pending; see c1-holding-wording-20261026.md.
PR336's exact final release record supersedes its older pending source status:
147/147/build/freeze/canonical, CI1006/run40333481534, exact preview and production
dpl_DfzBcY6VEP8bcwU9JrRCSVSp73Fx/a483b02 verified at09:02AMCDT. Owner subsequently
reported the fix worked and recorded two buys; this is owner-reported acceptance,
not independent brokerage reconciliation. Original external/design limits remain.

## October26 opening-revision incident repair — source checkpoint

Owner screenshot and explicit fix request reopen one bounded defect on PR335
production24eca58. Real execution fixture reproduces a false revision rejection:
the comparison dropped the actual plan's funding and capacity policies. Repair
retains those exact server-produced policy contracts; legacy defaults and all
price-driven/evidence rejection gates remain. Focused four-policy and actual
execution fixture passes, no account writes. Full suite/CI/preview/production
pending; see c1-opening-revision-policy-20261026.md and final release PR.
PR335's final merged release record supersedes older source-time pending states;
146 checks/27 synthetic browsers and24eca58 production verified. Larger design
conflicts, private acceptance and bundled advisory remain unchanged, not closed.

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

## Production verified: compatible Undici security patch

Fresh audit identifies0critical/5high package nodes. Patch only Undici6.28.1 to
6.29.1 within existing Blob2.8.0 range; preserve all other versions and auth/config
policy. Real installed SDK/MockAgent verifies identity GET/ETag, conditional PUT,
stale precondition error and non-overwriting creation without live network or
credentials. Focused PASS; full125-task/build and remote release gates pending.
Final local125/125/freeze/canonical/optimized build PASS; independent review PASS.
Fresh audit0critical/4high, Undici finding removed; exact CI/preview/production
verification PENDING. No claim all vulnerabilities are fixed.
Evidence: `docs/operations/c1-undici-security-20261024.md`.
PR328 verified October24 at11:57PM CDT: main/production
`840a14470544945146c8b2b6a15531966b803a44`, deployment
`dpl_12MaVPo9Sq58zTbxvg5VLFt3f9c2` READY, canonical version/health200,
all checks true and scheduler configured; initial scoped error scan clear.
Exact head `955c319ae3a6ccc9046d5e3ecd588a13b5a8519f` passed CI989
(40163136702); preview `dpl_6z8DErB3mFWPjNJrwbeuEXP2rtA6` READY/version/health200.
Exact local/reviewed/merged tree `8edeca8a34409fbbc33e98592a1f75845d806ce2`
matched. These release facts supersede source-time pending states above;
no active edits on that merged branch, safe handoff complete.
Residual bundled Zod/CLI-config/
OIDC/Blob advisory chain is NOT fixed; no audit-force downgrade/override or guard
exclusion. Research schema-only runtime isolation remains next cleanup candidate
after this security release, not another concurrent implementation.

## Production verified: isolate live compiler schema from research simulator

Based on verified production840a144. Actual compiled route import initializes
the49850-byte simulator factory solely for a primitive schema constant.
One import moves to a new pure runtime schema module; original research engine,
frozen simulators/generators, trading/UI/account/dependency/auth/config stay
unchanged. Complete synthetic compiler-object golden parity and independent
review PASS. Native baseline initialization1/zero observed network reproduced;
changed-build initialization0/zero observed network PASS; actual route import
finishes without handler invocation. Full126/126/freeze/canonical/optimized
build and independent focused review PASS. Exact CI/preview/production release
gates PENDING at this source checkpoint; final exact PR handoff supersedes it.
Evidence: `docs/operations/c1-runtime-schema-isolation-20261025.md`.
PR329 production verified October25 at1:13AM CDT: main7d19bfb263d4db815db09d18ee664e4bc51fc05c,
deploymentdpl_o3PraDdpfTMQRBbuEPfd3H6y2nKh READY/canonical version-health200,
all checks true and scheduler configured; initial scoped error scan clear.
CI991/run40167816601 SUCCESS exact head6490e10a0ae57c0e69d705e4448d90740e3c3bca;
previewdpl_4imQ5NfNbAt1bDSqmwRDhdhzrLAp READY/version-health200.
Exact reviewed/merged tree87504cd60b081de74e20a7108a4db8b90b69950e matched.
These facts supersede source-time pending status above. Owner phone screenshots
later verified visible two-card portfolio rendering; this does not establish
brokerage/economic parity or explain the earlier transient Load failed message.

## Active owner-approved production access restriction

Owner explicitly approved closing public production research access and new
account creation on October25. Branchharden/c1-production-access-20261025 starts
from7d19bfb. Shared production gate on53 research handlers uses existing server
authorization, preserves authorized worker/downstream guards and preview/offline
contracts. Absent production portfolio/C1 account creation is denied without
writes; existing account keys and reads/updates are unchanged. No namespace
enumeration, secret extraction, login platform, trading/UI/cron/account changes.
Focused all-route rejection/source-reversal and real-handler memory parity PASS.
Final127/127/freeze/canonical/optimized build PASS. Exact CI/preview/production
PENDING at this source checkpoint; not yet live.
This is a creation freeze, not proof every preexisting namespace belongs to owner.
Evidence: docs/operations/c1-production-access-20261025.md.
Root owns this access branch; no overlapping editor or duplicate release.

## Remaining audit work

| Work | State |
|---|---|
| API error types and accurate retry behavior | PR317 and unexpected account-screen propagation PR325 production verified; private-account parity not established |
| Read-only end-to-end operational acceptance canary | Screen/account instrumentation released; screen emission observed; private-account/browser/cross-boundary acceptance pending |
| Common provider/error adapters and canonical symbol boundary | Bounded error/symbol/retry repairs PR317/322/323/325/327 verified; broader transport redesign explicitly DEFERRED, not another automatic helper-release loop |
| Proven-unused research runtime isolation/retirement | PR324/329 production verified. Owner now approved blocking public production research HTTP access; current access implementation/focused tests passed, full release pending. Authorized workers/offline research retained |
| Single producer and immutable screen reads | PR326 production verified; proposed daily-only observation fails actual-function golden parity. Preserve intraday sequence or obtain explicit timing-policy decision; live CAS acceptance remains unverified |
| Broader duplicate/dead-code cleanup | PR318 verified; remaining126 lib modules have actual runtime/test/CLI consumers. Bounded additional whole-module deletion review closed: no safe candidate found |
| Account allowlisting/rate limits | Owner-approved new production account creation freeze implemented/focused tested, release pending. Stricter single-identity enrollment and rate-limit configuration are not claimed or silently implemented |
| Dependency advisories | Undici PR328 production verified; bundled Zod chain requires genuine compatible upstream remediation, not scanner-only override or Blob downgrade |

Finite disposition and read-only parallel-review evidence:
`docs/operations/c1-remaining-disposition-20261024.md`. No endless blanket
cleanup obligation or completed private acceptance is inferred from these rows.
Full original-audit obligation map, retained/deferred/blocked boundaries and the
finite stop rule: `docs/operations/c1-hardening-closeout-20261025.md`.

## Release gate

Every slice requires focused behavioral tests, the full regression suite,
freeze/integrity checks, an optimized build, matching GitHub CI and preview,
and exact production-commit verification before it is called live. Normal
crons remain unchanged. The checklist distinguishes source implementation from
production acceptance and must not label private account parity verified based
on a public health endpoint alone.
