// Presentation only: inherit the same native .pill geometry as WATCH/SELL.
// No recommendation, lifecycle state, color or other status is changed.
const isHold=label=>typeof label==='string'&&label.trim().toUpperCase()==='HOLD';
export const c1HoldPillLabel=label=>isHold(label)?'HOLD':label;
export const c1HoldPillStyle=_label=>undefined;
