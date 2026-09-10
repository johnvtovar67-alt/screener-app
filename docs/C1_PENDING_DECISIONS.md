# C1 pending-decision observation

The frozen simulator now has one observation-only return field: pendingDecisions. Removing that exact line must recover SHA-256 bcf3cc3e89ac499319a2cbfab76e42fda3bda5ef72d2d45777959e73e6ad9e7d. No selection, sizing, stop, cooldown or execution logic is edited. A source-identity regression enforces this boundary; old historical hashes describe the core before this observation field.

Pending decisions are copied after the final simulated close and before a future open. End-liquidated historical runs expose no actionable residual queue. Synthetic tests compare all old output fields with the original source, verify no same-day entry, verify eligible next-open entries, and perturb future prices without changing the earlier queue.

The forward paper record stores each sleeve's queue privately. Its public summary exposes source session, earliest execution session and counts only. These are candidates and pending exits, not authorized brokerage orders. In particular, a nine-name candidate queue is not nine recommended purchases: the original next-open execution still checks available cash, position/sector limits, opening gaps and other conditions.

Cached records refresh to add observation metadata without counting a new session. No inspected historical data becomes forward evidence. No real holding is imported or reclassified by this interface.

Still needed before a production recommendation interface can be restored: a causally equivalent next-open execution interface with actual fills/partial fills and same-snapshot cross-page tests, plus all independent evidence gates. This observation step alone does not establish C1 alpha or permit trading.
