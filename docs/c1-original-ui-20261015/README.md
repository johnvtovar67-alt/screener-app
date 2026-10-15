# C1 — exact original UI restoration

These are actual full application pages rendered in Chromium, with identical deterministic DELL, MPC, VEEV, cash and checked-order fixtures. All backend requests were intercepted locally. No owner data, real credentials, providers, account changes or brokerage trades were used. The completed-trade example was typed and never submitted.

- **Before:** exact shipped production `0a5ceab` HTML and assets.
- **Historical reference:** source `f0d46ffceb98ba3fd5fca121beba6d8f23ccbdde`, built with its declared Next 15 / React 18 versions.
- **After:** optimized production build of branch `fix/c1-literal-historical-ui`, using the literal original UI regions with current decision/quote bindings.

All six major views were captured at 1440, 390 and 360 px. The gallery contains desktop and 390 px full pages; 360 px verification remains in the local test report. These fixtures verify presentation and compatibility, not investment performance or private-owner account acceptance.

[![Portfolio source comparison](portfolio-source-comparison.png)](portfolio-source-comparison.png)

<details>
<summary>Opportunities</summary>

Desktop 1440 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Opportunities desktop](before-current-opportunities-1440.png)](before-current-opportunities-1440.png) | [![Historical Opportunities desktop](historical-f0-opportunities-1440.png)](historical-f0-opportunities-1440.png) | [![Restored Opportunities desktop](restored-after-opportunities-1440.png)](restored-after-opportunities-1440.png) |

Mobile 390 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Opportunities mobile](before-current-opportunities-390.png)](before-current-opportunities-390.png) | [![Historical Opportunities mobile](historical-f0-opportunities-390.png)](historical-f0-opportunities-390.png) | [![Restored Opportunities mobile](restored-after-opportunities-390.png)](restored-after-opportunities-390.png) |

</details>

<details>
<summary>Portfolio</summary>

Desktop 1440 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Portfolio desktop](before-current-portfolio-1440.png)](before-current-portfolio-1440.png) | [![Historical Portfolio desktop](historical-f0-portfolio-1440.png)](historical-f0-portfolio-1440.png) | [![Restored Portfolio desktop](restored-after-portfolio-1440.png)](restored-after-portfolio-1440.png) |

Mobile 390 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Portfolio mobile](before-current-portfolio-390.png)](before-current-portfolio-390.png) | [![Historical Portfolio mobile](historical-f0-portfolio-390.png)](historical-f0-portfolio-390.png) | [![Restored Portfolio mobile](restored-after-portfolio-390.png)](restored-after-portfolio-390.png) |

</details>

<details>
<summary>Themes</summary>

Desktop 1440 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Themes desktop](before-current-themes-1440.png)](before-current-themes-1440.png) | [![Historical Themes desktop](historical-f0-themes-1440.png)](historical-f0-themes-1440.png) | [![Restored Themes desktop](restored-after-themes-1440.png)](restored-after-themes-1440.png) |

Mobile 390 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Themes mobile](before-current-themes-390.png)](before-current-themes-390.png) | [![Historical Themes mobile](historical-f0-themes-390.png)](historical-f0-themes-390.png) | [![Restored Themes mobile](restored-after-themes-390.png)](restored-after-themes-390.png) |

</details>

<details>
<summary>Single Symbol</summary>

Desktop 1440 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Single Symbol desktop](before-current-single-1440.png)](before-current-single-1440.png) | [![Historical Single Symbol desktop](historical-f0-single-1440.png)](historical-f0-single-1440.png) | [![Restored Single Symbol desktop](restored-after-single-1440.png)](restored-after-single-1440.png) |

Mobile 390 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Single Symbol mobile](before-current-single-390.png)](before-current-single-390.png) | [![Historical Single Symbol mobile](historical-f0-single-390.png)](historical-f0-single-390.png) | [![Restored Single Symbol mobile](restored-after-single-390.png)](restored-after-single-390.png) |

</details>

<details>
<summary>Account settings</summary>

Desktop 1440 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Account settings desktop](before-current-account-settings-1440.png)](before-current-account-settings-1440.png) | [![Historical Account settings desktop](historical-f0-account-settings-1440.png)](historical-f0-account-settings-1440.png) | [![Restored Account settings desktop](restored-after-account-settings-1440.png)](restored-after-account-settings-1440.png) |

Mobile 390 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Account settings mobile](before-current-account-settings-390.png)](before-current-account-settings-390.png) | [![Historical Account settings mobile](historical-f0-account-settings-390.png)](historical-f0-account-settings-390.png) | [![Restored Account settings mobile](restored-after-account-settings-390.png)](restored-after-account-settings-390.png) |

</details>

<details>
<summary>Completed-trade form</summary>

Desktop 1440 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Completed-trade form desktop](before-current-activity-form-1440.png)](before-current-activity-form-1440.png) | [![Historical Completed-trade form desktop](historical-f0-activity-form-1440.png)](historical-f0-activity-form-1440.png) | [![Restored Completed-trade form desktop](restored-after-activity-form-1440.png)](restored-after-activity-form-1440.png) |

Mobile 390 px

| Before 0a5ceab | Exact historical f0d46ff | Restored after |
| --- | --- | --- |
| [![Before Completed-trade form mobile](before-current-activity-form-390.png)](before-current-activity-form-390.png) | [![Historical Completed-trade form mobile](historical-f0-activity-form-390.png)](historical-f0-activity-form-390.png) | [![Restored Completed-trade form mobile](restored-after-activity-form-390.png)](restored-after-activity-form-390.png) |

</details>

Source and rendered-region verification: [verification.json](verification.json). All 18 restored page captures completed without browser/page errors and left the fixture holdings unchanged. Desktop Single, On Deck and Account crops are pixel-identical to the historical reference; On Deck also matches exactly at both mobile widths. The remaining mobile Single/Account crops retain identical dimensions with 50–67 changed pixels each (under 0.03%); no image resizing or normalization was applied. The original 9,578-byte page stylesheet, 1,562-byte card stylesheet, 118-byte account-Opportunities stylesheet and pinned original JSX regions are checked by SHA-256. The existing five-column Watch table and seven-column desktop holdings table are restored; Watch keeps its original internal horizontal scrolling on narrow screens.

Explicit compatibility differences: current verified stop/momentum decisions and Buy/Add checks; current held-price bindings; refresh/freshness text; mobile navigation wrapping and long-action-label wrapping. Historical f0 can show old Buy labels for holdings while the restored page correctly shows their current Sell/Hold state. These content changes are retained rather than freezing obsolete decisions. Account and activity forms use their original source.

The literal historical reference itself has a 417 px document width at 390/360 px because its navigation did not wrap. The retained narrow-screen nav compatibility rule prevents navigation overflow. Unchanged original form controls still produce a 401 px document width on Account/activity at 390 and 360 px, and the original Themes select produces 371 px at 360 px. Their element bounds match the historical reference; they were not restyled. No responsive Watch cards or replacement columns were introduced.
