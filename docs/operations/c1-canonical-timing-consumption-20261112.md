# Canonical C1 timing consumption follow-up — November 12, 2026

This continues the same owner instruction to diagnose, fix, deploy and verify
the unusable live C1 Watch screen without changing authorized trading rules.
It follows PR #377 / production 5156411fff17145c1417c60a9fe1efedc60e39cd.

## Actual post-deployment result

The canonical production version and served client correctly advanced to
5156411. A normal current screen request still returned liquiditySessions=0,
liquidityVerified=false and liquidityPass=false for the leading candidates.
The strict recovery from matching accepted bars did not produce a count on
that actual stored source. That absence remains unverified; no count or volume
history may be invented. PR #377 is therefore not claimed to have completed
live entry-data verification, despite its passing synthetic checks.

The underlying contract mismatch is now isolated: the accepted C1 source
already carries canonical current completed-session liquidityPass and average
volume. The existing account/classifier uses those accepted results; its source
fallback does not require the compacted observation count. The full-universe
producer explicitly reuses this accepted timing to avoid duplicate provider
history downloads. Passing it through the generic broad-screen timing adapter
then incorrectly replaces the accepted result with a new failed calculation
from an absent count. This is a second, generic interpretation of the same
accepted evidence, not a new independent current liquidity observation.

## Scoped correction

Preserve all generic reviewed decisions, recommendations and risk-plan fields.
At this one C1 producer boundary, retain the same canonical timing object as
row.entryTiming when the only missing transport fact is the count, the source
and asOf are exactly the current completed session, availability and explicit
liquidity verification/pass are true, average dollar volume meets the unchanged
$300M floor, and no stale/fallback evidence exists. Explicit insufficient counts,
failed flags, low averages, stale dates and independent live evidence must not
be converted to passing. Do not populate or invent liquiditySessions.

The existing C1 quote, recent momentum, event, price, gap, source eligibility,
account, opening, cash, capacity, concentration and execution gates remain
independent and unchanged. Only checked account orders can authorize quantities.
PR #377's strict count recovery and future count/date transport remain intact.
No accepted market book, original record, account, fill or cash history changes.

Only lib/c1ScreenProducer.js, the explicit source-timing evidence projection in
lib/c1StockClassification.js, and their affected release-freeze entries change
for this follow-up, with explicit defect authorization. Guard implementation, CI,
build hooks, cron and all trading policy remain unchanged. A separate exact
inverse pins released5156411 and preserves all previously published inverse
fixtures, source identities and economic checks. Require full build/audit and
all four exact-head CI jobs before merge; verify the actual canonical live
response after deployment. A healthy generic response or synthetic fixture
alone does not establish private owner-screen Buy qualification.
