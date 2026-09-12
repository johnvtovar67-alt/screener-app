import {useEffect,useRef,useState} from 'react';

const PENDING='c1-position-context-import';
export default function C1PositionContextImport({decision,portfolio,onImport,onRefresh,refreshing=false,ready=false}){
 const [context,setContext]=useState(null),[status,setStatus]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const busy=useRef(false);
 const matched=Boolean(context&&decision&&context.positions.every(p=>{const entered=portfolio.find(r=>r.symbol===p.symbol&&r.role==='Swing'),saved=decision.positions.find(r=>r.symbol===p.symbol);return entered&&saved&&Math.abs(Number(entered.shares)-saved.shares)<1e-7&&Math.abs(Number(entered.avgCost)-saved.avgCost)<=.02;}));
 useEffect(()=>{
  try{
   const prefix='#c1-position-context=';
   let raw=sessionStorage.getItem(PENDING);
   if(window.location.hash.startsWith(prefix)){
    const encoded=window.location.hash.slice(prefix.length);
    // Clear private evidence from the address immediately; it is never a query
    // string, an API credential or a server-side URL parameter.
    window.history.replaceState(null,'',window.location.pathname+window.location.search);
    if(encoded.length>16000)throw new Error('Purchase history link is too large.');
    raw=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));
    sessionStorage.setItem(PENDING,raw);
   }
   if(raw){const value=JSON.parse(raw);if(value?.contract!=='c1-position-context-v1'||!Array.isArray(value.positions)||!value.positions.length||value.positions.length>20||value.positions.some(p=>!p||typeof p.symbol!=='string'||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(p.symbol)||!['half','full'].includes(p.stage)||!Array.isArray(p.purchases)||!p.purchases.length||p.purchases.length>30||p.purchases.some(t=>!t||typeof t.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!Number.isSafeInteger(t.shares)||t.shares<=0||!Number.isFinite(t.cost)||t.cost<=0)))throw new Error('Invalid purchase history link.');setContext(value);setStatus('Waiting for your saved portfolio to apply purchase history.');}
  }catch{sessionStorage.removeItem(PENDING);setError('The purchase history link could not be read.');}
 },[]);
 async function apply(){
  if(busy.current||!ready||!matched)return;
  busy.current=true;setWorking(true);setError('');setStatus('Applying purchase history…');
  try{await onImport(context);sessionStorage.removeItem(PENDING);setContext(null);setStatus('Purchase history restored.');}
  catch(e){setError(e.message);setStatus('');}
  finally{busy.current=false;setWorking(false);}
 }
 useEffect(()=>{
  if(context)setStatus(ready&&matched?'Purchase history is ready to restore.':'Waiting for the matching saved portfolio.');
 },[context,ready,matched]);
 if(!status&&!error)return null;
 return <section className="card" aria-label="Restore purchase history"><p role="status">{error||status}</p>{context&&<>
  <ul>{context.positions.map(p=><li key={p.symbol}><b>{p.symbol}</b> · {p.stage} position · {(p.purchases||[]).map(t=>`${t.shares} shares on ${t.date}`).join('; ')}</li>)}</ul>
  <button onClick={apply} disabled={!ready||!matched||working}>{working?'Applying…':'Apply purchase history'}</button>
  {(!decision||error)&&onRefresh&&<button onClick={onRefresh} disabled={refreshing||working}>{refreshing?'Refreshing account…':'Refresh saved account'}</button>}
 </>}</section>;
}
