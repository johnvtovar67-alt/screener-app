import {useEffect,useRef,useState} from 'react';

const PENDING='c1-position-context-import';
export default function C1PositionContextImport({decision,portfolio,onImport}){
 const [context,setContext]=useState(null),[status,setStatus]=useState(''),[error,setError]=useState('');
 const attempted=useRef(false),busy=useRef(false);
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
   if(raw){const value=JSON.parse(raw);if(value?.contract!=='c1-position-context-v1'||!Array.isArray(value.positions))throw new Error('Invalid purchase history link.');setContext(value);setStatus('Waiting for your saved portfolio to apply purchase history.');}
  }catch{sessionStorage.removeItem(PENDING);setError('The purchase history link could not be read.');}
 },[]);
 async function apply(){
  if(busy.current||!decision||!context)return;
  busy.current=true;attempted.current=true;setError('');setStatus('Applying purchase history…');
  try{await onImport(context);sessionStorage.removeItem(PENDING);setContext(null);setStatus('Purchase history restored.');}
  catch(e){setError(e.message);setStatus('');}
  finally{busy.current=false;}
 }
 useEffect(()=>{
  if(attempted.current||!context||!decision||!portfolio.length)return;
  const matched=context.positions.every(p=>{
   const entered=portfolio.find(r=>r.symbol===p.symbol&&r.role==='Swing'),saved=decision.positions.find(r=>r.symbol===p.symbol);
   return entered&&saved&&Math.abs(Number(entered.shares)-saved.shares)<1e-7&&Math.abs(Number(entered.avgCost)-saved.avgCost)<=.02;
  });
  if(matched)void apply();
  else setStatus('Purchase history is waiting for the matching saved holdings.');
 },[context,decision,portfolio]);
 if(!status&&!error)return null;
 return <div className="card" role="status"><p>{error||status}</p>{error&&context&&<button onClick={apply} disabled={!decision||busy.current}>Retry purchase history</button>}</div>;
}
