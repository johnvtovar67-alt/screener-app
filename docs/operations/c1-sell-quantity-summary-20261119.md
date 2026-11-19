# Sell quantity clarity

The owner requested the additional previously noted fix after the stock-level
momentum release. This addresses the remaining display issue: a generic Sell
label did not explicitly distinguish a partial sale from a full exit or state
the remaining recorded holding. Baseline main/production is
e17ac1e0d27f12852e874523fcbce6789b5dfc80.

The existing recorded Sell quantity and recorded holding remain authoritative.
Presentation reports full or partial scope and the difference as shares that
would remain after the recommended sale fills. It never assumes a broker fill,
reclassifies an unknown quantity as zero, enlarges an exit, or invents a holding.
Partial-sale wording preserves C1 stop rules for the remaining shares without
claiming that a Schwab order exists.

Only `lib/c1PositionPresentation.js` and
`components/C1AccountOpportunitiesView.js` change. The selected signals,
aggregation/bounds, checked orders, recording, cash, cost basis, stops, cooldowns,
risk references, saved-account compatibility and schedules remain unchanged.
Update only these freeze entries. A separate exact two-file source inverse
preserves all previously published fixtures and hash pins; no production guard,
CI workflow or build hook is weakened.

Verify full/partial/unknown presentation through the existing authority path,
preserve the existing Sell quantities and input objects, run every required
exact-head release job, and verify deployed assets. The owner screen remains a
separate production observation; fixture results cannot establish brokerage
parity or investment performance.
