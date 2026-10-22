# MRNA and CRWD purchase-block disposition — October 22, 2026

The owner supplied actual production `purchaseDiagnostics` after PR #301 and explicitly requested a final focused disposition plus the smallest supported correction in one isolated PR. The reviewed baseline is main/production commit `61e0f081be89894fed9d955b9c5a87170cad5759`. No merge or deployment is authorized.

## MRNA: keep the volatility restriction

Production reports accepted 60-session volatility of 373.29%, an existing maximum of 100%, native purchase-queue exclusion and an opening quote consequently not requested.

A read-only FMP `stable/historical-price-eod/dividend-adjusted` request for MRNA through October 21 returned the 61 adjusted closes from July 28 through October 21, ending at $245.81. Recomputing the existing formula — sample standard deviation of the 60 simple close-to-close returns, multiplied by `sqrt(252) * 100` — gives **373.286599754867%**, matching production to its displayed precision. The code is `historicalSignalEvaluator.annualizedVolatility`; no threshold or calculation change is justified.

The dominant August 19 return is $62.96 to $174.38, **+176.9695%**, followed by $133.32 on August 20, **−23.5463%**. FMP's unadjusted full-price endpoint returns the same closes, with August 19 OHLC of $116.02/$176.66/$114.46/$174.38 and volume 199,252,328. Its MRNA split endpoint returns no splits. The contemporaneous August 20 news results describe the 177% cancer-vaccine rally and following selloff, including [Benzinga](https://www.benzinga.com/trading-ideas/movers/26/08/61339720/moderna-mrna-177-percent-record-cancer-vaccine-selloff-25-percent-worst-day), [Forbes](https://www.forbes.com/sites/tylerroush/2026/08/20/moderna-stock-plunges-25-wiping-out-18-billion-after-historic-cancer-vaccine-breakthrough/) and [24/7 Wall Street](https://247wallst.com/investing/2026/08/20/moderna-plunges-20-one-day-after-cancer-vaccine-breakthrough-sent-shares-up-177/). These are newly read provider observations, not replacements for immutable accepted history.

The provider history reproduces the accepted number and supplies no demonstrable price-adjustment or corporate-action error. Preserve the purchase block. The software defect is the user-facing quote-verification explanation for a quote intentionally omitted because the stock failed native eligibility.

## CRWD: keep the missing-verification restriction

Production reports volatility 72.65%, a fresh observed opening quote, `MATERIAL_EVENT_BLOCK`, `MANUAL`, `blockNewCapital=true`, `eventRiskVerified=false` and no current coverage. This is evidence of an unverified event check, not proof of a current adverse company event.

The source live-input compilation lacks event coverage, so the historical evaluator creates fail-closed Manual evidence. Additional-capacity review carries that source event state into the current quote review; `c1StockClassification` rejects Manual or blocked status. Previously obtained provider evidence shows the July 2 4-for-1 split already adjusted (July 1 $772.76 becomes $193.19, factor 0.25; July 2 factor 1). The October unsolicited mini-tender is not a conventional acquisition or split. Neither establishes the cause of the current block, and neither justifies another adjustment or clearing it.

The absent current server verification is a genuine evidence gap. Earlier external responses cannot manufacture verification for this production request. Preserve the event gate; correct only the wording that implies a confirmed unresolved company event. Current trusted verification must pass the existing policy before this restriction can clear.

## Position limit: an observed rejection, not an independent counterfactual

The reported `POSITION_LIMIT` is a real rejection in the reviewed plan. The native new-position gate is `positions.size >= config.maxPositions` **and no additional-capacity permission**. The existing additional-capacity exception depends on the same event qualification. The intraday outstanding-order gate also honors current captured additional-capacity evidence.

Therefore the supplied deduplicated code does not establish that CRWD would still fail position capacity after valid event verification. The diagnostic omits sleeve/phase and cannot establish every sleeve's disposition. A verified event result could allow the existing exception; remaining selection, price, concentration, funding and execution checks would still apply. No production counterfactual purchase is asserted.

## Supported correction and boundaries

This PR changes only the two blocked-stock explanations. The existing `purchaseDiagnostics` response is passed to the existing formatter; no new diagnostic, field, collector, provider call, replay or server behavior is added. A replacement explanation requires the exact actual capacity-review reason, matching source session and opening receipt timestamp, an active checked UI review, and the relevant explicit diagnostic predicates. Missing, malformed, foreign or stale evidence retains the existing fallback. Genuine blocked-event evidence retains the original adverse-event wording. Existing Buy/Add/exit/holding decisions and quantities remain authoritative.

Only `lib/c1DecisionCopy.js`, `components/C1AccountOpportunities.js` and `pages/index.js` application hashes change in the freeze manifest under this owner instruction. The guard, canonical integrity and build/CI hooks remain unchanged. The HOLD, historical UI restore and non-cash-adoption source-integrity tests reverse only the exact new diagnostic prop before checking their original source hashes; all accounting assertions remain intact. The exact isolated branch is added to Vercel's existing disabled-deployment map; main and crons are unchanged.

Neither stock becomes purchase-eligible through this correction. No account data, holdings, cash, transactions, accepted prices, historical records, strategy threshold or purchase protection changes.

## Verification

Passed normal `npm run build`: release-freeze and canonical integrity checks, all 113 regression scripts plus the trade simulation (114/114 tasks), and the complete Next.js production build. Focused coverage includes actual rendered copy with FMP quote provenance, stale/missing/malformed/adverse fallbacks, unchanged ratings and quantities, immutable inputs, the existing event-dependent capacity exception, and genuine position/sector/quote/event protections. All original historical source hashes remain pinned. Independent read-only review found no remaining blockers.
