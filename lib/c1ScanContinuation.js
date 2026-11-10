// Read-only bounded continuation. It retains one caller-owned publication
// frame, never repeats a financial POST, and never equates an unfinished scan
// with an empty eligible universe. A stalled or expired scan stays incomplete.
export async function continueC1ReadOnlyScan({initial,next,scanOf,isCurrent=()=>true,now=()=>Date.now(),budgetMs=90000}={}){
 const deadline=now()+budgetMs;let result=initial,lastIncomplete=initial,identity=null,completed=-1,total=null,passes=0;
 while(isCurrent()){
  const scan=scanOf(result);
  if(!scan)return result;
  const count=scan.completed??scan.scanned;
  if(typeof scan.sourceIdentity!=='string'||!scan.sourceIdentity||!Number.isSafeInteger(scan.total)||scan.total<0||!Number.isSafeInteger(count)||count<0||count>scan.total)return lastIncomplete;
  if(identity!==null&&(scan.sourceIdentity!==identity||scan.total!==total))throw new Error('The accepted scan source changed during verification. Refresh the complete account review.');
  if(scan.complete===true&&count!==scan.total)throw new Error('The scan complete receipt has incomplete progress.');
  if(scan.complete!==false)return count===scan.total&&count>=completed?result:lastIncomplete;
  if(count<=completed||now()>=deadline)return result;
  identity=scan.sourceIdentity;completed=count;total=scan.total;lastIncomplete=result;
  if(!isCurrent())return result;
  const previous=result;
  result=await next({scan,pass:++passes,isCurrent,deadline});
  if(!isCurrent())return previous;
 }
 return result;
}
