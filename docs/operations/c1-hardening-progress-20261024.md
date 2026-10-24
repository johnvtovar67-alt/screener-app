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

## Active slice: account API error classification

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

Status: source implementation, focused API/browser/ledger/recording tests,
118/118 full regression tasks, release-freeze/integrity checks and optimized
Next.js build pass locally. GitHub CI, preview and production gates are pending. This live
session owns the branch until a commit here states a handoff or verified
production milestone. Scheduled continuation must not edit an active head or
start a duplicate release.

## Remaining audit work

| Work | State |
|---|---|
| API error types and accurate retry behavior | Locally verified; remote release pending |
| Read-only end-to-end operational acceptance canary | Pending |
| Common provider/error adapters and canonical symbol boundary | Pending |
| Proven-unused research runtime isolation/retirement | Pending |
| Single producer and immutable screen reads | Pending; characterization first |
| Broader duplicate/dead-code cleanup | Pending; prove unused before removal |
| Account allowlisting/rate limits | Requires a controlled identity/configuration decision; do not silently tighten policy |

## Release gate

Every slice requires focused behavioral tests, the full regression suite,
freeze/integrity checks, an optimized build, matching GitHub CI and preview,
and exact production-commit verification before it is called live. Normal
crons remain unchanged. The checklist distinguishes source implementation from
production acceptance and must not label private account parity verified based
on a public health endpoint alone.
