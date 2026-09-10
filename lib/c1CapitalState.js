// The sync boundary must preserve the identity and unresolved status of a risk
// record. Never manufacture a fresh baseline by dropping those fields.
export function cleanC1ControlState(state) {
  if(state==null)return {};
  if(typeof state!=='object'||Array.isArray(state))return {reconciliationRequired:true};
  if(Object.keys(state).length===0)return {};
  const text=v=>typeof v==='string'&&v.length>0&&v.length<=16384?v:null;
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  const highWater=typeof state.highWater==='number'&&Number.isFinite(state.highWater)&&state.highWater>=0?state.highWater:null;
  const signature=text(state.portfolioSignature);
  const validTrigger=state.triggerDay==null||day(state.triggerDay);
  const valid=state.version===2&&highWater!==null&&signature!==null&&validTrigger;
  return {
    version:state.version===2?2:null,
    highWater:highWater??0,
    triggerDay:day(state.triggerDay)?state.triggerDay:null,
    ...(signature?{portfolioSignature:signature}:{}),
    ...(text(state.observedPortfolioSignature)?{observedPortfolioSignature:state.observedPortfolioSignature}:{}),
    reconciliationRequired:state.reconciliationRequired===true||!valid,
  };
}
