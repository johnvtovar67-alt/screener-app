# Remaining C1 security and access controls — October 25, 2026

Read-only review based on checked-out `d386ae579527a0a7e5d53feea4a9186e65c77e62`.
No package, lockfile, application, credential, account, firewall or environment
configuration was changed. The root release owner independently establishes
current remote main/production identity. This file is investigation evidence,
not a production acceptance claim.

## Bundled Zod remediation: blocked by upstream

Fresh registry reads and `npm audit --omit=dev --json` succeeded through the
inherited session proxy. Audit evidence is `work/security/npm-audit.json`.
The current locked graph still reports **0 critical, 4 high package nodes**:
`@vercel/blob -> @vercel/oidc -> @vercel/cli-config -> zod`.
The actual advisory is
https://github.com/advisories/GHSA-mrhx-c7xc-m3w5,
“Zod can exhaust memory while validating oversized constrained collections,”
range `<4.6.6`. Four nodes are one dependency-chain finding, not four independent
demonstrated application exploits. No live exploitability claim is made.

Registry observations:

| Package | Current lock | Latest published relevant version | Relevant dependency |
|---|---|---|---|
| `@vercel/blob` | 2.8.0 | 2.8.2 | `@vercel/oidc: ^3.6.1` |
| `@vercel/oidc` | 3.8.7 | latest 3.x: 3.8.10 | `@vercel/cli-config: 0.3.1` |
| `@vercel/oidc` | 3.8.7 | latest overall: 4.0.3 | `@vercel/cli-config: 0.3.3` |
| `@vercel/cli-config` | 0.2.6 | 0.3.3 | `zod: 4.1.11` |
| `zod` | 4.1.11 | 4.6.7 | advisory fixed at 4.6.6 |

Downloaded official CLI-config 0.3.3 tarball:
`https://registry.npmjs.org/@vercel/cli-config/-/cli-config-0.3.3.tgz`.
Registry SHA1 `74f2d63bbaf2e7525889cf091366854392954e30`.

Actual distributed entrypoints were inspected without loading credentials:

| CLI-config | Entry bytes | SHA256 | Bundled version literals |
|---|---:|---|---|
| installed 0.2.6 | 101320 | `1c03f9f9df7e523051744eb85f35c276b29315cbbb8bde79dc0509be6caf381d` | `major:4, minor:1, patch:11` |
| published 0.3.3 | 101517 | `506e7e10abd141655d019d0b8d3962bb23a6c52eabe44041638f48f4a01285b7` | `major:4, minor:1, patch:11` |

Both contain the inline Zod collection validator. All literal `require` targets
are `os`, `path`, `fs`; neither imports installed `zod` at runtime. A package
override cannot change that code. Even moving to the latest OIDC major leaves
the old bundled validator. Blob 2.8.2 therefore is not a Zod remediation and
does not justify an incidental dependency release.

npm proposes Blob **2.4.0** with `isSemVerMajor: true`. This is the explicitly
prohibited forced SDK downgrade and is not a verified compatible fix for
current conditional-write/OIDC contracts. No downgrade, override, vendor patch,
scanner exclusion or advisory-gate change was applied.

Unblock requirement: an official CLI-config release must ship the corrected
validator (not merely change a manifest), and a compatible OIDC/Blob dependency
path must select it. Then characterize actual Blob conditional GET/PUT, strong
identity ETags, stale precondition handling, creation and OIDC acquisition
contracts before the full release gates. No currently published breaking
upgrade was found that actually repairs this bundled advisory; asking the
owner to approve a speculative major upgrade would not solve the finding.

## Owner identity restriction: blocked by controlled enrollment decision

Source evidence:

- `pages/api/portfolio-sync.js:8-10,43,62` validates bearer syntax, hashes it to
  a namespace, and rejects absent production namespace creation.
- `pages/api/c1-account.js:95-105` uses the same bearer-to-hash namespace model
  and rejects absent production adoption.
- `lib/researchMutationAuth.js` uses constant-time comparison with the existing
  server secret for production research access. No research call was made.

The namespace creation freeze does not establish that every existing namespace
belongs to the owner. Existing namespace possession remains the access model.
No namespace listing, account enumeration, secret lookup, key extraction,
credential guessing, private record read or new auth policy was attempted.

Concrete controlled decision required: enroll the intended existing account
identity through an owner-controlled procedure, bind it to an environment-held
allowed identity/hash, decide handling of any other existing identities and
provide recovery/rollback access before enforcing denial. The agent must not
derive the identity from Blob records or ask the owner to disclose a sync key.
Only after verified enrollment can enforcement be tested without risking the
existing account. This control remains **blocked**, not complete.

## Ingress rate limits: blocked by policy and traffic baseline decisions

Repository inspection found provider-side cooldowns and quote refresh throttles,
but no shared ingress limiter protecting expensive screen acquisition or private
account/portfolio mutations. Provider cooldowns are not ingress rate limits;
process-local counters would not coordinate serverless instances.

Read-only Vercel `get_firewall_config(configVersion='active')` at exact supplied
project/team returned HTTP404 `Seawall Config not found`, request ID
`iad1:sfo1::t4xt7-1792958825532-78a7379edba2`. This does not prove the absence
of automatic platform DDoS protections and does not establish a configured
application-specific rate-limit policy. No alternative team/account was probed.

Concrete policy choices remain: which route/method buckets to limit (at least
expensive `GET /api/top5`, `PUT /api/portfolio-sync` and `POST /api/c1-account`),
per-account versus per-IP grouping, acceptable normal reload/multi-tab bursts,
window/burst thresholds, and recovery behavior. IP-only limits can affect the
owner on shared mobile/NAT networks. Arbitrary bearer-header values are not an
owner identity. Server cron paths must remain outside user request limits and
existing authorization must be preserved. No raw secrets should become WAF
rule values or logs.

An existing permitted signed-in flow and legitimate traffic profile are needed
before selecting thresholds that preserve normal UI request behavior. If WAF
is selected, follow its measured log-first rollout and required user publication;
do not silently publish authentication/configuration policy. The firewall skill
was read only for assessment: `c4/vercel-firewall`, instruction “Stage drafts;
let the user publish.” No draft was created because configuration choices are
explicitly withheld in this request. This control remains **blocked**.

## Local verification environment observation

The preexisting workspace `node_modules/undici` is **6.28.1** while the committed
lock requires **6.29.1**. Existing
`tools/c1-storage-sdk-compatibility-regression.cjs` correctly rejects that actual
version mismatch. Root was notified to run a clean `npm ci` before release
tests; no assertion was changed and no dependency installation was performed
by this reviewer. The first default-sandbox attempt also could not spawn its
child (EPERM); rerunning with supported network permission allowed execution
and exposed the actual stale-install mismatch. Neither result is evidence of
a defect in the current locked production dependency graph.

Fresh registry/audit commands require the supported exec network permission
and a writable workspace cache (`--cache work/security/npm-cache`); inherited
proxy/CA settings remain in place. No direct route or proxy bypass was used.
