# November 4 recorded-opening-sale recovery

## Demonstrated cause

PR352 (`7a0d19d`) fixed archive-first recovery and diagnostics but did not resolve November4 acceptance. The single owner-authorized manual job at 2026-11-05T04:01:20.402Z (deployment `dpl_9jbmZFR6LvC6PrasJ3K6wpR6JwAe`, request `hhw7t-1793851281005-b61fe9db72c1`) failed at 04:04:39.611Z with INDEX_UPDATE_FAILED / model-parity. No second manual run has been performed.

Authenticated dashboard access recovered the intact November3 predecessor and both exact November4 observation objects from the project's connected private Blob store. File sizes/hashes and before/after receipts are in [opening-sale-evidence.json](opening-sale-evidence.json). The originals are preserved privately, not committed. Current project-store association is verified; deployment-specific historical binding is not independently exposed. The intact inputs reproduce the logged ledger and paper-execution differences. No namespace listing, secret retrieval, account read or storage mutation was used.

The old generic recorded-sale proof recognizes only close-priced sales with unchanged open/high/low. In the actual input, three already-recorded November3 CRWD opening sales change counterfactual price from 244.05678 to 243.886984 because the verified opening bar changed 244.35 to 244.18. Shares/fees/identity remain identical. Counterfactual virtual-model cash changes by -21.733888; this is not brokerage cash. The 18 changed model leaves are those sale prices, derived cash/equity summaries, and the expected blocked paper-history annotation. No new fill, position or pending instruction changes. The first reported anchor ticker A was not the economic cause.

Independent replay additionally confirms complete risk/persistence/cooldown state: portfolio high-water 109047.48395599998 in both runs; pause-through counters base48/cooldown15 53/sector40 48 in both. Trade price/realized/round-trip P&L account for nine separate simulator-output leaves. Current orders alone are insufficient evidence of future-state parity.

## Repair and boundaries

- Extend the existing recorded-sale protocol to exact frozen-slippage opening prices, only with fully closed model sleeves, no new fills, independently repeated archived bars, identical complete operational state, and exact reconstruction of the whole revised model. No price tolerance, ticker/date/hash exception, policy change or bypass.
- `lib/c1FrozenSimulator.js` exposes a detached observation-only state snapshot after simulation; default results are byte-equivalent. All decision rules/options remain unchanged.
- `lib/c1ForwardModel.js` retains these snapshots transiently in a WeakMap keyed by the actual replay result. They are not serialized or accepted from persisted/untrusted input. Missing snapshots fail closed. The existing two replays are reused; no extra production replay is added.
- `lib/c1RecordedSaleRevision.js` checks positions, pending decisions, trade identities/reasons/holding and stop metadata, persistence maps, cooldowns, removal state, high-water and risk pause, sequence counters and leadership state. Only historical price/P&L is covered separately by the strict full-ledger reconstruction. The original recorded model is retained.
- `lib/c1ReviewedSessionRevision.js` keeps the existing recognized audit envelope and emits proof-v2 for opening sales. Closing proof-v1 and legacy compatibility remain.
- Existing archive recovery, immutable accepted inputs, conditional writes, current-session identity, strategy, holdings, actual fills, stops, cash, capacity and cron schedules are unchanged. Market acceptance does not certify account/brokerage parity or authorize purchases.

## Verification

Actual original-file reproduction on the defective release rejects; the repair accepts the same November3-to-November4 transition while preserving original inputs. The accepted local record hash is in the evidence JSON. This is an incident replay, not a strategy experiment or production write.

Synthetic real simulator/forward tests cover opening revisions across separate dates including Friday-to-Monday; immutable original history; archive confirmation required; changed fill/fee/quantity/position/order/current input rejection; unknown-field rejection; missing trusted replay evidence; corrupt prior hash; and account audit validation. A real flat-portfolio case with matching empty queues but changed high-water fails. Test-only negative control confirms that hiding only that risk state recreates unsafe acceptance. Observer/getter mutation cannot change model output or trusted snapshots.

Old-source negative control proves the former validator rejects the positive opening fixture. Old account code recognizes the unchanged audit envelope and rejects proof-v2 instead of skipping an unknown type. Existing closing proofs retain their original behavior.

Only the four application entries in the release-freeze manifest change. Explicit exact inverse source seams bind old/new complete Git blobs and preserve all earlier source/economic oracle hashes and assertions. Tests still execute the current runtime separately. No guard implementation, build hook, workflow, or job requirement is removed or weakened.

Independent review found the risk-state gap, verified its repair and added the real-output regression. Full build, dependency audit and all three browser CI jobs on the final head remain required; record their actual results in the PR before merge.

One exploratory derived file `after/model-original.json` was truncated; it is not release evidence. Original gzip inputs, validated before outputs and the final after-risk-state report support the result. Do not replace or alter original artifacts to repair an intermediate export.

## Rollback and production acceptance

The stored schema remains compatible except the typed opening proof. After first acceptance of proof-v2, older production readers deliberately reject it. Rolling back code alone may therefore pause account analysis; prefer a reviewed forward fix that retains proof validation. Never delete the audit or roll back/reset the market book or private records to make old code pass.

IMPLEMENTED: focused implementation and incident replay passed; final full release gates pending.
RELEASED: pending this repair; production remains7a0d19d at this checkpoint.
PRODUCTION VERIFIED: pending actual processing and accepted source-date evidence.
STABILITY WINDOW COMPLETE: pending,0/5 consecutive sessions. One manual job cannot satisfy this window.

The next ordinary C1 index opportunity remains November5 at06:00 America/Chicago. The existing single06:20 read-only follow-up is separate from processing. No new recurring monitoring or additional manual job is configured by this repair. A second immediate manual run needs the owner's explicit approval because the earlier approval covered one run only.
