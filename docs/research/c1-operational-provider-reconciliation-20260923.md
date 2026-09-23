# C1 operational provider reconciliation — 2026-09-23

## Production incident

The scheduled C1 index refresh repeatedly stopped while FMP revised previously
published adjusted bars. Production runs at 20:00, 20:15 and 20:30 UTC saw 41,
44 and 28 mismatches respectively, while the set of unconfirmed rows changed
from 494 to 13 to 153. The prior implementation required every changed symbol
to repeat identically in a single confirmation set, so one still-moving symbol
prevented all independently stable revisions and the new session from advancing.

The same provider audit was then replayed through the private account as if the
revised historical bar had been known at the time. A different hypothetical plan
blocked the actual account even though its recorded fills, cash, cost basis and
stops had not changed. DELL surfaced that second, incorrect stop.

## Authorized repair

- Confirm each revised symbol independently across immutable FMP observations.
- Apply only the repeat-confirmed subset to the reconciliation proof.
- Keep each unconfirmed symbol on its previously accepted bar and defer it for a
  later scheduled observation instead of stopping the whole session.
- Continue to require exact full-model economic parity before advancing C1.
- Treat automatic provider correction as append-only evidence. It does not
  rewrite the private account's accepted history and does not rerun actual fills
  against a hypothetical revised past.
- Apply the same recorded-basis rule to older `c1-unexposed-price` audits that
  already proved exact model economics and preserved their original inputs.
  Their former model-only exposure check must not later block a real holding;
  malformed or economically adjusted audits still fail closed.
- Preserve recorded positions, shares, cash, cost basis, fills, stops, capital
  peaks and breaker dates without adjustment.
- Keep legacy, manually reviewed corrections on their existing strict private
  account replay/parity path.

This changes operational reconciliation only. It does not change rankings,
signals, entry or exit rules, sizing, risk limits, or transaction history.

## Verification

Regression coverage proves that independently confirmed symbols advance while a
conflicting symbol retains its original accepted price; missing, duplicate and
tampered evidence still rejects; any model economic difference still rejects;
automatic provider audits preserve recorded private-account basis; and the full
daily source lifecycle remains authenticated, immutable and retry-safe.
