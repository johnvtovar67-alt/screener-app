# Price and share-volume unit contract

This research-only unit correction follows the bounded mechanical acquisition
probe. It changes no C1 score, threshold, history gate, sizing rule or production
file. It is required before claiming executable nominal-dollar economics.
No historical portfolio result has been selected or evaluated by this adapter.

The stage evidence establishes a distinction between three existing FMP views:

- Dividend-adjusted OHLC for source-compatible signal ratios.
- Split-only OHLC and corresponding share volume from the full endpoint.
- Nominal, as-traded OHLC and volume for whole-share execution/accounting.

The distinguishing sentinels show that current-vintage dividend-adjusted volume
matches full/split-adjusted volume, and future splits can multiply that volume.
Consequently, rebasing OHLC while retaining current-vintage share volume can
inflate historical liquidity. The private validation receipt contains the exact
series/vintage comparisons; these operational checks do not independently
validate the vendor or establish full-index/action coverage.

Let u be a prefix observation, t the decision date and v the acquisition
vintage. For each security, use two separate factors:

```
priceScale(t)       = nominalClose(t) / dividendAdjustedClose_v(t)
futureSplitFactor(t) = nominalClose(t) / splitOnlyClose_v(t)

signalOHLC_asof_t(u) = dividendAdjustedOHLC_v(u) * priceScale(t)
signalVolume_asof_t(u) = dividendAdjustedVolume_v(u) / futureSplitFactor(t)
```

Both factors are constant over that decision's causal prefix u <= t. Returns
retain the provider's dividend-adjusted ratios. Current quote prices use the
nominal decision-date close basis. Only splits after t are removed from share
volume; splits between u and t remain reflected in the earlier volume. Dividends
change the price adjustment, never the number of shares represented by volume.
No dividend price factor is applied to volume, and no rounding/fabricated split
is inferred from a price discontinuity.

`buildSignalDataset` accepts optional `splitOnlyBarsBySymbol`. With nominal
rebasing and all three views, it requires:

1. A split-only current bar for each observed current signal bar.
2. Positive finite split factors from the independently qualified price views.
3. Equality of signal and split-only provider volume for every used prefix bar.
4. Rebased current volume matching nominal current volume, within maximum
   0.00001 shares or 1e-10 relative numerical tolerance.
5. A separate explicit unit-qualification assertion before emitting
   `volumeUnitsVerified:true`.

Signal/full volume equality uses 0.00001-share numerical tolerance. These are
unit-consistency checks, not an economic tuning parameter. The appropriate
private qualification receipt must support the view meanings and factors for
the acquired universe; matching arithmetic alone is not independent proof.

If the full/split-only view is absent, price rebasing may still support labeled
signal diagnostics, but share volume remains current-vintage provider units.
`volumeUnitsVerified` remains false even if the caller supplies a true flag.
The paired economic engine rejects that incomplete contract. Missing/mismatched
views fail instead of generating corrected volumes from guesses.

The separate nominal output bars remain the execution/share ledger basis.
Verified splits and nominal cash dividends are applied exactly once through the
reviewed accounting manifest. Correctly adjusted signal ratios do not eliminate
those ledger obligations or permit a receivable to finance an earlier purchase.

Manufactured implementation checks compare otherwise identical vintages with
and without a future 15-for-1 split, while adding an independent cash-dividend
price adjustment. They establish invariant nominal price/ADV gates, return
factors and ranks; a second case preserves an already-effective split in prior
volume. Failure checks reject inconsistent view volumes and prevent a price-only
rebase from asserting volume validity. The 253-row source history gate, daily
compiler configuration and original momentum calculations remain unchanged.

These checks establish adapter behavior only. They are not a partial-universe
C1 performance test, complete acquisition approval or production-equivalent
historical replication.
