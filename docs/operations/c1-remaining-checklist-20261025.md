# C1 remaining hardening — durable checklist

Owner instruction: October 25, 2026 uploaded finite remaining-work request explicitly
authorizes behavior-preserving implementation, tests, normal PRs, merges and production
deployments. Preserve C1 policy, UI, accounts, recorded economics, frozen oracles and
normal crons. The release PR body is the single live checklist for this continuation; this committed document is its pre-release source checkpoint. The PR body records later CI/preview and production states without a documentation-only redeployment. Allowed states:
pending, implementing, locally verified, CI/preview verified, production verified,
blocked. A blocked item is unfinished.

## Baseline and release gate

GitHub main, local HEAD and Vercel canonical production independently matched
`d386ae579527a0a7e5d53feea4a9186e65c77e62`, tree
`c30e40094721e58020d286c965e74095f367d48b`, October 25 at 20:06 UTC.
Production `dpl_7ZYm6runBum8PkFKtWThtcxryWHA` READY. Version/health HTTP200,
all health checks true, scheduler configured. Scoped runtime errors for top5,
account, performance and health: none in preceding hour. This proves deployment
and configuration identity, not private-account or brokerage acceptance.

[PR330](https://github.com/johnvtovar67-alt/screener-app/pull/330) is the durable
prior release evidence: reviewed head `6f3d18878afb0a81c49462c5fa57f7ff570b3868`,
CI run `40213232683` SUCCESS, matching preview, merged tree equality and 127/127
local checks/build. Its explicitly approved single public research denial probe
already returned404; it was not repeated. Open PRs were inspected; none is a
new overlapping infrastructure release. Historical research/UI/policy proposals
were left untouched. No persistent Goal tool is available in this environment.

Every new release requires focused proof, full suite, freeze/canonical checks,
standard optimized build, exact-head CI, matching preview, reviewed/merged tree
equality, exact production version/health/scheduler and scoped error inspection.
Release evidence is recorded in the final PR body; source-time states are not
silently promoted to production verified.

## Original audit obligations and finite remaining work

| Obligation | State | Evidence / concrete remaining boundary |
|---|---|---|
| P0.1 truthful event failure, invalid-cache recovery; invariants2–4 | production verified | Prior baseline/PR330 lineage; incomplete evidence stays fail-closed, invalid HTTP200 bodies evicted. |
| P0.1 issuer-local malformed-event scope; invariants1,5 | locally verified |175-case real pipeline regression and exact old/new success/call-budget parity. Narrow news-content quarantine only with exact requested identity, valid date and complete raw coverage. Unknown identities/dates/global calendars remain fail-closed; further narrowing requires provider evidence proving issuer/date coverage. |
| P0.2 semantic read-only canary and observation | production verified | PR319/320/321 validators/passive diagnostics retained. No top5 or cron/research canary invoked. |
| P0.2 normal signed-in screen/account/browser join; invariants6–8 | blocked | No user browser-session tool or existing authenticated account session is exposed to this executor. Vercel connection authenticates deployment access, not the app's private account. No sync-key extraction or new session/login attempted. Requires existing permitted signed-in session and normal Reload flow. |
| Failure retention/recovery without automatic mutation retry | locally verified | Permanent real-client synthetic transport/body failure matrix added for GET, refresh-inputs POST and cash-update POST; full prior view retained, explicit read recovery, no replayed mutation. Live device failure cause remains unknown. |
| Brokerage/economic reconciliation; live persistence acceptance | blocked | No connected brokerage-source tool or actual source records available. Requires permitted linked source holdings/cash/transactions and normal account session. Screenshots/public health/synthetic fixtures cannot establish it. |
| P0.3 cross-instance stale performance overwrite | production verified | PR326 conditional-write repair; actual live-store/private parity remains separate blocked row above. |
| P0.3 immutable reads/coordinated producer; P1 one producer/many readers; Phase1.2–3 | blocked | Exact request-driven event/timestamp invariant fails existing15-minute cron: entry100→105, MFE10%→0%, return5%→0%, transitions3→1; cached reads after31s update marks; actual Strong Buy expiry membership differs. See producer evidence below. Requires authoritative full observation stream or explicit new trigger/public-interface/timing policy; no daily-only replacement. |
| P0.4 new namespace creation freeze | production verified | PR330 absent production creation denied, existing account contracts retained. |
| P0.4 stricter owner identity | blocked | Requires controlled owner identity enrollment, allowed hash binding and recovery/rollback policy. No namespace enumeration, guessed identity or credential extraction. |
| P0.4 ingress rate limits | blocked | No verified normal signed-in traffic baseline or owner-approved grouping/threshold policy. Exact project active WAF read returned404 Seawall Config not found. Need route/method buckets, per-account/IP grouping, acceptable reload/multi-tab bursts, window/burst and recovery policy, preserving normal crons. |
| P0.5 public production research execution | production verified | PR330 all53 route guards and one already-used live404 sample. Preserve authorized workers, offline tools and frozen artifacts. No repeated live runner checks. |
| P0.6 critical dependency/advisory gate | production verified | Next15.5.28/security baseline and PR328 Undici6.29.1 retained; guard/CI unchanged. Clean npm ci repaired stale workspace installation, without lock changes. |
| P0.6 bundled Zod remediation | blocked | Fresh audit0 critical/4 high chain nodes; official latest CLI-config0.3.3 still bundles Zod4.1.11 despite installed overrides. Latest Blob2.8.2/OIDC4.0.3 do not fix bundled validation. Requires corrected official bundle selected through compatible SDK chain; no currently published breaking choice actually fixes it. |
| P0.7 typed account HTTP failures/correlation; invariant9 | production verified | PR317/322/325/327 classification/redaction/retry repairs preserved; opening empty-event fallback already fails closed and preserves exits. |
| P0.8 four-Swing ceiling/profit wording; invariant10 | production verified | Prior baseline authorized four-Swing repair and multi-unheld regression; no new policy change. |
| P1 common provider boundary | locally verified | Endpoint-specific cache/retry/deadline contracts characterized; preserve those differences. Exact shared Blob precondition identity + sanitized portfolio error/health boundary and bounded malformed-content work; endpoint transport policies stay distinct. |
| P1 shared production price normalizer/runtime-research separation | production verified | Original extraction plus PR324/329; frozen research remains retained. |
| P1 single server-produced Opportunities contract | blocked | Existing server manualRecommendations already supplies quantities/expiry. Final rendering also uses later independent top5 rows, position quotes and browser-retained selection absent from that response. Same server response legitimately yields different Buy/Add/stop displays. Needs a same-evidence join/trigger contract preserving exact sequencing; an unused duplicate view does not satisfy it. See maintainability evidence. |
| P2 UI component extraction | locally verified | Separate exact synchronous JSX/scoped styles from existing authority/effect parent;136 complete baseline rendered/effect/storage/timer/advancing-clock comparisons and source reversal. |
| P1/P2 dead-code retirement/runtime classification | production verified | Prior bounded whole-module review: PR318 removed only two proven-unused modules;126 legacy modules have runtime/test/CLI consumers. No public-interface retirement inferred from missing callers. |
| P2 simulator phase extraction/source-shape debt | locally verified | Extract active simulator accounting phase under exact source inversion/full output goldens; frozen engines/comparison pins unchanged. |
| Thesis/research proposals and experiments | production verified | Prior four challengers rejected; no new/rerun experiment, tuning or timing-policy change. This is closure of excluded work, not new alpha certification. |
| Normal scheduled production jobs | production verified | Baseline exact production scheduler configured; cron sources/config unchanged. Configuration does not prove every private artifact/future invocation. |

## Concrete blocker evidence

Producer characterization uses real `applyPerformanceObservation` and
`recentStrongBuySymbols`, entirely synthetic/no-network. Exact replay of every
event/timestamp preserves full output. Scheduled sampling cannot recover missing
request events or verification-pass-specific acquisition; a GET-enqueued producer
still writes, and a new POST changes the public GET trigger contract. Daily and
15-minute substitutions both fail. These are concrete failed invariants, not an
unimplemented platform preference.

Security investigation inspected fresh registry versions and the official
CLI-config0.3.3 tarball SHA1 `74f2d63bbaf2e7525889cf091366854392954e30`.
Its distributed entrypoint SHA256
`506e7e10abd141655d019d0b8d3962bb23a6c52eabe44041638f48f4a01285b7`
embeds version4.1.11 and does not import installed Zod. Advisory
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
fixes at4.6.6. No suppression, forced SDK downgrade, speculative patch or
configuration change was made. A compatible genuine upstream fix remains required.

Detailed supporting evidence: [producer invariant](c1-producer-parity-boundary-20261025.md), [security/access boundary](c1-security-boundary-20261025.md), [maintainability characterization](c1-maintainability-20261025.md).

New portfolio error-boundary proof reproduces/redacts raw storage error responses/logs, preserves full GET/PUT/health-success/ETag/CAS outcomes against immutable production source, and verifies commit-before-error followed by read recovery without automatic mutation retry. Shared account save predicate reexport preserves the public interface and exact prior save/rebase source.

Final local gates at publication are recorded in the release PR. Initial full suite130/132 exposed two UI harnesses that assumed inline/default-only rendering. Their loaders/source composition were corrected without dropping assertions or changing immutable expected hashes; final standard build must rerun all132. The isolated real Chromium → actual API → memory-store workflow passed with liveWrites0. This is synthetic economic parity evidence, not the unavailable signed-in acceptance.
