# C1 event-level paper mapping — September 11, 2026

The forward paper service now maps the frozen simulator's individual fill events rather than repricing a daily net change at a closing or opening mark. Opening sales, opening risk exits, purchases and intraday stops retain their model execution phases and fill prices. Slippage already present in the model fill is not charged twice. Shared-symbol quantities are aggregated before each whole-share rounding step, and every cash debit must be fundable.

Each paper account stores its complete model-linked event history. On advancement and same-session retries, balances are reconstructed from that history; cached cash and shares cannot override it. Missing, duplicate, altered or out-of-order events are rejected. Older execution-price-basis accounts are preserved and require explicit reconciliation, not automatic adoption.

Verification: 80 synthetic sessions, 27 independent frozen-book checkpoints, and all seven paper event transitions processed without blocking, including the stop transition rejected by the prior opening-only mapper. A separate multi-book same-symbol test verifies that opening purchases precede a stop in another book, exact stop price, whole-share rounding and resulting cash. Tests also cover altered cash, missing history, event identity, unknown execution reasons and incompatible account bases. The tests run in the required release gate.

This is retrospective model execution semantics, not observed intraday timestamps, real brokerage fills, or a future order plan. Whole-share tracking differences from weighted virtual books remain possible. Unsupported corporate-action/zero-price events fail closed; actual fills, capital movements and ownership of existing holdings are not inferred. The simulator and investment options are unchanged.

C1 remains suspended. Production recommendation equivalence, valid point-in-time inputs and baseline, brokerage reconciliation and the unchanged promotion gates remain required. Synthetic sessions are not prospective validation or alpha evidence.
