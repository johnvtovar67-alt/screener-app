import {restoreC1SleeveAccounting,proposeC1WholeShareReconciliation} from './c1SleeveAccounting';

export const C1_PAPER_EXECUTION_PRICE_BASIS = 'session-open-v1';

// This maps an already-produced model transition. It never selects securities,
// changes sleeve rules, infers ownership of legacy holdings, or authorizes orders.
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function aggregate(state){const out={};for(const book of Object.values(state.sleeves))for(const [s,n] of Object.entries(book.positions))out[s]=(out[s]||0)+n;return Object.fromEntries(Object.entries(out).map(([s,n])=>[s,Math.floor(n)]).filter(([,n])=>n>0));}
function holdingsEqual(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].every(s=>(a[s]||0)===(b[s]||0));}
export function planC1PaperTransition({before,after,account,prices,slippageBps=12,commissionPerOrder=0}){
 const blocked=reason=>({scope:'c1-paper-transition',status:'blocked',reason,executable:false,orders:[]});
 try{
  if(account?.priceBasis!==C1_PAPER_EXECUTION_PRICE_BASIS)return blocked('Paper execution price basis changed; preserve and reconcile the original account');
  const prior=restoreC1SleeveAccounting(before),next=restoreC1SleeveAccounting(after);
  if(prior.initialCapital!==next.initialCapital||prior.startDate!==next.startDate||next.fills.length<prior.fills.length||!same(prior.fills,next.fills.slice(0,prior.fills.length)))return blocked('Model history changed');
  if(account?.kind!=='c1-paper-execution'||account.initialCapital!==prior.initialCapital||account.modelFillCount!==prior.fills.length||account.modelHistory!==JSON.stringify(prior.fills))return blocked('Execution account is not reconciled to this model history');
  if(!account.positions||Array.isArray(account.positions)||!Object.values(account.positions).every(n=>Number.isSafeInteger(n)&&n>=0)||!holdingsEqual(account.positions,aggregate(prior)))return blocked('Partial fills or holdings differences require reconciliation');
  if(!Number.isFinite(account.cash)||account.cash<0)return blocked('Invalid execution cash');
  const changes=next.fills.slice(prior.fills.length);
  // Catch skipped execution sessions rather than liquidating into a later target.
  if(new Set(changes.map(f=>f.date)).size>1)return blocked('Process one model execution session at a time');
  if(!changes.length)return {scope:'c1-paper-transition',status:'unchanged',executable:false,orders:[],projectedCash:account.cash,nextAccount:account};
  // Opening quotes cannot represent intraday stop fills or mixed-price events.
  // Do not silently replace a model fill with an opening/closing valuation.
  if(changes.some(f=>{
    const quote=prices?.[f.symbol];
    const expected=quote*(1+(f.side==='buy'?1:-1)*slippageBps/10000);
    return !Number.isFinite(quote)||quote<=0||!Number.isFinite(expected)||Math.abs(f.price-expected)>1e-7*Math.max(1,Math.abs(f.price));
  }))return blocked('Model fills do not match supplied opening prices; event-level execution reconciliation required');
  const proposal=proposeC1WholeShareReconciliation({state:next,prices,heldShares:account.positions,cash:account.cash,slippageBps,commissionPerOrder});
  if(!proposal.fundingPass)return blocked('Complete model transition cannot be funded at supplied execution prices');
  return {scope:'c1-paper-transition',status:'proposed',executable:false,orders:proposal.orders,projectedCash:proposal.projectedCash,
   modelSession:changes[0].date,nextAccount:{kind:'c1-paper-execution',priceBasis:C1_PAPER_EXECUTION_PRICE_BASIS,initialCapital:next.initialCapital,cash:proposal.projectedCash,positions:aggregate(next),modelFillCount:next.fills.length,modelHistory:JSON.stringify(next.fills)},
   limitation:'Retrospective opening-price paper mapping of model fills, not a next-session signal. nextAccount assumes every proposed fill at its estimated price; partial or actual fills must be reconciled separately.'};
 }catch(error){return blocked(error.message);}
}
export function initializeC1PaperExecution(model){
 const state=restoreC1SleeveAccounting(model);
 if(state.fills.length)throw new Error('Initialize before the first model fill; existing holdings cannot be adopted');
 return {kind:'c1-paper-execution',priceBasis:C1_PAPER_EXECUTION_PRICE_BASIS,initialCapital:state.initialCapital,cash:state.initialCapital,positions:{},modelFillCount:0,modelHistory:'[]'};
}
