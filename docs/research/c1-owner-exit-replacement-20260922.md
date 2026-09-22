# C1 owner-exit replacement repair — 2026-09-22

## Defect

After the owner recorded a discretionary sale of an existing holding, holdings and cash updated correctly but no replacement purchase appeared. The current-session remaining-plan function could only filter and resize orders created before the sale. Because the discretionary exit was not part of that opening plan, the occupied sleeve had prevented a replacement order from being created.

## Repair

- Replay already-recorded current-session fills before evaluating the unchanged C1 opening queue.
- Give a recorded owner exit precedence over any modeled sale for the same holding.
- Expose only the same frozen queued candidates that pass the existing opening-price, cash, position, sector, factor, cooldown, and personal-symbol checks after the slot is actually vacant.
- Retain server-generated replacement-order evidence so a later fill replays through completed sessions without rewriting account history.
- Leave C1 ranking, target count, sizing, entry gates, exits, stops, and manual brokerage execution unchanged.

## Changed application files

- `lib/c1ActualFillReplay.js`
- `lib/c1AccountExecution.js`
- `lib/c1AccountSimulator.js` (generated through the declared account-only seam)
- `pages/api/c1-account.js`

Supporting changes are limited to the simulator generator, the focused intraday regression, this note, and affected release-freeze hashes.

## Verification

The focused regression proves that an owner-recorded sale can create a replacement order that was absent from the pre-sale plan, that discretionary purchases remain prohibited, and that the replacement purchase survives closing replay with exact holdings and cash. The normal production build continues to run the complete release suite.
