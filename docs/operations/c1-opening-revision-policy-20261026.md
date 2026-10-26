# Opening revision comparison repair — October 26, 2026

Owner authority: October26 screenshot of paused Opportunities followed by
"Fix this!". Base main/production24eca58. No other active hardening PR was
found; old unrelated proposals remain untouched.

## Reproduced defect

The real execution view constructs its opening plan with independent brokerage
funding and qualified four-Swing capacity enabled. The revision review rebuilt
comparison plans using both default false values. A synthetic repeat-confirmed
revision to a held symbol, whose recorded basis is deliberately preserved,
therefore raised the exact visible error: "the revised close changes opening
orders or limits" despite no price-driven change. The actual execution-view
fixture failed before the repair and passes afterward, with identical complete
orders, blocked orders, entry reviews, opening/projected books and policies.

## Bounded repair

Only lib/c1OpeningPriceReview.js changes in application code. Derive the two
existing planner options from the supplied server-produced plan's exact policy
contracts, matching the established replan path. Legacy plans retain false
defaults. No tolerance, actionable comparator, revision evidence requirement,
historical basis, rule, account record, cash, fill, sizing, UI, authentication,
cron, dependency, guard or build hook changes. Only that authorized application
manifest entry changes.

## Verification and limits

Focused actual execution fixture proves failure-before/success-after, four
funding/capacity combinations, invalid-evidence rejection, complete retained
account/book bytes and zero writes. Existing c1-intraday regression retains
its genuine price-driven order-change rejection test unchanged.
Full local suite/build, exact-head CI/preview and merged production gates are
pending at this source checkpoint; final release evidence belongs in the PR.

Production normal-traffic warnings at08:33–08:35CDT and the owner screenshot
establish an opening-review incident. No private account or raw provider payload
was accessed: the synthetic reproduction does not establish that this is the
only cause of the owner's particular revision difference. A fresh normal owner
review must still pass all original quote/event/account/session gates; purchases
remain paused if an actual price-driven order change exists.
