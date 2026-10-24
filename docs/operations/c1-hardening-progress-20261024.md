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

## Active slice: read-only captured-response canary

Branch `harden/c1-readonly-canary-20261024`, starting from production `1c423dc`.
Add offline tooling and a synthetic composition regression, not a live route,
provider call, account mutation, UI or trading-policy change. It checks captured
screen/account/portfolio responses through the real C1 helpers and reports only
aggregate counts/reason codes. Exact limits and release status:
`docs/operations/c1-readonly-canary-20261024.md`. This run owns the branch until
a verified PR handoff; do not edit concurrently.

## Remaining audit work

| Work | State |
|---|---|
| API error types and accurate retry behavior | Production verified through PR #317; private-account parity not established |
| Read-only end-to-end operational acceptance canary | Captured-response diagnostic in verification; live integration and browser parity pending |
| Common provider/error adapters and canonical symbol boundary | Pending |
| Proven-unused research runtime isolation/retirement | Pending |
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
