# Cash display cleanup

Owner requested cleanup of the long floating-point cash quantity in the portfolio entry chip. Render cash-equivalent positions as their currency value using the existing money formatter. Equity share quantities keep their existing display. This changes presentation only: no stored values, trades, balances, strategy or exit rules are changed.

Only pages/index.js and its corresponding release-manifest hash are changed in application code. The freeze guard and build hooks are unchanged. Verified that 14313.999999999996 at a unit price of 1 displays $14,314.00. Full existing CI remains required before deployment.
