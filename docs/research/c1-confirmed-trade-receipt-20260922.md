# C1 confirmed-trade receipt repair — 2026-09-22

## Owner instruction and observed defect

The owner reported that a completed 27-share MPC purchase was entered, confirmed,
and saved, but the account screen still appeared not to retain it. The account UI
previously treated the authoritative C1 write, portfolio cloud synchronization,
and the subsequent analysis refresh as one undifferentiated operation.

That made a secondary synchronization or refresh failure look like a failed trade
save and provided no durable on-screen receipt identifying the accepted ticket.
Retrying under that ambiguity risks duplicate entry.

## Repair

- Require the `record-intraday` response to contain the submitted ticket ID before
  the form clears.
- Return that confirmed ticket to the form and display its side, quantity, symbol,
  execution price, and resulting C1 cash.
- After the server confirms the trade, treat portfolio synchronization and analysis
  refresh failures as follow-up warnings. They can no longer turn an accepted trade
  into an apparent failed submission.
- Tell the owner explicitly not to re-enter a confirmed trade when a secondary step
  needs retrying.

No strategy, ranking, sizing, opening gate, exit rule, account fill validation, or
historical record behavior changed.

## Focused verification

- The intraday regression requires the explicit saved receipt.
- The account-client regression proves that a confirmed server ticket is returned
  even when the later portfolio synchronization fails, and that the UI warning says
  not to enter the trade again.
