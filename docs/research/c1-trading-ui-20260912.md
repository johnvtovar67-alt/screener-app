# Trading pages and existing C1 rules

The owner requested the original trading interface and removal of administrative
controls from Opportunities and Portfolio. Purchase-context import, private-account
activity, balance reconciliation, account differences, activation and sync controls
now live in a separate Account settings view. A small footer button opens it.
The import remains mounted while hidden so its existing private fragment is removed
and retained locally, and navigation never drops a pending import. Holdings entry,
Buy tiles, the Watch table, Portfolio analysis and existing trade instructions remain.
Account differences still block quantities and show a short path to the settings
view. No reconciliation or trading gate is removed.

Holding explanations now retain the known trading-session age even when an outside
holding has no verified momentum rank. Purchase context, prices, stops and missing
rank status remain distinct. No original signal rank is invented from current data.

The frozen parameters were inspected, not changed: each sleeve targets up to three
positions; rank-driven exits are eligible after 30 trading sessions when outside
the top six. This is neither a mandatory day-30 sale nor a 30-calendar-day rule.
Initial individual stops are 14%; portfolio/sleeve drawdown protection is 12%
from its recorded high-water mark and applies before the minimum holding age.
Universe removal and delisting handling also remain active. The existing manual
release policy still requires a current, matching account and verified opening
inputs. This change does not upgrade historical validation or claim the owner's
phone has applied the pending purchase context.

Validation: account/client and comparison regressions locally; full CI/build and
production view verification before completion. No historical study is rerun.
