# Recorded-holdings refresh — September 14, 2026

Owner authorization: “I never had to do this in the past” followed by “yes please do that” to restoring Reload/Analyze without a daily no-trade confirmation. This is an explicitly authorized workflow change, not a change to C1 trading rules.

Refresh derives completed-session analysis from the last recorded holdings and verified dated inputs. Missing transaction records use empty fills with an explicit recorded-holdings-carry-forward basis. GET and refresh do not persist those derived execution records. Shares, cost basis and cash remain unchanged unless actual activity is recorded. Accepted actual records and source hashes retain precedence. Freshness and price checks remain active; unavailable source data cannot become current by carrying holdings.

Optional completed-trade entry lists the available dates, defaulting to the latest. When the owner saves later actual activity, earlier gaps retain their explicit carry-forward basis in the ledger; they are not labeled owner-confirmed brokerage activity. Record completed trades in chronological order. No brokerage connection or inferred execution is introduced.

Purchase date rendering preserves calendar dates, including ISO midnight strings, across time zones. Portfolio rows prefer the account's authoritative openedAt over browser-derived dates.

Pending initial-stop explanations include the model-recorded low, date and stop. Recovery after the trigger does not erase an unfilled exit. This evidence comes from the accepted model input, not a new independent verification of a broker quote. No stop threshold or exit decision is changed.

Verification: account regression covers repeated refresh, four consecutive missing records, storage immutability, unchanged cash and positions, stop crossing followed by recovery with no fabricated sale, current API response without confirmation, actual-fill recording, concurrency and missing-input rejection. Calendar date checks cover Chicago, Los Angeles, UTC and Tokyo. Existing engine parity and recommendation tests remain required. CI builds the production UI.

Release freeze: only six affected application hashes are updated. The freeze checker, strategy options, simulators and historical model ledger remain unchanged.
