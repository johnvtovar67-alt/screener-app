# Compatible HTTP dependency security patch — October 24, 2026

Baseline main/production `62d5c0ce90583efa2f1ab7f60ed20b40c43eec2f` (PR327),
deployment `dpl_6isWtbLcUAja9XA3m8nt8opU8gBz` READY, exact canonical version,
health/configuration/scheduler verified. AGENTS/audit/ledger read; no overlapping
active release. Root owns `harden/c1-dependency-security-20261025`; parallel
review is read-only. No production provider/storage/account mutation tests.

## Finding and exact scope

Fresh npm production audit reports0critical and5high package nodes. Undici6.28.1
is affected by two reported advisories patched in6.29.1:

- https://github.com/advisories/GHSA-xjj6-f33q-929c
- https://github.com/advisories/GHSA-4qv8-2p9j-2685
- Maintainer release: https://github.com/nodejs/undici/releases/tag/v6.29.1

These are dependency/advisory findings, not evidence of live exploitation or
that C1 currently connects to malicious peers. Advance only Undici6.28.1 to
6.29.1 inside Blob2.8.0's existing `^6.23.0` range. Only its version, registry
URL and integrity entry in package-lock change. package.json, all other locked
packages, authentication/config policy, Blob SDK, OIDC and CLI-config stay fixed.
All frozen application hashes, trading rules, four-Swing cap, UI, guards/CI/hooks,
normal crons and actual account/cash/history/fills remain unchanged.

An initial npm audit-fix proposal also refreshed OIDC/CLI-config without solving
the remaining Zod advisory. Those incidental changes were removed before any
publication. Do not blindly run audit fix --force or downgrade Blob to2.4.0.

## Actual SDK compatibility, all transport mocked

`tools/c1-storage-sdk-compatibility-regression.cjs` reverses only the three lock
fields and verifies exact released lock blob
`e957c3f6f17f259210e409c01d5c806e9ba8d967`. A fresh child with no inherited
environment credentials uses an explicit fake token, actual installed Blob2.8.0
and patched Undici MockAgent with real network access disabled. No account key,
OIDC acquisition, CLI credential lookup or live storage request is needed.

The SDK test verifies:

- origin identity GET, cache0 query, complete body and strong ETag;
- conditional PUT transmits the matching version and explicit overwrite flag;
- stale412 remains BlobPreconditionFailedError without a second mocked attempt;
- first creation transmits no matching-version header and overwritefalse;
- all expected mock requests are consumed, with no allowed external network.

The initial mock used an incorrect API hostname and correctly timed out under
disabled networking. It was corrected to the installed SDK's actual default
https://vercel.com/api/blob endpoint; no guard/assertion was weakened.
This tests compatibility, not private live account/CAS acceptance or every
upstream HTTP behavior. Full125-task/build, exact CI/preview/production gates
are required before calling this patch live.

Final source/local checkpoint:125/125 regressions, freeze/canonical guards and
standard optimized build PASS. Independent read-only review PASS. The regression
also checks actual resolved SDK/HTTP versions, not the lock alone. Fresh audit
now reports0critical/4high nodes and no Undici finding, down from0critical/5high;
all four remaining nodes are the explicitly unresolved Zod chain below.
Exact-head CI, matching preview and production gates remain PENDING.

## Residual risk: Zod is not repaired by this patch

The remaining advisory is https://github.com/advisories/GHSA-mrhx-c7xc-m3w5,
reported through four package nodes: Zod -> CLI-config -> OIDC -> Blob.
CLI-config0.2.6 pins Zod4.1.11 and its actual101320-byte distributed module
contains inline validation code; its only literal require dependencies are os,
path and fs, not zod. Overriding node_modules/zod alone does not replace that
bundled validation code, so an artificially cleaner audit would not establish
remediation. Public latest CLI-config0.3.3 still declares Zod4.1.11; latest
OIDC4.0.3 changes major version and also references that chain.

Do not force an SDK downgrade, edit vendor code, change authentication policy or
override Zod just to suppress scanner output. Compatible upstream remediation
and actual bundled-code/SDK compatibility review remain required. No live
exploitability conclusion or clean-security-bill is made. Critical advisory CI
gate stays unchanged and active; do not lower severity or add an exclusion.
