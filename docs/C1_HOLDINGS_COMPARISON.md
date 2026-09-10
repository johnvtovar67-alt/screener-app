# Read-only holdings comparison

POST /api/research/c1-holdings-comparison accepts {holdings:[{symbol,shares,role}]}, using explicit Core/Swing roles and CASH shares as dollars. Inputs are user-declared, not broker verified, and are not stored or logged by the handler. The service uses its own forward-model snapshot; client model/authority fields are ignored.

Only symbol presence is compared, and only when the server model is current with at least one completed forward session. Empty/new/stale/unavailable models produce unknown presence, not inferred liquidation. Core positions are excluded. No normalized target sizes, orders, trade recommendations, or historical sleeve assignments are inferred. Different account balances cannot produce spurious size instructions.

This endpoint is an audit service, not yet a portfolio UI integration. It does not reconcile historical brokerage fills or restore trading authority. Full fill/deposit/withdrawal records and a verified account snapshot would be needed to establish brokerage accounting parity. Model absence is never a sell instruction.
