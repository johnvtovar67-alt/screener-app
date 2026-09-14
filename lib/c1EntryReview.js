// Presentation of recorded account-gate outcomes; never generates an order.
const messages={
 'position-limit':['All three position slots are occupied.','A C1 exit frees a slot and this stock remains eligible.'],
 'portfolio-cooldown':['The portfolio loss-control pause is active.','The existing cooldown ends and entry checks pass.'],
 'sector-position-limit':['The sector already has the maximum number of positions.','Sector exposure has room within the existing limit.'],
 'issuer-concentration-limit':['The issuer concentration limit blocks this entry.','Issuer exposure falls within the existing limit.'],
 'entry-gap-limit':['The opening gap exceeds the C1 entry limit.','A later session passes the opening-gap check.'],
 'entry-invalidated-at-open':['The opening price breached the entry stop.','A later C1 signal and opening price pass the stop check.'],
 'existing-stop-or-exit':['An existing stop or pending risk exit blocks adding.','The exit condition is resolved; no averaging down into a triggered stop.'],
 'trade-size-limit':['Sizing limits leave less than the minimum permitted trade.','A qualifying quantity fits the existing cash and exposure limits.'],
 'whole-share-limit':['The permitted amount is too small for one whole share.','A qualifying whole share fits the permitted amount.'],
 'insufficient-cash':['Available allocation cash cannot fund this quantity.','Sufficient cash is available and the stock still qualifies.'],
 'portfolio-allowance-block':['The portfolio exposure check blocked this entry.','Exposure returns within the existing limits.'],
 'portfolio-contribution-gate':['The portfolio contribution check blocked this entry.','The existing contribution check passes.'],
 'target-complete':['The recorded purchase target is complete.','No addition is needed toward that target.'],
 'purchase-target-missing':['No saved purchase target or partial-entry record is available.','The screener needs the original target or recorded partial-entry history to calculate a remainder.'],
 'not-in-entry-queue':['Not in the current C1 entry queue.','Qualifies for a future C1 entry queue and passes opening checks.'],
 'completion-closed':['A sale closed the previous purchase-completion plan.','A separate qualifying C1 entry is required.'],
 'already-held':['This allocation already holds the stock.','Only a qualified, recorded remainder can be added.'],
 'universe-removal':['The stock left the observed C1 entry universe.','Entry-universe eligibility is restored.'],
 'delisted':['The stock is marked delisted.','No new purchase is proposed.']
};
export function c1EntryReviewText(reviews=[],context){
 const reasons=[...new Set(reviews.map(r=>r.reason))];
 if(!reasons.length)return {why:'No detailed entry-check result is available.',next:'Refresh for the account opening review.'};
 const rows=reasons.map(reason=>reason==='purchase-target-missing'&&context?.stage==='full'?messages['target-complete']:messages[reason]||['An entry check did not approve a quantity.','Refresh for a complete account review.']);
 return {why:[...new Set(rows.map(r=>r[0]))].join(' '),next:[...new Set(rows.map(r=>r[1]))].join(' ')};
}
