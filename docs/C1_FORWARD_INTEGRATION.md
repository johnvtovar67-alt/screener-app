# C1 forward accounting connection

The production research snapshot now calls the same historical C1 simulator
whose source SHA-256 is pinned by regression. Its three option sets are checked
against both saved historical fixtures. The simulator is copied without edits
because the general research simulator has subsequently changed.

The first observed completed session initializes a separate $100,000 paper
portfolio. It is a baseline, not a new forward session. Decisions begin with the
following market session, so initialization cannot book a trade at an opening
price already known when the record was created. Actual brokerage holdings and
purchase dates do not initialize this record.

On later complete snapshots, the model adds only consecutive new sessions.
Previously observed sessions must match exactly. The original simulator is
replayed over this growing immutable input sequence with final artificial
liquidation disabled. Its trades are passed through the verified independent
sleeve ledger; cash, marked equity and position counts must reconcile. All
three sleeves preserve their original independent cash and risk lifecycle.

The private store uses conditional ETag writes. Identical retries do not
advance the record; a competing write is re-read once. Preview books use a
commit-specific path separate from production. Errors expose unavailable/stale
accounting instead of fabricating a current book.

`/api/research/c1-forward-accounting` exposes paper status, model cash/equity,
virtual shares and session count. The same summary is attached to the live
screen's metadata. No user-facing trade card or brokerage transaction is
created by this connection. Existing authority and pilot checks remain intact.

This is not full trading activation. The live compiler uses its current
production cohort, not the historical Nasdaq/S&P membership cohorts. These
paper observations are not automatically eligible validation evidence. The
report explicitly sets executable, eligibleForLiveCapital and eligibleForAlphaClaim
to false, regardless of how many sessions accumulate. Promotion still requires
every separately assessed unchanged evidence gate, including 1,000 placebo
seeds and at least 60 genuinely new sessions. Brokerage reconciliation and a
validated execution interface remain outstanding.

Checks: historical fixtures (976 fills / 5,508 checkpoints), frozen source and
option identities, baseline timing, holiday handling, immutable observed inputs,
missing-session rejection, duplicate refreshes, conditional writes and preview
storage isolation. Run `npm run verify` and `npm run build`.
