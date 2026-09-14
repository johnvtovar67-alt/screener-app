// Date-only account values are calendar dates, not UTC instants.
export function portfolioDateDisplay(value){
 if(!value)return '—';
 const dateOnly=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
 const date=new Date(dateOnly?value+'T12:00:00':value);
 return Number.isFinite(date.getTime())?date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—';
}
