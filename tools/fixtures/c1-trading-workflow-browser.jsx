import Adoption from '../../components/C1NonCashAdoption';
import {resolveC1NonCashPortfolio} from '../../lib/c1NonCashPortfolio';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Cash from '../../components/C1BrokerageCash';
import Opportunities from '../../components/C1AccountOpportunities';
import Activity from '../../components/C1IntradayActivity';
function Demo(){
 const [view,setView]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function request(body){
  const response=await fetch('/api/c1-account',{method:body?'POST':'GET',headers:{'content-type':'application/json',authorization:'Bearer offline_workflow_fixture_key_000001'},...(body?{body:JSON.stringify(body)}:{})});
  const value=await response.json();window.__C1_TEST_CLOCK=value.testClock;window.__C1_LAST_VIEW=value;
  if(!response.ok)throw Error(value.error);setView(value);return value;
 }
 async function prepare(){return request({operation:'prepare-execution'});}
 async function load(kind){setBusy(true);setError('');try{if(kind)await fetch('/fixture-reset',{method:'POST',body:kind});await request();await prepare();}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{load();},[]);
 async function cash(balance,revision){setBusy(true);setError('');try{await request({operation:'update-brokerage-cash',brokerageCash:balance,expectedRevision:revision});await prepare();}catch(e){setError(e.message);throw e;}finally{setBusy(false);}}
 async function trade(ticket,revision){setBusy(true);setError('');try{const value=await request({operation:'record-intraday',ticket,expectedRevision:revision});return {ticket:value.intradaySession.tickets.find(t=>t.id===ticket.id),view:value};}catch(e){setError(e.message);throw e;}finally{setBusy(false);}}
 async function reviewAdoption(expectedRevision){const r=await fetch('/api/c1-account',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer offline_workflow_fixture_key_000001'},body:JSON.stringify({operation:'review-mrna-adoption',expectedRevision})});const v=await r.json();if(!r.ok)throw Error(v.error);return v.adoptionReview;}
 async function confirmAdoption(reviewId,expectedRevision){return request({operation:'confirm-mrna-adoption',reviewId,expectedRevision,confirmed:true});}
 const adoptedPortfolio=view?resolveC1NonCashPortfolio(view.testPortfolio||[],view.decision):[];
 const props=view?{...view,executionDecision:view.executionDecision||view.decision,screenRows:view.testScreenRows,positionRows:view.testScreenRows,screenCurrent:true}:null;
 return <main><h1>Deterministic C1 workflow demonstration</h1><p>TEST ACCOUNT ONLY · production components and API handler · isolated memory storage · no live account or brokerage writes</p>
  <nav>{[['buy','Load Buy example'],['missing','Load MRNA verification example'],['sell-missing','Load DELL stop example'],['capacity','Load fourth-position example'],['adoption','Load Core MRNA adoption example']].map(([id,label])=><button key={id} disabled={busy} onClick={()=>load(id)}>{label}</button>)}<button disabled={busy} onClick={async()=>{await fetch('/fixture-quote',{method:'POST',body:JSON.stringify({symbol:'MRNA',price:75})});await load();}}>Verify fourth-position stop</button><button disabled={busy} onClick={async()=>{await fetch('/fixture-adoption-stop',{method:'POST'});await load();}}>Verify adopted MRNA stop</button></nav>
  {error&&<p role="alert">{error}</p>}
  {view&&<><Adoption decision={view.decision} portfolio={adoptedPortfolio} onReview={reviewAdoption} onConfirm={confirmAdoption} ready={!busy} busy={busy}/><Cash decision={view.decision} onSave={cash} busy={busy}/><Opportunities {...props} view="portfolio"/><Opportunities {...props}/>
   <section aria-label="Recorded test holdings"><h2>Recorded test holdings</h2>{view.decision.positions.map(p=><p key={p.symbol}>{p.symbol}: {p.shares} recorded shares</p>)}</section>
   {view.intradaySession&&<Activity session={view.intradaySession} onSave={trade} busy={busy}/>}</>}
 </main>;
}
createRoot(document.getElementById('root')).render(<Demo/>);
