# Dated Watch monitoring correction

The owner observed zero Watch names after the ten-row release and clarified
that Watch means stocks worth monitoring, not immediate purchase clearance.
Market closure or unavailable execution checks must not erase an otherwise
valid dated Watch list. This continues the existing three-part account-policy
work from main/production 9f3b03cfc0ca7146facec94e2ab51b285f92a6f2.

## Demonstrated boundary defect

The released selector required a verified live entry frame, current quotes,
unexpired clear company-event receipts, recent entry momentum, account exposure
clearance and no missing opening evidence. These are purchase checks. Treating
their absence as monitoring exclusion can empty Watch despite accepted dated
ranking inputs. Earlier passing tests encoded that overly strict Watch rule.

Normal production account responses used the accepted November 10 source and
reported MARKET_CLOSED while the owner observed zero names. Existing operational
logs omit per-candidate input bodies. They establish the closed-market context,
not the precise per-name rejection counts; those must be captured from the
normal owner-screen data rather than invented from fixtures.

The real Home/App path also masks the display decision as not current when
ownership or stop verification is pending, while retaining a current server
execution decision. Watch must bind to that original dated server source only
when account revision and source date agree, carrying the display mask as WAIT.
The masked decision continues to block purchases. A genuinely stale server
source or mismatched revision/date remains unverified.

## Scoped correction

Select monitors from accepted dated source candidates in their unchanged
research-rank order. Require trustworthy source date/version and universe
coverage, rank, momentum, price, liquidity, factor coverage, source volatility
and mandate facts. Keep known stock cooldowns, active exits, holdings and
verified current material-event exclusions separate from temporary execution
waiting. Unknown required dated facts remain explicitly unverified; do not pad
the list or describe missing evidence as no candidates.

Live quote/event/opening availability, market closure, recent entry-trigger
waiting, cash/exposure/capacity/sizing conditions and account verification explain
WAIT. They do not grant purchases or erase valid dated monitors. Stocks already
shown in Opportunities may remain in that separate presentation category.
Display at most ten current monitors, with concise waiting explanations and
truthful source, exclusion and unknown counts. No prior appearance is a ranking
input, and no ranking formula or purchase-search cutoff changes.

A local Watch-details download uses only already-loaded, allowlisted dated
candidate inputs and computed status/reason fields. It performs no request,
storage update, account operation or provider acquisition and exports no sync
key, headers, account balances, fills or ledger. Its purpose is to inspect the
owner's actual candidate reasons and dated ranking evidence on a phone.

## Required verification

Exercise the real account/classifier/publication and desktop/mobile paths with
accepted dated inputs and a closed market, absent or stale live quotes/events,
missing opening checks and unconfirmed funding. Valid dated monitors must remain
while Buy/Add quantities remain unavailable. Keep structural/source exclusions,
cooldowns, active exits and verified event blocks enforced; verify incomplete
source evidence is unknown rather than zero. Verify no appearance preference,
lower-ranked purchase continuation and unchanged checked order quantities.

The existing account-wide cooldown, coherent-action, once-per-completed-exit
operational reference and financial-replay regressions remain required. Saved
private facts stay outside git. New monitoring source inverses must preserve all
three previously released inverse fixtures and earlier economic assertions.
Only affected freeze entries and explicit owner authorization change. Build,
audit/regression and all three browser CI jobs must pass on the exact head before
merge. Then verify canonical/main/deployment identity and the actual owner screen
and Watch-details evidence. A successful deployment alone is not completion.
