import {useState} from 'react';

export default function C1ReconciliationDetails({portfolio,capitalStorageKey}) {
  const [error,setError]=useState('');
  function download() {
    setError('');
    try {
      const raw=localStorage.getItem(capitalStorageKey);
      const state=raw?JSON.parse(raw):null;
      // Allowlist fields: never export a sync key or unrelated browser storage.
      const fields=['version','portfolioSignature','observedPortfolioSignature','highWater','triggerDay','reconciliationRequired'];
      const retainedCapitalRecord=state&&Object.fromEntries(fields.filter(k=>Object.prototype.hasOwnProperty.call(state,k)).map(k=>[k,state[k]]));
      const report={contract:'c1-reconciliation-details-v1',exportedAt:new Date().toISOString(),
        enteredPortfolio:portfolio.map(p=>({symbol:p.symbol,shares:p.shares,avgCost:p.avgCost,openedAt:p.openedAt,role:p.role})),
        retainedCapitalRecord,
        note:'Entered balances and saved app risk state only. This is not brokerage-verified activity and does not change or reconcile the account.'};
      const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='C1-reconciliation-details.json';
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(e) {setError('Could not export the saved account details: '+e.message);}
  }
  return <div>
    <p>Download the saved opening balances, capital peak and current entries to identify what needs reconciliation. This leaves your account unchanged and excludes your sync key.</p>
    <button type="button" onClick={download}>Download reconciliation details</button>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
