// Presentation only. No recommendation or lifecycle state is changed.
const HOLD_STYLE=Object.freeze({display:'inline-flex',alignItems:'center',justifyContent:'center',boxSizing:'border-box',height:26,padding:'0 9px',fontSize:12,lineHeight:'24px',fontWeight:800,borderRadius:999,whiteSpace:'nowrap'});
const isHold=label=>typeof label==='string'&&label.trim().toUpperCase()==='HOLD';
export const c1HoldPillLabel=label=>isHold(label)?'HOLD':label;
export const c1HoldPillStyle=label=>isHold(label)?HOLD_STYLE:undefined;
