# V11 production promotion

## Decision

The live fresh-capital rank uses V11 exactly because it is the strongest
observed blended policy:

| Development result | Return |
|---|---:|
| V11 momentum-dominant blend | 49.55% |
| V12 rank without the hard multi-horizon governor | 37.83% |
| V12 with the hard multi-horizon governor | 16.14% |
| SPY | 29.05% |
| QQQ | 38.12% |

V12's 85% momentum weighting did not improve the blend, even after removing
the hard governor. The production promotion therefore retains V11's audited
weights: 70% momentum and relative strength, 20% quality and stability, and 10%
entry condition.

## Entry treatment

The failed V12 multi-horizon governor is disabled. Production does not impose
V12's 16% distance-from-50-day cap, 20/60/120-session return caps, three-sigma
extension cap, mandatory aligned 50/200-day trend, or mandatory full timing
pass.

V11's narrower execution protections remain:

- block an entry when the latest point-in-time 3/5/10-session path is a chase;
- block a next-open price more than 3% above the source-session price;
- require a current quote, complete fundamentals, a cleared material-event
  check, and at least $10 million of trailing 20-session average dollar volume;
- retain approximately equal 8.25% targets, twelve positions, four-position
  sector caps, the 18% catastrophic invalidation, weekly top-twelve retention
  after a ten-session minimum hold, rank-deterioration exits, and the
  126-session maximum hold.

The broad Opportunities API loads the latest complete compiled point-in-time
session, freezes it into a separate durable production snapshot, and applies
current operational gates to the 36-name V11 entry queue. A partial research
refresh cannot mutate the production snapshot. If the snapshot is unavailable
or older than five market sessions, fresh capital fails closed rather than
falling back to a different strategy.

## Evidence label

This is a production candidate, not validated alpha. V11 was designed after
reviewing V10, reused the same dates, lost to its simple-momentum control and
the 25-seed random 95th percentile, and has no independent holdout. The source
dataset also uses a current cohort, omits delisted securities and historical
membership, lacks revision-safe fundamentals and complete point-in-time news,
and is too small for a strong placebo claim.

## Investor interface and existing holdings

The production identifiers, factor weights, source session, and gate details
remain available in API metadata for auditability, but they are not displayed
as explanatory copy in the investor interface. Opportunities show the action,
entry condition, sizing, priority, decision rationale, and trade plan in plain
language.

My Portfolio revalues every saved position and combines the current market
ranking with the position's role, weight, gain or loss, opening date, factor
concentration, technical/fundamental evidence, events, and replacement edge.
Swing holdings receive the ten-session rank-retention rule, 18% loss limit, and
126-session maximum hold. Core holdings and cash are intentionally exempt from
that Swing lifecycle while still receiving their applicable portfolio review.

## Strong Buy preservation

A selected candidate remains a `Strong Buy` only when its current expert
decision explicitly clears the stricter `strongBuyPass` standard and every
production operational gate also passes. A historical or upstream label alone
cannot create a Strong Buy. Strong Buys keep the same 8.25% target weight as
ordinary selected Buys; the designation removes the ordinary confirmation
delay without increasing position size or bypassing portfolio risk controls.
