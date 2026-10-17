// Exact owner-authorized adoption UI bindings; reverse for unchanged historical UI/handler comparisons.
module.exports=[
  [
    "",
    "import C1NonCashAdoption from '../components/C1NonCashAdoption';\nimport {resolveC1NonCashPortfolio} from '../lib/c1NonCashPortfolio';\n"
  ],
  [
    "",
    "      if(d.decision?.nonCashAdoptions?.length){\n        const entered=JSON.parse(localStorage.getItem(KEY)||'[]'),resolved=resolveC1NonCashPortfolio(entered,d.decision);\n        if(JSON.stringify(entered)!==JSON.stringify(resolved)){localStorage.setItem(KEY,JSON.stringify(resolved));setPortfolio(resolved);}\n      }\n"
  ],
  [
    "",
    "  async function reviewMRNAAdoption(expectedRevision){\n    await syncQueue.current;\n    if(syncDirty.current||syncStatus!=='Synced')throw new Error('Sync the saved portfolio before reviewing adoption.');\n    const key=localStorage.getItem(SYNC_KEY)||'';\n    const response=await fetch('/api/c1-account',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({operation:'review-mrna-adoption',expectedRevision})});\n    const value=await response.json();if(!response.ok)throw new Error(value.error||'Adoption review unavailable');return value.adoptionReview;\n  }\n  async function confirmMRNAAdoption(reviewId,expectedRevision){\n    setAccountBusy(true);setAccountError('');\n    try{\n      await syncQueue.current;\n      if(syncDirty.current||syncStatus!=='Synced')throw new Error('Sync the saved portfolio and review MRNA adoption again before confirming.');\n      const view=await refreshC1Account({operation:'confirm-mrna-adoption',reviewId,expectedRevision,confirmed:true});\n      if(!view?.decision?.nonCashAdoptions?.some(e=>e.id===reviewId))throw new Error('Adoption was not confirmed. Reload before retrying.');\n      const updated=resolveC1NonCashPortfolio(JSON.parse(localStorage.getItem(KEY)||'[]'),view.decision);\n      localStorage.setItem(KEY,JSON.stringify(updated));setPortfolio(updated);setResults([]);\n      if(!await pushCloudPortfolio(updated))setAccountError('MRNA adoption is saved in C1. Portfolio sync needs a retry; do not convert or buy again. Reload restores ownership from the adoption receipt.');\n    }finally{setAccountBusy(false);}\n  }\n"
  ],
  [
    "      const rows=Array.isArray(d.portfolio)?d.portfolio:[];\n",
    "      const rows=resolveC1NonCashPortfolio(Array.isArray(d.portfolio)?d.portfolio:[],accountView?.decision);\n"
  ],
  [
    "    const analysisPortfolio=Array.isArray(inputPortfolio)?inputPortfolio:portfolio;\n",
    "    let analysisPortfolio=Array.isArray(inputPortfolio)?inputPortfolio:portfolio;\n"
  ],
  [
    "    setLoading(true);setErr(\"\");let freshAccount=null,accountRefreshFailed=false;try{freshAccount=await refreshC1Account({operation:'refresh-account-inputs'});accountRefreshFailed=freshAccount===undefined;if(freshAccount)void prepareC1Execution(freshAccount);}catch(e){accountRefreshFailed=true;setErr(e.message);}setAnalysisCapitalReady(false);setHoldingsComparison(null);const rows=[];let snapshot=[],performance=[],timingBySymbol=new Map(),screenLive=false,currentProductionPolicy={};\n",
    "    setLoading(true);setErr(\"\");let freshAccount=null,accountRefreshFailed=false;try{freshAccount=await refreshC1Account({operation:'refresh-account-inputs'});accountRefreshFailed=freshAccount===undefined;if(freshAccount)void prepareC1Execution(freshAccount);}catch(e){accountRefreshFailed=true;setErr(e.message);}if(freshAccount?.decision?.nonCashAdoptions?.length)analysisPortfolio=resolveC1NonCashPortfolio(analysisPortfolio,freshAccount.decision);setAnalysisCapitalReady(false);setHoldingsComparison(null);const rows=[];let snapshot=[],performance=[],timingBySymbol=new Map(),screenLive=false,currentProductionPolicy={};\n"
  ],
  [
    "",
    "      <C1NonCashAdoption decision={accountView?.decision} portfolio={portfolio} onReview={reviewMRNAAdoption} onConfirm={confirmMRNAAdoption} busy={accountBusy||reloading||loading} ready={syncStatus==='Synced'&&!syncDirty.current}/>\n"
  ]
];
