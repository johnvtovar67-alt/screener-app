# Actual account capital reconciliation

The Portfolio activity importer previously compared balances but could never resolve the composition-change restriction. A successful balance check therefore left the user in the same state indefinitely.

The import now reconstructs opening balances, each actual fill (including partial fills and fees), and closing balances. To reconcile the retained capital record:

1. The CSV opening positions and cash must match the original saved capital signature.
2. Closing balances must match the currently entered portfolio.
3. Core positions and Core activity cannot be reclassified as Swing capital.
4. Deposits and withdrawals remain unsupported for capital-history repair because the file does not contain portfolio valuations at each external cash flow.
5. The user must confirm that the supplied activity covers the interval completely.

On confirmation, the client checks that neither the entered portfolio nor the stored capital record changed after preview. It writes an audit receipt with the supplied activity and prior/next states before updating the current signature. The original observed high-water mark and breaker date are preserved. Portfolio analysis then runs using the reconciled state. A drawdown can still trigger the breaker; reconciliation is not a baseline reset.

The activity file and audit history remain on the device. The existing authenticated portfolio sync carries the resulting capital state, as it already does after analysis. The audit file is not uploaded by the activity importer.

This is actual-account accounting integration. It does not assign historical sleeve ownership, establish data-provider provenance, certify the investment thesis, enable the separate C1 trading-authority gate, or treat a model's hypothetical fills as actual trades. The frozen simulator, options and archived backtest results are unchanged.

Focused regression coverage executes the real import/apply/save/analyze handlers, including missing confirmation, a changed capital record, storage failure, repeat submission, partial fills, fees, unchanged Core holdings with hidden Core round trips, external cash flows, and retained drawdown/cooldown behavior. The existing required regression suite includes these checks.
