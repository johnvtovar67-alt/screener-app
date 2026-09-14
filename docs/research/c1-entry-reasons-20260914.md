# Account entry explanations — September 14, 2026

The owner asked whether missing Adds and cash were expected and said Watch information was weak. The current UI repeats generic eligibility text. Several actual account rejection branches (notably occupied position slots) discard the reason before the plan reaches the UI.

This repair records existing rejection outcomes without changing their predicates or execution. Plans expose per-symbol/allocation reasons; Watch shows the recorded blocker and corresponding next condition only while the opening review is current. Without a current review, the page says the review is unavailable instead of displaying a stale rejection as current.

Existing holdings receive an Addition review in their explanation. The plan distinguishes an exhausted recorded target, a closed completion plan, an absent target/partial-entry record, and a holding not present in the current entry queue. Owner-confirmed full positions are described as complete rather than missing a partial-entry record. No historical target or qualification is inferred. Missing detailed evidence remains explicitly unavailable.

Focused tests exercise actual full-slot, opening-gap, missing-target and not-in-queue outcomes, and the display distinction for full holdings. Account seed/replay and manual recommendation regression suites pass locally, including frozen-engine parity. The historical strategy, target quantities, order identities, holdings/cash, stops, entry dates and cron are unchanged. Only the affected presentation/runtime hashes are updated under the owner's explicit request. The exact-match generator retains observation-only seams.

This session cannot inspect the user's saved private screener state. The screenshot alone does not establish whether FCX/STX lacks saved context or fails entry eligibility. The deployed app now exposes that distinction using its own authenticated account state; no brokerage access or sync key is required.
