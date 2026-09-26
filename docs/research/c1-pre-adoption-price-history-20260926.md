# C1 pre-adoption price-history repair — 2026-09-26

## Owner direction

The owner asked C1 to retain the original holding clock and use the available price history from the actual purchase date, rather than beginning profit-peak measurement when the account was activated.

## Production behavior

- The original purchase date, average cost, shares, cash, fills, stops, and sleeve allocation remain unchanged.
- A disposable analysis copy of each adopted seed is enriched from dated adjusted bars between the original purchase date and C1 adoption.
- The highest verified high initializes the existing profit-protection high-water mark. Later completed sessions continue updating it normally.
- The account decision reports completed closes above, below, and at average cost from the available dated history, plus the recorded peak.
- Coverage is explicitly marked incomplete when not every expected market session is available. Missing history is never described as complete.
- No historical trade or historical sleeve ownership is inferred.

## Verification

The account regression injects a pre-adoption high above the +12% activation threshold and proves that profit protection arms while the original purchase date, ownership, and account economics remain unchanged.
