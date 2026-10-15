# Offline paired-account adapter

This is an implementation artifact, not an empirical portfolio result. Its tests
use expressly manufactured prices and signals. No historical portfolio run has
been executed with a partial opportunity universe.

`engine.cjs` imports the unchanged account simulator and dependencies through the
existing offline source loader. Four application files are hash-pinned. Exact
in-memory insertion assertions fail if the expected source changes; no generated
application file or release-freeze entry is edited.

```js
const {runPair, verifyNoOp} = require('./engine.cjs');
verifyNoOp({dataset});
const result = runPair({dataset, executionCostsBps:12,
  interventionDelaySessions:1, enableAccounting:true});
```

The input is the signal adapter's baseline plus 63 session dataset. Historical
economic execution fails closed unless these private-manifest assertions are
present and true: `executionPricesVerified`, `volumeUnitsVerified`,
`fullOpportunityUniverseVerified`, `researchAccountingCoverageComplete` and
`researchMembershipActionsComplete`. It also requires the private complete-input
manifest SHA-256 in `researchInputCoverageHash`, matching `researchCoverageFrom`
and `researchCoverageThrough`, all 64 frozen dates, 490–520 distinct accepted
universe symbols per date, and explicit `researchHConsecutiveSymbols` lists.
These assertions refer to the owner-approved approximate reconstruction; they
are not a certification of original C1 inputs or exact historical FMP sectors.
The signal adapter defaults unproved assertions to false. The engine cannot
independently certify the contents of an external evidence manifest.

`researchMembershipActions` carries the documented effective-dated actions.
Every declared removal must have a corresponding `universe-removal` action in
that session's native `corporateActions`, preserving its opening priority.
An allocation/history quarantine is not itself an index removal.

The manufactured test contract is `researchDataContract:manufactured-fixture-v1`.
There is no command-line bypass for historical data. A full accepted universe and
verified execution/action inputs remain prerequisites for any empirical run.

The first causal H event is selected from Champion's chronological closing state,
with age ≥5, source `return5 ≤−7`, six consecutive validated source-factor closes,
and no native sale already queued. Ties use sleeve order base/cooldown15/sector40
then symbol. B is run uninterrupted from the identical seed. The program asserts
identical A/B state through the decision close; no fork reseeding occurs.
Exactly one original position is targeted. A missing original lot, missing open
or opening stop censors/preempts the event without substitution. Ordinary buys
see the occupied slot and unreleased cash; the extra sale occurs afterward and
before range stops. Subsequent normal planning may choose the same security.

The combined account scales model dollars/shares by 1/2/1; per-share prices,
stops and bases do not scale. Combined drawdown is recalculated from combined
equity. Gross two-sided turnover means buys plus sells divided by mean equity.
Embedded side-specific slippage is measured from each actual modeled fill and
is not deducted twice. The 25/50 bps sensitivities rerun affordability and account
paths; no post-hoc trade adjustment is used. Terminal positions remain marked.

The private result contains sleeve curves, complete ordered native ranked pools,
candidate queues, pending orders, rejections, holdings, stops, rank-exit streaks,
cash, risk state and action/intervention ledgers. Cash is fungible: the first
subsequent purchase is descriptive and does not explain the entire A/B delta.
These details may contain licensed or reconstructable numerical inputs and
must remain in the established subscriber-private storage.

## Explicit accounting adapter

Ordinary source removals/delisting outcomes stay in `corporateActions`.
Verified splits/dividends use separate `researchAccountingActions` rows:

```js
{id, source, verified:true, type:'split', symbol, effectiveDate, ratio}
{id, source, verified:true, type:'cash-dividend', symbol, effectiveDate,
 amountPerShare, paymentDate, shareBasis:'ex-date-post-split'}
```

Amounts are nominal dollars per ex-date share, after any same-date split.
Splits run before dividends independent of identifier ordering. Existing shares,
bases, stops and pending absolute-price/share units are adjusted consistently.
Unsupported fractional entitlements fail rather than inventing cash-in-lieu.
Dividends create entitlements for prior-close holdings before any opening trade;
ex-date buyers do not receive them. Receivables count toward economic equity and
risk but cannot fund purchases until the supplied payment date. Weekend payments
become available at the next processed session. Entitlements survive later sales.
Native split/dividend rows without an explicit verified accounting mapping fail.
The adapter never infers an action, payout, payment date or source permission.

No-op verification disables the extra exit, accounting, strict held-quote guard
and research allocation mask, then compares the complete returned source output
in all three sleeves. The denominator stress separately proves that allocation
exclusions remain in the ranked pool while both research arms cannot buy them.
Actual research runs enforce held-quote availability, daily cash/share
conservation, no borrowing and one combined intervention. Metadata and licensed
data acquisition remain outside this module.

Run the bounded manufactured-data checks with:

```sh
node research/c1-rotation-execution-20261015/test_engine.cjs
```
