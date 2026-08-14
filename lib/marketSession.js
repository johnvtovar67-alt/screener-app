const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));

export function marketSessionProgress(now=new Date()){
  try{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(now);
    const pick=t=>parts.find(p=>p.type===t)?.value;
    const weekday=pick('weekday');
    if(['Sat','Sun'].includes(weekday))return 1;
    const hour=Number(pick('hour')),minute=Number(pick('minute'));
    const mins=hour*60+minute,start=9*60+30,end=16*60;
    if(mins<start)return null;
    if(mins>=end)return 1;
    return clamp((mins-start)/(end-start),.01,1);
  }catch{return 1;}
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
