// Bind the actual Home helper with isolated state for extracted client tests.
const assert=require('node:assert/strict');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const {c1CoreHoldingsSignature}=createResearchModuleLoader(process.cwd()).load('lib/c1AccountPortfolio.js');

function bindC1CoreCashClient(box,page){
 const start=page.indexOf('  function observeCoreHoldingsEdit('),end=page.indexOf('  function publishC1AccountState(',start);
 assert(start>=0&&end>start);
 let pending=false;
 box.coreCashEditOwner={current:0};
 box.setCoreCashReviewPending=value=>{pending=value;};
 Object.defineProperty(box,'coreCashReviewPending',{get:()=>pending});
 box.syncDirty??={current:false};
 box.syncQueue??={current:Promise.resolve()};
 box.observeCoreHoldingsEdit=new Function('coreCashEditOwner','setCoreCashReviewPending','c1CoreHoldingsSignature',
  page.slice(start,end)+';return observeCoreHoldingsEdit;')(box.coreCashEditOwner,box.setCoreCashReviewPending,c1CoreHoldingsSignature);
}
module.exports={bindC1CoreCashClient};
