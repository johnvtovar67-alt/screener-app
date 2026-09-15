# Intraday replacement slot repair — September 15, 2026

The owner explicitly requested a repair after recording the STX sale: available cash increased, but every Buy tile said all three slots were occupied. Reproduction against the real account fixture showed zero remaining holdings after a sale, no checked buys after a current-price gap failure, and stale position-limit explanations for alternate queued stocks.

The old flow projected opening purchases first, reserving capacity for them. Its later current-price check removed failed purchases without rerunning the queued alternatives. This repair moves that same current entry-gap check ahead of the projection for a session with recorded sales and no recorded purchases. The frozen account simulator skips those failed entries before consuming slots and cash. It retains the original observed opening quotes, ranked queue, target sizing, sector/cash limits, holding periods, stops and cooldowns. Current price and actual-cash checks still apply to the resulting remaining quantities.

Recorded sales are matched by sleeve, symbol, side, condition and reason to the refreshed plan. Quantities, execution prices, fees and times remain unchanged; actual books must match exactly before a rebase is accepted. The original plan evidence is retained. Once a purchase is recorded, its selection evidence stays fixed; a later refresh cannot silently remap that executed trade. Saved entry rejection evidence is carried into closing plan reconstruction and later account replay. The public record-session operation rejects client-supplied entry-recheck evidence.

Position-limit wording now distinguishes capacity allocated to existing holdings and higher-ranked proposed buys from actual holdings alone. No automatic refresh or brokerage execution is added.

Changed implementation: c1IntradayActivity, c1AccountExecution, c1AccountService, c1-account API, c1EntryReview, and the generated account simulator plus its declared generator seam. Only affected application freeze hashes are updated; the frozen historical simulator, strategy parameters, freeze checker and build hooks remain unchanged.

Verification includes the actual API and module flow: recorded sale, failed opening choices, alternative quantity, actual alternative purchase, reload, closing replay, and following-session ownership without another activity confirmation. Existing cooldown, entry-gap, oversell, cash, duplicate, storage-failure, Core-preservation and missing-provider-data tests remain enabled. Full regression and deployed build results are recorded in the PR.
