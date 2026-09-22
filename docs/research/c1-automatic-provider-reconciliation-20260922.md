# C1 automatic provider-revision reconciliation — September 22, 2026

Authorization: the owner directed C1 to accept verified revisions from its sole market-data provider through an append-only automatic reconciliation process rather than requiring another date-specific code patch. This repair does not change C1 selection, ranking, sizing, entry, exit, stop, cash, concentration or user-interface policy.

## Behavior

When FMP revises the immediately preceding adjusted daily history, C1 still preserves the originally accepted session. A revision can advance automatically only after two distinct immutable archived observations agree exactly on the complete replacement bar set. The observations must use the FMP `historical-price-eod/dividend-adjusted` endpoint, retain the provider and membership checks, cover every accepted prior-session symbol exactly once and contain valid adjusted OHLCV bars.

C1 replays the next session from both the original and revised prior bars. Ledger, pending sleeves, paper execution, execution status and summary must match exactly. Any conflicting or incomplete provider evidence, invalid bar, benchmark/membership gap, blocked execution or economic difference retains the existing stop. No tolerance, inferred split, fabricated bar or alternate provider is introduced.

On success, C1 stores the original model result and appends a `c1-provider-revision-reconciliation-v1` receipt containing the provider, endpoint, evidence hash, archived observation hashes, field-level differences, corrected comparison bars and economic-comparison hash. Previously accepted sessions, captures, fills, holdings, cash, stops and capital history are not rewritten.

Private accounts are checked independently. Their actual fill replay, cash/risk state and next opening plan are compared under the original and revised bars. An identical result permits continuation without changing the account; any difference remains a reconciliation failure.

## Verification

Focused regression coverage requires two agreeing captures, rejects one capture or conflicting values, preserves the accepted bar, rejects model-economic changes and rejects private-account plan changes. The prior reviewed September 17 recovery remains supported for its already-recorded evidence.
