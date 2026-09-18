# September 17 provider finalization repair

Owner instruction: diagnose and fix the September 17 update rejected by production 8d31a76.

Production logs show 363 changed prior closes on the September 16 → 17 transition. September 16 was accepted at 20:02:41Z. Two immutable September 17 captures at 23:32:41Z and 23:47:40Z agree exactly on all September 16 provider OHLCV evidence. The later evidence contains 1,235 changed fields, including benchmark and held-name range fields. The prior close-only reconciler correctly did not cover those changes.

This repair permits only the reviewed book hash, dates, evidence hash and two exact archive hashes. It replays the unchanged C1 model with original and revised previous-session bars and requires identical ledger, orders, paper execution and summary. It preserves all original sessions, signals, captures, fills and capital history. It does not provide a general price tolerance or corporate-action exception.

Private accounts independently replay actual fills against both sets of bars, require identical ownership, stops, cash, pending decisions and drawdown-control state, and compare complete next-opening economic plans. Display marks may differ during the proof, but original account inputs are retained. Missing supplemental holding coverage or changed economics still reject the transition.

Validation: local reproduction using actual accepted September 16 model and the two archived September 17 captures succeeds with immutable history; missing/altered evidence rejects. Existing unexposed/held-correction and intraday actual-trade regressions pass. New private-account tests reject changed risk, orders and review identity. Full release verification also required before deployment.

Changed application files: c1BaselineReconciliation.js, c1AccountInput.js, new c1ReviewedSessionRevision.js and c1SessionRevisionReview.js. Only these entries in docs/c1-release-freeze.json are updated/added; guard/build hooks are unchanged. CI adds the focused regression. No strategy, sizing, entry/exit, UI, holdings or cash reset.

Limitation: this resolves the reviewed incident. Later provider revisions with changed ranges still need their own evidence review; this is not a claim that all future EOD revisions are automatically safe.
