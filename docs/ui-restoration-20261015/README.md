# C1 UI restoration — before / after

These are actual complete application pages rendered in Chromium with the **same deterministic DELL, MPC, VEEV, cash and checked-order fixtures**. No real owner data, credentials, provider requests or brokerage activity were used. The completed-trade example was typed but never submitted.

**Before:** production source/assets `e046666`. **After:** restored UI from source branch `fix/c1-compact-sitewide-ui`, rendered through the existing local Next app. Click any screenshot for its full resolution. Screenshots are review evidence, not investment-performance results or a private-account acceptance claim.

The reference image compares full Portfolio pages from approved `8007dc`, immediate pre-redesign `0672788`, before `e046666`, and the restored UI. Historical source was rendered with installed Next 15 / React 18; `8007dc` originally declared Next 14.

[![Full-page Portfolio source references](baseline-portfolio-contact.png)](baseline-portfolio-contact.png)

<details>
<summary>Opportunities</summary>

Desktop 1440 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Opportunities desktop](before-opportunities-1440.png)](before-opportunities-1440.png) | [![After Opportunities desktop](after-opportunities-1440.png)](after-opportunities-1440.png) |

Mobile 390 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Opportunities mobile](before-opportunities-390.png)](before-opportunities-390.png) | [![After Opportunities mobile](after-opportunities-390.png)](after-opportunities-390.png) |

</details>

<details>
<summary>Portfolio</summary>

Desktop 1440 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Portfolio desktop](before-portfolio-1440.png)](before-portfolio-1440.png) | [![After Portfolio desktop](after-portfolio-1440.png)](after-portfolio-1440.png) |

Mobile 390 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Portfolio mobile](before-portfolio-390.png)](before-portfolio-390.png) | [![After Portfolio mobile](after-portfolio-390.png)](after-portfolio-390.png) |

</details>

<details>
<summary>Themes</summary>

Desktop 1440 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Themes desktop](before-themes-1440.png)](before-themes-1440.png) | [![After Themes desktop](after-themes-1440.png)](after-themes-1440.png) |

Mobile 390 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Themes mobile](before-themes-390.png)](before-themes-390.png) | [![After Themes mobile](after-themes-390.png)](after-themes-390.png) |

</details>

<details>
<summary>Single Symbol</summary>

Desktop 1440 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Single Symbol desktop](before-single-1440.png)](before-single-1440.png) | [![After Single Symbol desktop](after-single-1440.png)](after-single-1440.png) |

Mobile 390 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Single Symbol mobile](before-single-390.png)](before-single-390.png) | [![After Single Symbol mobile](after-single-390.png)](after-single-390.png) |

</details>

<details>
<summary>Account settings</summary>

Desktop 1440 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Account settings desktop](before-account-settings-1440.png)](before-account-settings-1440.png) | [![After Account settings desktop](after-account-settings-1440.png)](after-account-settings-1440.png) |

Mobile 390 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Account settings mobile](before-account-settings-390.png)](before-account-settings-390.png) | [![After Account settings mobile](after-account-settings-390.png)](after-account-settings-390.png) |

</details>

<details>
<summary>Completed-trade form</summary>

Desktop 1440 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Completed-trade form desktop](before-activity-form-1440.png)](before-activity-form-1440.png) | [![After Completed-trade form desktop](after-activity-form-1440.png)](after-activity-form-1440.png) |

Mobile 390 px

| Before e046666 | Restored UI |
| --- | --- |
| [![Before Completed-trade form mobile](before-activity-form-390.png)](before-activity-form-390.png) | [![After Completed-trade form mobile](after-activity-form-390.png)](after-activity-form-390.png) |

</details>

Mobile Watch tradeoff: consistent stock cards make the controlled 390 px Opportunities page 1946 px tall versus 1746 px before; the Portfolio page falls from 2586 px to 1722 px. This is a readability/consistency choice, not a claim that every page is shorter.

Verification: full desktop/mobile pages, narrow 360 px checks, expanded four-group holding Details, Single details, cash editor, holdings editor, and unsubmitted activity form. The market-leadership strip may scroll inside its own container; restored pages do not require horizontal page scrolling. All fixture holdings remained unchanged.
