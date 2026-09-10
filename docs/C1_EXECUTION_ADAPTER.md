# C1 paper transition adapter

The forward tracker now maps frozen-model ledger transitions into an independent whole-share paper account. No rank, sector, stop or cooldown rule is reimplemented here. The unchanged simulator remains the decision source.

The adapter binds the account to the preceding complete model fill history and initial capital, nets shared symbols across sleeves, rounds once, lists sales before purchases, and rejects missing marks, insufficient cash, changed history, skipped execution sessions and unexpected holdings/partial fills. It does not adopt legacy brokerage positions or fill gaps in transaction history. Retries cannot buy twice. Failed transitions leave execution state unchanged and report blocked status.

IMPORTANT SCOPE: this is retrospective end-of-session mapping using supplied close prices plus the adapter's 12 bps execution estimate. It is not a causal next-open order generator, brokerage fill processor, or proof of matching historical returns. It is separate from simulator performance, which already uses its own historical execution prices. No adapter return is represented as model alpha.

The public paper summary exposes only status and proposed order count, not trade tickets. Private nextAccount assumes all paper proposals fill at their estimates. Real partial fills must never be committed through that path. Paper counters remain ineligible for alpha/live authority regardless of adapter status.

Existing zero-fill records can initialize this paper account without adding forward sessions. Existing records with fills but no execution history block rather than manufacture past whole-share fills. Once blocked, missing execution history must be reconciled; it is not silently reset.

Still required: expose the original simulator's causally available pending decisions via a verified interface, integrate a real execution-event ledger and actual partial fills, establish same-snapshot Opportunities/Portfolio contract tests, and complete the independent evidence gates. The legacy recommendation path is still suspended and divergent; this adapter does not fix it by merely changing constants.
