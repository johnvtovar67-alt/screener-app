# Version 8 alpha thesis contract

Version 8 is a structural response to the failed Version 7 audit. V7 returned
-1.63%, produced -3.37% exposure-matched alpha versus SPY, averaged 21.85%
exposure and routed 58 of 59 closed positions through one undifferentiated stop
reason. Those results reject the V7 implementation; they are not tuning inputs
for the V8 audit windows.

## Corrected research architecture

1. **The active thesis selects independently.** V8 ranks the full historically
   evaluated evidence set. A legacy production Buy label is not an entry
   prerequisite, and the legacy score has zero weight in active-policy ranking.
   The completed V7 audit remains the external comparison baseline.
2. **Fundamental quality is cross-sectional.** Profitability, free-cash-flow
   margin, return on equity, growth, leverage and dilution are ranked globally
   and within sector. Momentum, value and stability remain separate so a high
   aggregate score cannot conceal a weak required factor.
3. **Leadership must be early but real.** Entries require a price above a rising
   50/200-session structure, verified 20/60/120-session relative strength, at
   least $10 million of trailing average daily dollar volume and a non-defensive
   SPY regime. A 3-10 session chase still fails, but V8 no longer rejects every
   stock merely for exceeding SPY by four percentage points over 20 sessions.
4. **Exposure is intentional.** Active policies can hold 14 positions at a
   7.5% target, subject to an 8.5% name cap, 30% sector cap, one issuer per
   economic company, volatility scaling and a 0.70% equity risk budget per
   initial stop. This tests a portfolio capable of participating in an equity
   advance rather than mistaking persistent cash for alpha.
5. **Stops reflect the investment horizon.** Initial stops are bounded to
   8-14%. Structural stops remain active on the entry day, but cannot ratchet
   for 20 sessions or before the position earns one initial risk unit. Profit
   trails begin only after a 30% gain and stay 15% below the high watermark.
   Initial, ratcheted and profit-trailing exits are reported separately.
6. **The active lifecycle is independent.** A V8 holding exits on its own stop,
   a sustained relative/trend break, a 126-session failed thesis, or its profit
   trail. Production portfolio vetoes and re-underwriting rules do not leak into
   the active research candidates.

## Predeclared active candidates

| Candidate | Economic question |
|---|---|
| Persistent quality leadership | Do above-average quality and medium-term leadership that persist for two sessions outperform after controlled entry timing? |
| Controlled acceleration leadership | Does one fully confirmed acceleration session capture leaders earlier without accepting a short-term chase? |
| Quality re-acceleration, value aware | Can high-quality, lower-volatility companies re-accelerating near the 50-session trend produce better downside-adjusted alpha when valuation is not in the bottom third? |

The rejected V7 live policy is not recomputed inside V8. Its completed audit is
used only as an external baseline, so it cannot consume replay capacity or
influence selection among the three active theses.

## Selection and evidence standard

- Every policy uses rolling 378-session training, 126-session validation and
  126-session chronologically unseen audit windows.
- Each fold chooses among the three active policies using training and
  validation only. Its audit window cannot choose its own policy.
- The primary result is exposure-matched alpha versus SPY. Simple SPY and QQQ
  returns, and exposure-matched attribution against both, are reported
  separately so cash drag is never mislabeled as stock-selection alpha.
- Promising provisional evidence requires positive unseen return, positive
  SPY exposure-matched alpha, positive expectancy, profit factor above one,
  positive alpha in most folds, at least 30 closed round trips and at least 55%
  average exposure.
- No outcome can authorize capital from this provisional current-cohort replay.
  A strict audit still needs historical universe membership, delistings,
  revision-safe fundamentals and point-in-time material-news history.
