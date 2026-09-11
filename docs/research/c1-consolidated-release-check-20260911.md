# C1 consolidated release check — September 11, 2026

## Decision

Trading release remains incomplete. This change repairs a known diagnostic ledger failure and connects the same model-status document to Opportunities and Portfolio. It does not connect verified brokerage orders or establish that the provisional live universe inherits either historical index-universe result. Do not describe this deployment as C1 reactivation.

The user waived the 60-new-session waiting requirement in favor of historical evaluation. There is no new elapsed-time requirement in this change. Historical results, control seeds, rules, and authority gates were not retuned or relabeled.

## Implemented

- Preserve the September 9 original book byte-for-byte. Only the specifically identified September 10 15:59:42.924Z invalid baseline may create one separate diagnostic book. A different clock error, changed input, changed lineage, or concurrent write cannot silently reset it. The original record hash is retained in the diagnostic lineage.
- A newly initialized diagnostic book can prepare the next opening's queue from a completed close when that opening has not passed. It has zero fills and zero validation sessions at initialization. Existing books keep their original simulation window. No opening price is claimed retroactively.
- Return one shared decision document, with input hash, source session and model revision, in the broad-screen and forward-accounting APIs. Both pages display it. The holdings comparison uses the same per-symbol interpretation. All sleeve holdings and queued names are retained; closing weights are not rebalance targets.
- Stored legacy activation flags are forcibly removed at the production snapshot boundary. The legacy top-three aggregate recommender cannot recover full-size authority by changing persisted flags. The independent three-name, 1%-each, two-session pilot is unchanged.
- An empty recommendation list no longer claims that the strategy chose to hold cash when its model is unavailable.

## Verification

`npm run verify` and `npm run build` passed locally. Targeted regressions also cover the exact original clock failure, immutable recovery lineage, changed inputs, duplicate refreshes, completed-close queue initialization, next-opening equivalence, and shared page interpretation. The existing 80-session synthetic service replay still matches all three frozen sleeves, including gaps and stops. These checks are software evidence, not new investment evidence.

Preview and production acceptance are recorded separately after deployment. A successful build alone is not that acceptance.

## Remaining evidence and integration work

1. **Live universe:** the provisional broad compiler differs from both tested historical index universes. A dated production universe and matching input compiler must be bound to the frozen engine before historical results can support its signals.
2. **Sector provenance:** the historical Nasdaq compiler copies sector from a profile without a decision-date lookup. C1 uses 50%/50%/40% sector caps. The return-blind synthetic dependency audit proves sector labels affect the frozen strategy's fills. Historical membership flags and price-only ranking do not certify sector history. This finding does not quantify a bias or change the saved arithmetic; historical sector assignments still need verification.
3. **Historical interpretation:** saved results support positive modeled after-cost return, expectancy and benchmark outperformance. The completed fixed-candidate controls are post-selection diagnostics, not family-wise correction. Original fold evidence must retain its original boundaries and interpretation.
4. **Actual account execution:** conditional model queues and hypothetical event mappings are not reconciled brokerage orders. Provider-verified execution inputs and actual account history/partial fills still need to be bound to a complete recommendation path.

These are specific release conditions. Another successful component test, a fresh quote, or an environment-variable change cannot satisfy them.
