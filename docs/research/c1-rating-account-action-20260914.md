# Separate C1 stock ratings from account actions

Owner explicitly requested restoration of Buy/Strong Buy tiles even when a full holding or occupied position slots prevent buying. Watch must not be an account-capacity rejection list. This is a presentation change, not authorization to change C1 selection, sizing, entry/exit rules or execution.

The generated account simulator now exposes a dated, observation-only stock recommendation list from the existing ranked eligible pool before ownership filtering, using the existing queue limit and signal action. Pending decisions remain unchanged and retain their sourced ratings. No momentum cutoff is invented, no outside-index holding is admitted to fresh-entry coverage, and no holding rank is repurposed as an entry rating. The historical simulator remains byte-for-byte unchanged; no-account output parity remains exact.

The decision layer combines those ratings with pending entry signals. Opportunities renders stock-rating tiles separately from account actions. Full qualifying holdings show Hold; qualified partials show Add only with current checked quantities; occupied slots and other actual blocks show No purchase plus the recorded reason. Expired checks never display quantities. Existing exits take priority. Portfolio remains limited to actual checked actions. Watch contains remaining unrated candidates rather than account-blocked Buys.

Changed application files: lib/c1AccountSimulator.js, lib/c1AccountDecision.js, lib/c1EntryReview.js, components/C1AccountOpportunities.js. Generator and focused regression tests are updated. Only these four application hashes are refreshed in docs/c1-release-freeze.json under this explicit instruction; the guard itself and build hooks remain unchanged.

Verification: stock-to-tile full/partial/slot cases, Strong Buy, nonqualification despite high momentum, expired/stale reviews, exit precedence, unchanged checked orders, account replay/seed suites and exact frozen-engine parity. Integrated CI/build must pass before merge. No holdings, cash, fills, stored dates, stops, cron or historical research are changed.
