# Independent constituent-date evidence

This source review supports the metadata gate, without prices, performance
evaluation, reconstruction of the old archive, or global certification of a
provider's historical feed. Full provider metadata and candidate rosters stay
in the subscriber-private working directory.

## Target-window change

[S&P DJI release, published March 7, 2025](https://press.spglobal.com/2025-03-07-DoorDash%2C-TKO-Group-Holdings%2C-Williams-Sonoma-and-Expand-Energy-Set-to-Join-S-P-500-Others-to-Join-S-P-100%2C-S-P-MidCap-400-and-S-P-SmallCap-600)
states that the S&P 500 changes take effect before the market opens on March 24.
The added security set is DASH, EXE, TKO and WSM. The removed set is BWA, CE,
FMC and TFX. The release's table also supplies contemporaneous GICS sectors for
these names. Use March 24 for valid membership and March 7 for announcement
availability; do not conflate the two. Row-to-row replacement pairings are not
economic pairings. A reconstruction uses the complete day's additions/removals.

The [official 2025 release archive](https://press.spglobal.com/index.php?category=784&l=100&year=2025)
shows this as the only headline announcing S&P 500 member changes in the target
period. This is corroboration, not proof that all possible temporary corporate
actions appear in the headline archive.

Two other primary notices mention S&P 500 parents but concern SmallCap 600
entrants: [Millrose, February 5](https://press.spglobal.com/2025-02-05-Millrose-Properties-Set-to-Join-S-P-SmallCap-600)
and [SanDisk, February 19](https://press.spglobal.com/2025-02-19-SanDisk-Set-to-Join-S-P-SmallCap-600).
The respective parents Lennar and Western Digital explicitly remain in the
S&P 500. Do not infer a permanent S&P 500 admission for the spun-off company
from a reference to its parent's index membership.

## Removal-only dates and parser boundaries

[S&P DJI, September 24, 2024](https://press.spglobal.com/2024-09-24-Amentum-Set-to-Join-S-P-500-Bath-Body-Works-to-Join-S-P-SmallCap-600)
announces AMTM admission before the September 30 open and BBWI deletion before
the October 1 open. Thus neither a per-row shared date nor a zero-sum daily
member-count assumption is universally valid. This event lies outside the
qualification target and the current-to-baseline reconstruction span; it is a
counterexample to global date certification, not an automatic target rejection.

[S&P DJI, May 3, 2024](https://press.spglobal.com/2024-05-03-Vistra-Set-to-Join-S-P-500-Aaon-to-Join-S-P-MidCap-400-Marathon-Digital-Holdings-to-Join-S-P-SmallCap-600)
dates PXD removal and VST addition before the May 8 open. An API can encode
those as two independent rows. Neither row's `symbol` can be assumed to be an
addition without checking explicit action and addition fields.

[S&P DJI, October 1, 2026](https://press.spglobal.com/2026-10-01-Vylor-Added-to-the-S-P-500-Twilio-Set-to-Join-S-P-500-Others-to-Join-S-P-MidCap-400-and-S-P-SmallCap-600)
provides a recent dated check relevant to reversing a current anchor: VYLR
admission on October 1, CTVA deletion before the October 6 open, and the
TWLO/WBD replacement on October 6. This deliberately non-simultaneous sequence
must retain its temporarily larger member set.

`membership.py` splits explicitly typed additions/removals, rejects contradictory
date/type fields, and applies full effective-date batches in either direction.
It preserves same-day rollover actions and distinct share-class lines. Its
synthetic tests demonstrate structure and timing mechanics, not source truth.

## Independent anchor and share classes

[SPY's December 31, 2024 SEC schedule](https://www.sec.gov/Archives/edgar/data/884394/000175272425043826/NPORT_J905_96606633_1224.htm)
is a dated primary holdings source for independent roster reconciliation. It
shows separate Alphabet A/C, Fox A/B and News Corp A/B lines, and Berkshire B
and Brown-Forman B lines. It does not provide per-name sectors, and ETF holdings
must be reconciled to index membership rather than assumed identical.

Issuer sources resolve the class/ticker mapping: [Alphabet's 2024 Form 10-K](https://www.sec.gov/Archives/edgar/data/1652044/000165204425000014/goog-20241231.htm),
[Fox's establishment release](https://investor.foxcorporation.com/establishment-of-fox/),
and [News Corp's 2024 Form 10-K](https://www.sec.gov/Archives/edgar/data/1564708/000156470824000408/nws-20240630.htm).
CIK is an issuer identifier, so equal CIKs cannot collapse multiple ranked
share classes. Only explicit BRK-B/BRK.B and BF-B/BF.B punctuation aliases are
recognized by the comparison helper; its roster state preserves original lines.

## Current-anchor identity complications

Current symbols are not historical identifiers. Primary evidence verifies
[SATS to ECHO, June 24, 2026](https://ir.echostar.com/news-releases/news-release-details/echostar-changing-stocker-ticker-sats-echo-marking-companys-next),
[FI to FISV, November 11, 2025](https://investors.fiserv.com/news-releases/news-release-details/fiserv-announces-transfer-stock-exchange-listing-nasdaq),
[BK to BNY, May 21, 2026](https://www.bny.com/corporate/global/en/about-us/newsroom/press-release/bny-announces-planned-change-of-stock-ticker-symbol-to-bny-130465.html),
and [MMC to MRSH, January 14, 2026](https://www.miaxglobal.com/alert/2026/01/13/miax-exchange-group-options-markets-corporate-action-alert-marsh-mclennan-0).

The [EQR/AVB combination creating VMRK](https://investors.vivmarkresidential.com/news-events/press-releases/detail/113/vivmark-residential-launches-as-one-of-the-countrys-leading-real-estate-companies)
is a merger, not merely a ticker spelling change. PARA/PSKY likewise needs
corporate-action evidence before any security continuity assertion. Such
post-target events can be avoided for this sample by using an independently
reconciled contemporaneous baseline and terminal anchor, rather than by
pretending today's symbol map is timeless.
