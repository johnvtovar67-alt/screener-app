# Completed-add recovery form on phones

The owner’s deployed screen showed allocation labels and empty inputs wrapping
inline above otherwise complete fill details. The proposal button appeared
before the share quantity that enables it. The form correctly rejected a missing
allocation, but its error did not clearly identify the next action. The submit
button also appeared blank in the supplied phone screenshot.

Source inspection confirms that allocation labels lacked the existing `.inputs`
layout wrapper. Global button CSS specified a white background without an
explicit foreground color; JavaScript always supplied the submit label. The exact
Safari computed-color cause cannot be established from the screenshot alone.

This behavior-preserving repair puts the actual fill fields first, followed by a
labeled recovery fieldset with plain split instructions. Allocation labels and
inputs stack at phone widths. Scoped control widths contain the date/time input;
explicit button and text-fill colors preserve readable labels in enabled,
disabled and busy states. The empty-allocation error points to the proposal and
renewed confirmation. The proposal remains optional and explicit, and never
saves a fill or checks the owner’s confirmation automatically.

Only `components/C1IntradayActivity.js` and `styles/card-layout.css` application
hashes change in the freeze manifest. No server, allocation, cash, holdings,
execution, cooldown, stop, risk-reference or trading behavior changes. The new
exact source inverse preserves every previously published oracle fixture and
hash. Build hooks and all four CI jobs remain intact.

Verification uses the actual component and Home/App CSS with fictional data at
phone and desktop widths, plus the existing event/receipt regressions. Chromium
rendering does not establish Safari rendering; the owner’s deployed phone view
remains the final presentation check.
