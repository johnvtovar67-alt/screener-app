# Stock-level recent-momentum exits

The owner explicitly authorized this change on November 19, 2026 after observing
that an older allocation's recent-momentum exit left newer holdings waiting for
their separate post-purchase confirmation clocks. Baseline main and production
are da4e430ab6d0fc8bdd19927a488947be7d5498bb.

One ordinary three-close confirmation clock now follows continuous aggregate
Swing ownership of a ticker. The first account entry day is excluded; additions,
new allocations and partial sales do not restart the clock. Aggregate actual
ownership reaching zero ends the episode, including same-day reentry. Only
accepted completed closes and the unchanged MACD/return predicates can establish
a trigger. Missing data never supplies a confirmation.

Activation is the November 19 decision/opening, using November 18 accepted source
evidence. Earlier closes may supply current confirmation context; a recovered
pre-activation weak patch cannot create a retroactive liquidation. Once an
eligible recent-momentum exit is confirmed it remains pending until actual flat
ownership. Existing verified per-allocation profit-protection thresholds and peak
provenance remain intact; a confirmed recent-momentum profit exit also applies
to the whole stock. Existing confirmed rank-based momentum exits also cover all
recorded Swing shares; their ranking, holding and confirmation criteria remain
unchanged. A partially executed instruction retains its original server-plan
episode proof, which cannot transfer through a completed flat/reentry boundary.

Concrete per-allocation Sell orders cover actual held shares before projected
cash, holdings and standing stops are calculated. Protective exits retain priority
without duplicate sales. Same-name purchases remain blocked across allocations.
Every view and the completed-trade recorder consume that same authority.

This derives prospective instructions only. It does not execute trades, infer
fills, edit historical records, reset stops, change cost basis or cash, or reset
the portfolio-loss reference. Only the existing verified full loss-exit process
can reset its operational reference. Normal schedules are unchanged.

Focused tests must exercise shared confirmation, added allocations, partial
fills, recovery/reload, missing evidence, the full-flat/reentry boundary, concrete
recording authority and unchanged financial inputs. Synthetic cases demonstrate
software behavior, not investment returns. All four exact-head CI jobs and the
production version/assets must be verified before release is reported live.

The application freeze changes only the eight declared application entries.
A new exact source inverse restores seven edited files to this baseline and
independently pins the new module. Earlier fixture bytes and expected hashes
remain unchanged. Historical tooling invokes the new inverse before the issued
trade-retention and opening-copy layers, including their direct raw-source
checks. No build hook, CI workflow, dependency, cron or production guard changes.
