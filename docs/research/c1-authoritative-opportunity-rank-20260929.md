# C1 authoritative opportunity rank repair — September 29, 2026

## Owner-reported defect

NTRA was absent from the published C1 top six for consecutive completed
sessions, while Portfolio displayed a separate held-stock rank of 6 and reset
the two-session profit-protection streak to zero. That prevented the approved
next-open momentum exit from being surfaced.

## Cause

Inherited or outside-index holdings were compared with the published universe
in a private held-stock review. The account simulator treated that diagnostic
comparison as an eligible rank. It could therefore manufacture a second top
six that disagreed with the Opportunities and Watch lists shown to the owner.

## Repair

- Holding exit ranks now come only from each accepted session's authoritative
  ranked opportunity pool—the same pool used by Opportunities.
- A held symbol absent from that pool is outside the eligible range. Private
  held-stock review remains available for price and momentum evidence but can
  no longer assign an alternative eligible rank.
- Account decisions expose the replayed authoritative rank and eligible count,
  rather than the private diagnostic rank.
- Historical accepted sessions are replayed in order, so consecutive-session
  streaks are reconstructed without restarting the holding clock or changing
  ownership, basis, cash, fills, or the original purchase date.

## Frozen policy preserved

The September 26 production policy is unchanged: during sessions 5–29, exit at
the next open after three completed sessions outside the top nine; after a 12%
peak gain, exit at the next open after two completed sessions outside the top
six. This repair changes only which published rank is authoritative.

## Regression proof

The production momentum regression now includes an inherited profitable
holding omitted from the published opportunity list while a forged private
review calls it rank 1. Two completed omissions must still produce a
`profit-rank-deterioration` sale at the following open. The account regression
also requires the UI decision rank source to be `authoritative-opportunities`.

## Production replay follow-up

The first production refresh exposed an older queue-position order ID collision
in the recorded FCX-to-MPC replacement session. Correcting historical rank can
change the reconstructed hypothetical order occupying that numeric ID. Replay
now gives the immutable broker-filled replacement evidence precedence for that
completed session. This is an identity migration only: symbol, side, sleeve,
shares, execution price, fee, time, cash, and ownership continue to come from
the previously accepted record and cannot be rewritten.
