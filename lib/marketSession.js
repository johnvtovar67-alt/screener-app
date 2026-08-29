const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const dateKey=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const keyDate=key=>{const[y,m,d]=String(key||'').split('-').map(Number);return new Date(Date.UTC(y,m-1,d));};
const addKeyDays=(key,days)=>{const d=keyDate(key);d.setUTCDate(d.getUTCDate()+days);return dateKey(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());};
const weekdayOf=key=>keyDate(key).getUTCDay();
const nthWeekday=(year,month,weekday,n)=>{const first=new Date(Date.UTC(year,month-1,1)),offset=(weekday-first.getUTCDay()+7)%7;return dateKey(year,month,1+offset+(n-1)*7);};
const lastWeekday=(year,month,weekday)=>{const last=new Date(Date.UTC(year,month,0)),offset=(last.getUTCDay()-weekday+7)%7;return dateKey(year,month,last.getUTCDate()-offset);};
const observedFixed=(year,month,day)=>{const key=dateKey(year,month,day),w=weekdayOf(key);return w===6?addKeyDays(key,-1):w===0?addKeyDays(key,1):key;};
function easterSunday(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;return dateKey(year,month,day);}
function marketHolidays(year){
  const out=new Set();
  for(const y of[year-1,year,year+1]){
    out.add(observedFixed(y,1,1));out.add(nthWeekday(y,1,1,3));out.add(nthWeekday(y,2,1,3));out.add(addKeyDays(easterSunday(y),-2));out.add(lastWeekday(y,5,1));
    if(y>=2022)out.add(observedFixed(y,6,19));
    out.add(observedFixed(y,7,4));out.add(nthWeekday(y,9,1,1));out.add(nthWeekday(y,11,4,4));out.add(observedFixed(y,12,25));
  }
  return out;
}
export function isUsMarketSessionDay(key){const y=Number(String(key||'').slice(0,4)),w=weekdayOf(key);return Number.isFinite(y)&&w!==0&&w!==6&&!marketHolidays(y).has(key);}
export function previousMarketSessionDay(key){let candidate=addKeyDays(key,-1);for(let i=0;i<10;i++){if(isUsMarketSessionDay(candidate))return candidate;candidate=addKeyDays(candidate,-1);}return candidate;}
export function easternMarketClock(value=new Date()){
  const now=value instanceof Date?value:new Date(value);if(!Number.isFinite(now.getTime()))return null;
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now),pick=t=>parts.find(p=>p.type===t)?.value;
    const key=dateKey(Number(pick('year')),Number(pick('month')),Number(pick('day'))),hour=Number(pick('hour'))%24,minute=Number(pick('minute')),second=Number(pick('second'));
    return{key,weekday:pick('weekday'),hour,minute,second,minutes:hour*60+minute,isSessionDay:isUsMarketSessionDay(key)};
  }catch{return null;}
}
export function marketObservationSessionDay(value=new Date()){
  const clock=easternMarketClock(value);if(!clock)return null;
  return clock.isSessionDay&&clock.minutes>=9*60+30?clock.key:previousMarketSessionDay(clock.key);
}

export function marketSessionDistance(fromKey,toKey){
  const from=String(fromKey||''),to=String(toKey||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from)return null;
  let cursor=from,count=0;for(let i=0;i<4000&&cursor<to;i++){cursor=addKeyDays(cursor,1);if(isUsMarketSessionDay(cursor))count++;}
  return cursor===to?count:null;
}

export function marketExecutionState(value=new Date()){
  const clock=easternMarketClock(value);if(!clock)return{isOpen:false,phase:'unknown',sessionDay:null,clock:null};
  const start=9*60+30,end=16*60,isOpen=clock.isSessionDay&&clock.minutes>=start&&clock.minutes<end;
  const phase=isOpen?'open':!clock.isSessionDay?'closed':clock.minutes<start?'premarket':'after-hours';
  return{isOpen,phase,sessionDay:marketObservationSessionDay(value),clock};
}

export function latestCompletedMarketSessionDay(value=new Date()){
  const clock=easternMarketClock(value);if(!clock)return null;
  return clock.isSessionDay&&clock.minutes>=16*60?clock.key:previousMarketSessionDay(clock.key);
}

export function marketSessionProgress(now=new Date()){
  const state=marketExecutionState(now),clock=state.clock;if(!clock)return 1;
  if(!clock.isSessionDay)return 1;
  const start=9*60+30,end=16*60;
  if(clock.minutes<start)return null;
  if(clock.minutes>=end)return 1;
  return clamp((clock.minutes-start)/(end-start),.01,1);
}

export function expectedVolumeFraction(progress){
  if(progress===null)return null;
  if(progress>=1)return 1;
  // Approximate the normal U-shaped US equity volume curve without overreacting near the open.
  return clamp(.8*progress+.2*Math.sqrt(progress),.04,1);
}

export function pacedRelativeVolume(stock={},now=new Date()){
  const v=Number(stock?.volume??stock?.vol),avg=Number(stock?.avgVolume??stock?.averageVolume??stock?.avgVolume30Day);
  if(!Number.isFinite(v)||!Number.isFinite(avg)||v<=0||avg<=0)return null;
  const expected=expectedVolumeFraction(marketSessionProgress(now));
  if(expected===null)return null;
  return (v/avg)/expected;
}

export function projectedFullDayVolume(stock={},now=new Date()){
  const v=Number(stock?.volume??stock?.vol);
  if(!Number.isFinite(v)||v<=0)return v;
  const expected=expectedVolumeFraction(marketSessionProgress(now));
  if(expected===null||expected>=1)return v;
  return v/expected;
}
