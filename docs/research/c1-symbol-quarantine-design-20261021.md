# C1 symbol-level discrepancy quarantine — implementation contract

Status: owner-approved design, not implemented or deployable. Parallel workstream; no bypass of existing reconciliation or trading guards.

## Required behavior
- Differences of $0.05 or less qualify only for the existing narrow adjusted-close tolerance; missing, nonpositive, split, corporate-action, identity or inconsistent OHLCV evidence still fail verification.
- Above $0.05: quarantine the symbol from **new Buy/Strong Buy eligibility** for the current completed session until independently confirmed and parity-checked. Do not block unaffected verified symbols *if* full-universe ranking and accounting can be proved valid.
- Preserve historical membership, prior accepted price bars, full-universe scoring denominator, ranks, Watch context, held positions, momentum exit counters and ledger. Never filter symbols from the model input or silently renormalize the universe.
- Held positions remain visible and subject to independent risk checks; never authorize a buy or unverified sell/stop from a quarantined price.
- Recheck each quarantined symbol on the next trading session with new dated evidence. Release only after verification; retain the original quarantine receipt and history append-only. No assumption that one day fixes a discrepancy.
- If any quarantined row prevents valid full-universe scoring, benchmark checks, sector/rank consistency, or model/account economic parity, do not publish a new ranking. Show the last verified, explicitly dated, non-executable screen.

## Engineering work in parallel with live reconciliation
1. Persist an immutable symbol-level quarantine receipt (symbol, date, source, original/revised adjusted close, observation hashes, reason, state, next-session recheck).
2. Enforce completeness and unchanged cross-sectional scoring *before* masking entry eligibility. Keep original rank history and exit counters.
3. Add an Opportunities eligibility mask; show a dated quarantine reason and preserve portfolio risk visibility.
4. Maintain independent account/order verification and append-only economic parity. Never create synthetic fills, rebases, or trades.
5. Test one material revision, 504 revised OHLCV bars/287 close differences, incomplete feed, splits, held symbols, repeated daily discrepancies, next-day reentry, rank stability, stale fallback, mobile rendering and no unauthorized orders.
6. Gate release on CI, actual archive evidence, account parity, preview smoke test, and successful production cron/mobile validation.

This workstream does not replace or delay independent archived-observation confirmation or the verified stale-ratings fallback. NO-GO until both paths are validated.
