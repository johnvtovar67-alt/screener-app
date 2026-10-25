# Provider/error workstream — inspected d386ae579527a0a7e5d53feea4a9186e65c77e62

Owner authorization: finish remaining C1 provider/error boundaries and behavior-preserving consolidation; retain all success/cache/deadline/retry/fail-closed contracts. AGENTS.md read before editing. No network provider requests, top5, research, accounts, stores or cron invocations used.

## Implementations handed to root

| Obligation | Exact state | Evidence |
| --- | --- | --- |
| Safe issuer-local malformed event scope | locally verified | lib/eventRisk.js + tools/c1-current-event-provider-regression.cjs; 175 cases pass. Exact canonical raw requested NEWS issuer, valid in-window date, missing content only. Issuer UNVERIFIED; unrelated issuers may verify only after entire raw page and pagination/freshness/coverage/contradiction checks. Frozen original event fixture reproduces broad failure; 13 old/current successful/unaffected failure scenarios preserve full output/provider/cache call parity. 500/501 raw rows, terminal/repeat/overlap/tail/cap, invalid identity/date, expiry/stale, contradiction order, immediate recovery and retained provenance covered. |
| Shared storage error identity + portfolio failure redaction | locally verified | lib/blobErrors.js shares exact old account predicate through preserved c1AccountSave public wrapper and portfolio boundary. tools/portfolio-error-boundary-regression.cjs: frozen old handler leak reproduction; whole-source inversions; 48 predicate combinations; complete successful GET/PUT/header/storage output parity; creation guards/strong ETag/CAS, races, unconfirmed-commit/read recovery and no mutation retries. Public health503/HTTP500/log SDK details are sanitized; bounded failure-only request ID/stage/code/status log. |
| Existing downstream account/error contracts | locally verified | tools/c1-api-errors-regression.cjs, c1-sync-state-regression.cjs, c1-production-access-regression.cjs and portfolio-sync-regression.cjs pass. Current-event-opening review independently rerun by security agent. |

Root owns manifest, release documentation, complete suite/build, exact CI/preview and release. No production claim from these local tests. Independent security review of 175-case event change passed; portfolio review also passed independently.

Application ownership: lib/eventRisk.js, lib/blobErrors.js, lib/c1AccountSave.js, pages/api/portfolio-sync.js. Test ownership: current-event-provider regression; portfolio-error-boundary regression; fixtures event-risk-production-d386ae5.js and portfolio-sync-production-d386ae5.js; production-access and sync-state harness adaptations. No git mutations/push/merge/deploy by this workstream.

## Why narrower failures are justified only for NEWS content

The NEWS request names the requested issuers. A raw symbol exactly equal to a canonical member plus an independently valid in-window date preserves identity and coverage; only the article text is missing. It is never treated as an event fact, and its issuer cannot use purchase authority. Raw malformed rows still count in page lengths/fingerprints/overlap/contradiction checks. The failed body is evicted so a corrected refresh can recover. Contradictory content versions, even empty versus nonempty in either order, remain global failures.

EARNINGS has only symbol/date as required identity/coverage fields. A malformed date cannot prove that the provider honored the requested date window. Localizing that defect would assert complete date coverage without evidence. Invalid/unknown/unrequested/noncanonical NEWS symbols and invalid/out-of-window dates also retain global fail-closed handling. No grammar, window, cap, receipt, freshness, provider outage or purchase-verification requirement was relaxed.

## Provider policies intentionally remain distinct

The shared production price normalizer and provider symbol expression were already consolidated by previous releases. The remaining transports do not have identical cache, deadline or retry contracts:

| Caller | Deadline / retries | Cache/failure retention |
| --- | --- | --- |
| fetchFmpQuote | default8s, one attempt, no top5 diagnostic deadline | 60s fresh,24h retained,20s failure/force-refresh spacing, explicit unverified stale annotations |
| broad screen quotes |7s per attempt, bounded batch retry/backoff and8-name single fallback | shared batch cooldown20s or5min,60s fresh,24h stale; cache/inflight semantics differ from single quote |
| fundamentals |6.5s,2attempts with endpoint-specific permanent/error branches; bulk20s one attempt |3day fresh/30day stale persisted fundamentals, subscription/rate cooldowns and top5 cancellation |
| event feeds |min10s/remaining deadline,1attempt, required map deadline30s | endpoint TTL5m/15m/1h and stale2h/6h/24h,30s failure cooldown; stale retained evidence never authorizes current verification |
| account opening |min10s/remaining30s,1attempt, injected normal fetch | no quote cache/cooldown, independently repeated membership and adjusted anchors; event failure retains fail-closed empty-evidence fallback |

Combining these into one policy would violate preserved contracts; a highly parameterized wrapper would move endpoint policy without removing it. This workstream instead consolidated the genuinely identical storage precondition identity and repaired the concrete unsanitized boundary. It does not claim that all transport code is unified or that differing endpoint policies are dead duplication.
