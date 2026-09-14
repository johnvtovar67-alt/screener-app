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

export function c1WatchPresentation({rows=[],plan,ready=false,waitingReason}={}){
 const reviews=rows.map(row=>({row,review:ready?c1EntryReviewText((plan?.entryReviews||[]).filter(r=>r.symbol===row.symbol)):{why:waitingReason||'Opening review unavailable.',next:'Refresh for the account opening review.'}}));
 const shared=reviews.length>0&&reviews.every(r=>r.review.why===reviews[0].review.why&&r.review.next===reviews[0].review.next)?reviews[0].review:null;
 return {shared,rows:reviews.map(({row,review},index)=>{
  const e=row.entryEvidence||{};
  return {symbol:row.symbol,priority:index+1,sector:e.sector||'Sector unavailable',momentum:Number.isFinite(e.momentumScore)&&e.momentumScore>=0&&e.momentumScore<=100?e.momentumScore.toFixed(1)+'/100':'Unavailable',close:Number.isFinite(e.close)&&e.close>0?'$'+e.close.toFixed(2):'Unavailable',review};
 })};
}

// Stock ratings and account instructions have different sources. Ratings never
// create quantities; those come only from the current checked order list.
export function c1OpportunityPresentation({decision,buys=[],plan,ready=false,waitingReason}={}){
 if(!decision?.current||decision.accountMismatch)return {tiles:[],watch:[]};
 const rows=decision.opportunities||[],tiles=[],watch=[];
 for(const row of rows){
  if(!['Buy','Strong Buy'].includes(row.rating)){watch.push(row);continue;}
  const position=decision.positions.find(p=>p.symbol===row.symbol);
  const order=ready?buys.find(o=>o.symbol===row.symbol):null;
  const reviews=(plan?.entryReviews||[]).filter(r=>r.symbol===row.symbol);
  const full=position&&(position.entryContext?.stage==='full'||(reviews.length>0&&reviews.every(r=>r.reason==='target-complete')));
  let action,detail;
  if(position?.action==='Exit candidate'||position?.exits?.length){action='Review exit';detail='An existing exit takes priority. See Portfolio actions.';}
  else if(order){action=position?'Add':'Buy';detail=`${action} ${order.shares} ${order.shares===1?'share':'shares'}.`;}
  else if(full){action='Hold';detail='Full position — no additional purchase.';}
  else {action=position?'Hold':'No purchase';detail=ready?c1EntryReviewText(reviews,position?.entryContext).why:(waitingReason||'Refresh for current account and opening checks.');}
  tiles.push({...row,accountAction:action,detail,order:order&&['Add','Buy'].includes(action)?order:null});
 }
 return {tiles,watch};
}
