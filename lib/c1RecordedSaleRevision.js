import {createHash} from 'node:crypto';
import {restoreC1SleeveAccounting,valueC1SleeveAccounting} from './c1SleeveAccounting';
import {c1CombinedPortfolio} from './c1CombinedPortfolio';
import {C1_FROZEN_OPTIONS} from './c1FrozenOptions';
import {createC1SimulatorPhases} from './c1SimulatorPhases';
import {marketSessionDistance} from './marketSession';

const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const price=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const {tradePrice}=createC1SimulatorPhases({number:(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback});
const ids=['base','cooldown15','sector40'];
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const recordedDigest=value=>createHash('sha256').update(canonical(value)).digest('hex');
function validRevisionBars(previous,corrected,same){
 if(!Array.isArray(previous)||!Array.isArray(corrected)||previous.length!==corrected.length)return false;
 return previous.every((old,index)=>{const next=corrected[index];if(!next||old.symbol!==next.symbol)return false;
  const strip=row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['open','high','low','close','volume'].includes(key)));
  return same(strip(old),strip(next))&&['open','high','low','close'].every(key=>price(next[key]))&&
   Number.isFinite(next.volume)&&next.volume>=0&&next.low<=Math.min(next.open,next.close)&&next.high>=Math.max(next.open,next.close);
 });
}
function closeSaleChange(fill,revised,oldBar,newBar){
 const config=C1_FROZEN_OPTIONS[fill.sleeve];
 return fill.side==='sell'&&config&&oldBar&&newBar&&price(oldBar.close)&&price(newBar.close)&&
  ['open','high','low'].every(key=>oldBar[key]===newBar[key])&&oldBar.close!==newBar.close&&
  fill.price===tradePrice(oldBar.close,'sell',config.slippageBps)&&revised.price===tradePrice(newBar.close,'sell',config.slippageBps);
}

// General close-finalization protocol for immutable, already recorded virtual
// sales. Reconciliation has already repeat-confirmed these corrected bars.
// Return the original model only; no counterfactual cash or price is booked.
export function proveC1RecordedSaleRevision(prior,input,original,corrected,correctedPrices,digest){
 try{
  const same=(a,b)=>digest(a)===digest(b),{recordHash,...saved}=prior,previous=prior.model.sessions.at(-1);
  if(!hash(recordHash)||digest(saved)!==recordHash||prior.universe!=='sp500'||prior.model.ledger?.kind!=='virtual-model'||
   marketSessionDistance(previous.date,input.sourceSessionDate)!==1||
   !same(original.sessions.slice(0,-1),prior.model.sessions)||original.sessions.length!==prior.model.sessions.length+1||
   !same(original.sessions.at(-1),input.session)||!same(original.ledger,prior.model.ledger)||
   !same(restoreC1SleeveAccounting(original.ledger),original.ledger)||
   !same(original.paperExecution,prior.model.paperExecution)||original.paperExecutionStatus?.status!=='unchanged'||
   !validRevisionBars(previous.prices,correctedPrices,same)||
   !Array.isArray(corrected.ledger?.fills)||corrected.ledger.fills.length!==original.ledger.fills.length)return null;
  const proposed=copy(original.ledger),changes=[];
  for(let index=0;index<proposed.fills.length;index++){
   const fill=proposed.fills[index],candidate=corrected.ledger.fills[index];
   if(same(fill,candidate))continue;
   if(!candidate||!same({...fill,price:candidate.price},candidate)||fill.date!==previous.date||
    !closeSaleChange(fill,candidate,previous.prices.find(p=>p.symbol===fill.symbol),correctedPrices.find(p=>p.symbol===fill.symbol)))return null;
   changes.push({index,id:fill.id,sleeve:fill.sleeve,symbol:fill.symbol,shares:fill.shares,
    recordedPrice:fill.price,observedPrice:candidate.price,priceField:'close'});
   fill.price=candidate.price;
  }
  if(!changes.length)return null;
  const expectedLedger=restoreC1SleeveAccounting(proposed);
  for(const id of ids)if(!same(original.ledger.sleeves[id].positions,expectedLedger.sleeves[id].positions))return null;
  const expectedStatus={...original.paperExecutionStatus,status:'blocked',reason:'Model history changed'},
   marks=Object.fromEntries(input.session.prices.map(p=>[p.symbol,p.close])),valued=valueC1SleeveAccounting(expectedLedger,marks);
  const expected=copy(original);expected.sessions[expected.sessions.length-2].prices=copy(correctedPrices);
  expected.ledger=expectedLedger;expected.paperExecutionStatus=expectedStatus;
  expected.summary={...expected.summary,cash:valued.cash,equity:valued.equity,
   combinedPortfolio:c1CombinedPortfolio(expectedLedger,marks,input.sourceSessionDate),paperExecution:expectedStatus};
  for(const id of ids)expected.summary.sleeves[id].cash=expectedLedger.sleeves[id].cash;
  if(!same(expected,corrected))return null;
  return {contract:'c1-recorded-sale-revision-proof-v1',priorRecordHash:recordHash,
   previousSessionDate:previous.date,currentSessionDate:input.sourceSessionDate,
   recordedLedgerFillCount:original.ledger.fills.length,recordedFillCount:changes.length,changes,
   recordedFillsPreserved:true,recordedCashPreserved:true,positionsIdentical:true,pendingDecisionsIdentical:true,newModelFills:0,
   counterfactualCashDelta:valued.cash-original.summary.cash,recordedLedgerHash:digest(original.ledger),
   counterfactualLedgerHash:digest(expectedLedger),pendingDecisionsHash:digest(original.pendingBySleeve)};
 }catch{return null;}
}

