# C1 after-close completed-trade recovery — 2026-09-22

## Observed production defect

The owner sold FCX during the September 22 regular session, received the
server-generated MPC replacement, and bought 27 MPC shares during regular
hours. The FCX ticket persisted, but the MPC ticket did not. After the closing
bell, Account settings hid the trade-entry form because the completed-session
account analysis was waiting for its dated market-data update.

The saved FCX activity still contained the immutable same-day replacement plan,
but the API did not expose that plan when the account decision was temporarily
stale. As a result, a valid completed broker fill could not be recovered after
the close.

## Repair

- After the closing bell on the same market date, expose the already-saved
  intraday plan and its existing tickets.
- Permit a ticket only when its execution timestamp was within that plan's
  regular session and it matches an outstanding saved order.
- Continue using the existing server-side share, cash, order, timestamp,
  revision, duplicate-ID, and immutable-plan validation.
- Do not collect a fresh opening quote or create a new recommendation.
- Mask a connected portfolio sync key on screen while retaining the explicit
  Copy Key control.

No model policy, ranking, sizing, entry selection, exit rule, or historical
market input changed.

## Verification

The API regression now records an owner exit during the open session, advances
the clock beyond the closing bell while the account is awaiting its next dated
update, reloads the saved plan, and records a regular-session replacement fill.
It verifies both tickets persist. The client regression also requires the
connected sync-key field to be masked.
