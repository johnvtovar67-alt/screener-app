// Date-only account values are calendar dates, not UTC instants.
export function portfolioDateDisplay(value){
 if(!value)return '—';
 const day=typeof value==='string'?value.match(/^\d{4}-\d{2}-\d{2}(?=$|T)/)?.[0]:null;
 const date=new Date(day?day+'T12:00:00Z':value);
 if(day&&(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day))return '—';
 return Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'—';
}