// Recheck the audit against the preserved book, including complete independent
// ledger reconstruction. This is not a blanket exception to account parity.
export function isC1RecordedSaleRevisionAudit(audit,book,digest=recordedDigest){
 try{
  const p=audit?.recordedSaleProof,same=(a,b)=>digest(a)===digest(b),previous=book.model.sessions.find(s=>s.date===audit.previousSessionDate);
  if(audit.contract!=='c1-recorded-sale-revision-v1'||audit.provider!=='FMP'||audit.endpoint!=='historical-price-eod/dividend-adjusted'||
   audit.originalInputsPreserved!==true||audit.identicalModelEconomics!==false||audit.privateAccountTreatment!=='preserved-recorded-basis'||
   audit.executable!==false||audit.eligibleForAlphaClaim!==false||!hash(audit.priorRecordHash)||!hash(audit.comparisonHash)||
   !Array.isArray(audit.economicAdjustments)||audit.economicAdjustments.length||!Array.isArray(audit.observations)||
   new Set(audit.observations).size<2||!audit.observations.every(hash)||!previous||
   !book.model.sessions.some(s=>s.date===audit.currentSessionDate)||marketSessionDistance(audit.previousSessionDate,audit.currentSessionDate)!==1||
   !validRevisionBars(previous.prices,audit.correctedPrices,same)||
   p?.contract!=='c1-recorded-sale-revision-proof-v1'||p.priorRecordHash!==audit.priorRecordHash||p.previousSessionDate!==audit.previousSessionDate||p.currentSessionDate!==audit.currentSessionDate||
   p.recordedFillsPreserved!==true||p.recordedCashPreserved!==true||p.positionsIdentical!==true||p.pendingDecisionsIdentical!==true||p.newModelFills!==0||
   ![p.recordedLedgerHash,p.counterfactualLedgerHash,p.pendingDecisionsHash].every(hash)||!Number.isFinite(p.counterfactualCashDelta)||
   !Array.isArray(p.changes)||!p.changes.length||p.recordedFillCount!==p.changes.length)return false;
  const fills=book.model.ledger.fills.filter(f=>f.date<=audit.previousSessionDate);
  if(fills.length!==p.recordedLedgerFillCount)return false;
  const recorded=restoreC1SleeveAccounting({...book.model.ledger,fills});
  if(digest(recorded)!==p.recordedLedgerHash)return false;
  const proposed=copy(recorded),seen=new Set();
  for(const change of p.changes){
   if(!Number.isSafeInteger(change.index)||seen.has(change.index)||change.priceField!=='close')return false;seen.add(change.index);
   const fill=proposed.fills[change.index],next={...fill,price:change.observedPrice};
   if(!fill||fill.date!==audit.previousSessionDate||fill.id!==change.id||fill.sleeve!==change.sleeve||fill.symbol!==change.symbol||
    fill.shares!==change.shares||fill.price!==change.recordedPrice||
    !closeSaleChange(fill,next,previous.prices.find(r=>r.symbol===fill.symbol),audit.correctedPrices.find(r=>r.symbol===fill.symbol)))return false;
   fill.price=change.observedPrice;
  }
  const revised=restoreC1SleeveAccounting(proposed),cash=ledger=>ids.reduce((sum,id)=>sum+ledger.sleeves[id].cash,0);
  return digest(revised)===p.counterfactualLedgerHash&&cash(revised)-cash(recorded)===p.counterfactualCashDelta;
 }catch{return false;}
}
