// Shared immutable policy configuration; safe for both server and browser.
// Owner explicitly approved this separate investment-risk rule on November 10,
// 2026. It authorizes software behavior, never brokerage execution or fills.
export const C1_OPERATIONAL_RISK_MODE='next-open-after-verified-liquidation';
export const C1_OPERATIONAL_RISK_DECISION=Object.freeze({
 status:'approved',mode:C1_OPERATIONAL_RISK_MODE,approvedOn:'2026-11-10',
 reason:'Once per confirmed completed loss-exit episode, establish the operational reference at the next eligible exchange opening using net post-exit equity; preserve historical peaks and total drawdown reporting.'
});
