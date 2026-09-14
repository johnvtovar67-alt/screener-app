# Restore the original C1 screen classifier

The owner rejected repeated UI patches and authorized comparing the original implementation before repairing Buy/Watch classification. The reference is the initial C1 deployment fb6133e629832c44e8b176f67cbafd87aec98d28 (2026-09-04), specifically lib/v11ProductionPolicy.js and its regression tests.

The original display builds a nine-name momentum queue, then selects up to three names after quote, event, liquidity, price, gap, sector and issuer checks. Strong Buy requires expertDecision.strongBuyPass, not a momentum percentile or the simulator's order action. The original screen selector allows one selected issuer and one representative per sector. These screen rules are distinct from the frozen account ensemble's allocation rules; restoring them does not change the account engine.

PR185 incorrectly treated the simulator's internal buy-side queue as screen ratings. Remove its observational simulator additions and restore lib/c1AccountSimulator.js, its generator, and lib/c1AccountDecision.js exactly to 4cf603a. A separate c1StockClassification module now builds the original screen snapshot from the accepted source session and classifies against current broad-screen quote/expert evidence. The account service attaches this read-only snapshot. No values flow from it into execution.

The Opportunities component uses those ratings: qualifying full holdings retain a Buy tile with Hold; partial holdings get an Add quantity only from current checked orders. Remaining candidates are Watch with specific rank or failed-check explanations. An account order cannot promote a Watch to a Buy tile. Portfolio retains the existing checked account actions. Missing/stale screen evidence cannot manufacture a Buy; expired account checks cannot display executable quantities.

Historical reference is retained as a test-only oracle in tools/fixtures/c1-original-screen-policy.js, with only its relative marketSession import adjusted. Production does not import the oracle or restore its old lifecycle/authorization fields. Existing SCHW exclusion is preserved. No alpha authority flags, pilot restrictions, old exit rules or old sizing are restored.

Tests compare classification directly with the original implementation across normal 3 Buy/6 Watch, gap, liquidity, quote, event, sector, issuer and Strong Buy cases. Account seed/replay tests verify exact no-account frozen-engine parity, unchanged holdings/cash/stops/dates and actual-fill conservation. The existing full CI suite and build are required before merge. No historical experiment or scheduled task is rerun.

Freeze manifest: update only changed application entries and add the new screen-classifier entry under this owner instruction. Guard and build hooks remain unchanged. Account execution, sizing, frozen options, holding/stop logic, cash ledger and cron files remain unchanged from production 5985138.
