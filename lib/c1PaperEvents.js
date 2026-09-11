import {restoreC1SleeveAccounting,applyC1SleeveFill,createC1SleeveAccounting} from './c1SleeveAccounting';
export const C1_EVENT_PRICE_BASIS='model-fill-events-v1';
// Frozen simulator execution phases. Unknown reasons cannot acquire a guessed time.
export function c1ModelEventPhase(trade){
 if(trade.side==='buy'&&['Buy','Strong Buy'].includes(trade.reason))return 3;
 if(trade.side!=='sell')throw new Error('Unknown model event');
 if(['delisting-outcome','universe-removal-zero-recovery','universe-removal'].includes(trade.reason))return 0;
 if(['rank-deterioration','relative-strength-break','trend-relative-break','time-stop','bounded-review-expiry','exit','reduce','trim'].includes(trade.reason))return 1;
 if(trade.reason==='portfolio-drawdown-stop')return 2;
 if(['initial-stop','invalidation-stop','ratcheted-stop','profit-trailing-stop'].includes(trade.reason))return 4;
 throw new Error('Unsupported model execution reason: '+trade.reason);
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function whole(state){const out={};for(const book of Object.values(state.sleeves))for(const [s,n] of Object.entries(book.positions))out[s]=(out[s]||0)+n;return Object.fromEntries(Object.entries(out).map(([s,n])=>[s,Math.floor(n)]).filter(([,n])=>n));}
function equalHoldings(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].every(s=>(a[s]||0)===(b[s]||0));}
function replayAccount(model,history){
 if(!Array.isArray(history)||history.length!==model.fills.length)throw new Error('Complete paper event history required');
 const originals=new Map(model.fills.map(f=>[f.id,f])),seen=new Set();
 let state=createC1SleeveAccounting(model.initialCapital,model.startDate),cash=model.initialCapital,positions={},lastKey='';
 for(const m of history){
  const f=m.fill;if(!f||seen.has(f.id)||!same(f,originals.get(f.id))||f.fee!==0)throw new Error('Paper event history mismatch');
  seen.add(f.id);const key=f.date+':'+c1ModelEventPhase({side:f.side,reason:m.reason});
  if(key<lastKey)throw new Error('Paper event order changed');lastKey=key;
  state=applyC1SleeveFill(state,f);const target=whole(state),delta=(target[f.symbol]||0)-(positions[f.symbol]||0);
  cash-=delta*f.price;if(!Number.isFinite(cash)||cash<0)throw new Error('Unfunded paper event history');positions=target;
 }
 for(const id of Object.keys(model.sleeves))if(!same(state.fills.filter(f=>f.sleeve===id),model.fills.filter(f=>f.sleeve===id)))throw new Error('Sleeve event order changed');
 return {cash,positions};
}
export function initializeC1EventAccount(before){const state=restoreC1SleeveAccounting(before);if(state.fills.length)throw new Error('Cannot adopt existing holdings or prior fills');return {kind:'c1-paper-events',priceBasis:C1_EVENT_PRICE_BASIS,initialCapital:state.initialCapital,startDate:state.startDate,cash:state.initialCapital,positions:{},eventHistory:[],modelHistory:'[]'};}
export function planC1PaperEvents({before,after,account,eventMetadata}){
 const blocked=reason=>({status:'blocked',reason,executable:false,orders:[]});
 try{
  let state=restoreC1SleeveAccounting(before);const next=restoreC1SleeveAccounting(after);
  if(state.startDate!==next.startDate||state.initialCapital!==next.initialCapital||!same(state.fills,next.fills.slice(0,state.fills.length)))return blocked('Model history changed');
  if(account?.kind!=='c1-paper-events'||account.priceBasis!==C1_EVENT_PRICE_BASIS||account.startDate!==state.startDate||account.initialCapital!==state.initialCapital||account.modelHistory!==JSON.stringify(state.fills))return blocked('Execution account basis/history requires reconciliation; original preserved');
  if(!Number.isFinite(account.cash)||account.cash<0||!account.positions||Array.isArray(account.positions)||!Object.values(account.positions).every(n=>Number.isSafeInteger(n)&&n>=0)||!equalHoldings(account.positions,whole(state)))return blocked('Cash or holdings require reconciliation');
  const replayed=replayAccount(state,account.eventHistory);
  if(Math.abs(replayed.cash-account.cash)>1e-7||!equalHoldings(replayed.positions,account.positions))return blocked('Cached execution balances do not match event history');
  const changes=next.fills.slice(state.fills.length);
  if(!changes.length)return {status:'unchanged',executable:false,orders:[],nextAccount:account};
  if(new Set(changes.map(f=>f.date)).size!==1)return blocked('Process one execution session at a time');
  if(!Array.isArray(eventMetadata)||eventMetadata.length!==changes.length)return blocked('Complete execution event metadata required');
  const metadata=new Map(eventMetadata.map(m=>[m.id,m]));if(metadata.size!==changes.length)return blocked('Duplicate execution event metadata');
  const events=changes.map((f,index)=>{const m=metadata.get(f.id);if(!m||!same(m.fill,f))throw new Error('Execution event identity mismatch');if(f.fee!==0)throw new Error('Unsupported nonzero model fee');return {fill:f,reason:m.reason,phase:c1ModelEventPhase({side:f.side,reason:m.reason}),index};});
  // A sleeve's sequence must be compatible with the frozen execution phases.
  const last=new Map();for(const e of events){if((last.get(e.fill.sleeve)??-1)>e.phase)throw new Error('Inconsistent sleeve execution sequence');last.set(e.fill.sleeve,e.phase);}
  events.sort((a,b)=>a.phase-b.phase||a.index-b.index);
  let cash=account.cash,positions={...account.positions};const orders=[];
  for(const {fill,phase} of events){
   state=applyC1SleeveFill(state,fill);const target=whole(state),delta=(target[fill.symbol]||0)-(positions[fill.symbol]||0);
   if(delta){
    if((delta>0)!==(fill.side==='buy'))throw new Error('Event side mismatch');
    // Model fill already includes slippage: never charge it a second time.
    cash-=delta*fill.price;if(!Number.isFinite(cash)||cash<0)throw new Error('Whole-share event cannot be funded; original preserved');
    orders.push({modelEventId:fill.id,sessionDate:fill.date,phase,symbol:fill.symbol,side:fill.side,shares:Math.abs(delta),price:fill.price,cashAfter:cash,executable:false});
   }
   positions=target;
  }
  if(!equalHoldings(positions,whole(next)))throw new Error('Ending holdings mismatch');
  return {status:'proposed',executable:false,orders,nextAccount:{...account,cash,positions,eventHistory:[...account.eventHistory,...events.map(e=>({fill:e.fill,reason:e.reason}))],modelHistory:JSON.stringify(next.fills)},
   limitation:'Retrospective synthetic whole-share mapping of frozen model events. Phase order is model semantics, not observed intraday timestamps or brokerage fills. No live order authorization.'};
 }catch(error){return blocked(error.message);}
}
