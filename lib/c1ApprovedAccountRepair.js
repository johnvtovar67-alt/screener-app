import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {reviewC1BrokerCashCorrection,confirmC1BrokerCashCorrection} from './c1BrokerCashReviewService';
import {c1BrokerCashJournalReceipt,c1CashAccountingForAccount} from './c1BrokerCashJournal';
import {c1AccountCashAvailability} from './c1BrokerageCash';

const contract='c1-owner-approved-account-repair-v1',receiptContract='c1-approved-account-repair-receipt-v1';
const authorizationId='c1-owner-approved-repair-20261125';
const fields=['contract','adoption','records','sourceHashes','corrections','positionContext','contextCorrections','cashReconciliations','intradayActivity','cashAccountingCorrections','saleAttributionCorrections','approvedAccountRepairs'];
const configFields=['contract','authorizationId','targetAccountHash','sourceEconomicFingerprint','portfolioFingerprint','confirmedBrokerageCash','statementText'];
const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const rawDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=()=>{throw new Error('The owner-approved account repair could not be verified. Purchases remain paused.');};
const clone=value=>JSON.parse(JSON.stringify(value));

export function c1ApprovedAccountRepairFingerprint(account){
 return digest(Object.fromEntries(fields.filter(field=>Object.hasOwn(account||{},field)).map(field=>[field,account[field]])));
}
export function c1ApprovedRepairPortfolioFingerprint(portfolio){
 if(!Array.isArray(portfolio))fail();
 const seen=new Set(),rows=portfolio.map(position=>{
  if(typeof position?.symbol!=='string'||!position.symbol||seen.has(position.symbol)||!['Core','Swing'].includes(position.role)||!finite(Number(position.shares))||Number(position.shares)<0)fail();
  seen.add(position.symbol);return {symbol:position.symbol,role:position.role,shares:Number(position.shares)};
 }).sort((a,b)=>a.symbol.localeCompare(b.symbol));
 return digest(rows);
}
function configurationValue(value){
 if(!value)return null;
 let config;try{config=typeof value==='string'?JSON.parse(value):value;}catch{fail();}
 if(!config||Array.isArray(config)||Object.keys(config).length!==configFields.length||Object.keys(config).some(key=>!configFields.includes(key))||
  config.contract!==contract||config.authorizationId!==authorizationId||!['targetAccountHash','sourceEconomicFingerprint','portfolioFingerprint'].every(key=>hex(config[key]))||
  !finite(config.confirmedBrokerageCash)||config.confirmedBrokerageCash<0||Math.round(config.confirmedBrokerageCash*100)/100!==config.confirmedBrokerageCash||
  typeof config.statementText!=='string'||!config.statementText.trim()||Buffer.byteLength(config.statementText,'utf8')>500*1024)fail();
 return config;
}
function publicReceipt(marker,revision){
 return {contract:receiptContract,status:'applied',authorizationId:marker.authorizationId,reviewId:marker.reviewId,
  attributionProposalId:marker.attributionProposalId,revision,originalRecordsPreserved:true,basisCorrections:clone(marker.basisCorrections)};
}
function verifiedMarker(account,config){
 const markers=account?.approvedAccountRepairs;if(markers===undefined)return null;
 if(!Array.isArray(markers))fail();
 const found=markers.filter(marker=>marker?.authorizationId===config.authorizationId);if(!found.length)return null;if(found.length!==1)fail();
 const marker=found[0],{payloadDigest,...payload}=marker;
 if(marker.contract!==receiptContract||marker.status!=='applied'||payloadDigest!==digest(payload)||
  marker.targetAccountHash!==config.targetAccountHash||marker.sourceEconomicFingerprint!==config.sourceEconomicFingerprint||
  marker.portfolioFingerprint!==config.portfolioFingerprint||marker.statementHash!==createHash('sha256').update(config.statementText).digest('hex')||
  marker.confirmedBrokerageCash!==config.confirmedBrokerageCash||!hex(marker.reviewId)||!hex(marker.attributionProposalId)||
  !hex(marker.originalAccountDigest)||!Number.isSafeInteger(marker.appliedRevision)||marker.appliedRevision<1||account.revision<marker.appliedRevision||
  !Array.isArray(marker.basisCorrections)||!marker.basisCorrections.length||!Number.isFinite(Date.parse(marker.appliedAt)))fail();
 c1BrokerCashJournalReceipt(account);
 if(!c1CashAccountingForAccount(account))fail();
 const journal=account.cashAccountingCorrections.find(row=>row.id===marker.reviewId),audit=account.saleAttributionCorrections?.find(row=>row.proposalId===marker.attributionProposalId);
 if(!journal||journal.appliedRevision!==marker.appliedRevision||journal.review.bindings.accountHash!==marker.originalAccountDigest||
  journal.review.bindings.statementHash!==marker.statementHash||journal.confirmedBrokerageCash.balance!==config.confirmedBrokerageCash||
  !audit||audit.ownerConfirmed!==true||audit.brokerageExecutionCreated!==false||audit.appliedRevision!==marker.appliedRevision||audit.sourceDigest!==marker.originalAccountDigest||
  !Array.isArray(audit.rows)||digest(audit.rows.map(({symbol,remainingShares,basisBefore,basisAfter})=>({symbol,remainingShares,basisBefore,basisAfter})))!==digest(marker.basisCorrections))fail();
 const fills=[...(account.records||[]).flatMap(record=>record.fills||[]),...(account.intradayActivity?.fills||[])];
 if(!Array.isArray(audit.correctedFills)||!audit.correctedFills.length||audit.correctedFills.some(expected=>{
  const matches=fills.filter(fill=>fill.id===expected.id);
  return matches.length!==1||['orderId','symbol','side','shares'].some(field=>matches[0][field]!==expected[field]);
 }))fail();
 return marker;
}

// Server-only, production-only and reachable solely after the native account
// authentication boundary. The configured statement is never returned/logged.
// Every financial guard runs before one strong-ETag write; a fresh read proves
// the real journal and allocation audit before any success can be published.
export async function applyC1ApprovedAccountRepair({environment,key,saved,path,book,readPortfolio,store,now=new Date(),validateView,
 configuration=process.env.C1_OWNER_APPROVED_ACCOUNT_REPAIR_V1}={}){
 if(environment!=='production'||!configuration)return {saved,receipt:null};
 const config=configurationValue(configuration),target=createHash('sha256').update(key).digest('hex');
 if(target!==config.targetAccountHash)return {saved,receipt:null};
 if(!saved?.record||typeof saved.etag!=='string'||!saved.etag||saved.etag.startsWith('W/')||typeof validateView!=='function')fail();
 const existing=verifiedMarker(saved.record,config);
 if(existing)return {saved,receipt:publicReceipt(existing,saved.record.revision)};
 if(c1ApprovedAccountRepairFingerprint(saved.record)!==config.sourceEconomicFingerprint)fail();
 const available=c1AccountCashAvailability({account:saved.record,strategyCash:0,now});
 if(!available.brokerageCashCurrent||available.brokerageCash!==config.confirmedBrokerageCash)fail();
 const portfolioRecord=await readPortfolio(key);
 if(c1ApprovedRepairPortfolioFingerprint(portfolioRecord?.portfolio)!==config.portfolioFingerprint)fail();
 const args={account:saved.record,book,portfolioRecord,statementText:config.statementText,expectedRevision:saved.record.revision,now},review=reviewC1BrokerCashCorrection(args);
 if(!review.financialValid||!review.plannedSaleCorrection||review.financialPreview.currentCash!==config.confirmedBrokerageCash)fail();
 const corrected=confirmC1BrokerCashCorrection({...args,reviewId:review.reviewId,confirmed:true,attributionConfirmed:true});
 const payload={contract:receiptContract,status:'applied',authorizationId:config.authorizationId,targetAccountHash:target,
  sourceEconomicFingerprint:config.sourceEconomicFingerprint,portfolioFingerprint:config.portfolioFingerprint,confirmedBrokerageCash:config.confirmedBrokerageCash,
  statementHash:createHash('sha256').update(config.statementText).digest('hex'),originalAccountDigest:rawDigest(saved.record),reviewId:review.reviewId,
  attributionProposalId:review.plannedSaleCorrection.proposalId,appliedRevision:corrected.revision,appliedAt:new Date(now).toISOString(),
  basisCorrections:review.plannedSaleCorrection.rows.map(({symbol,remainingShares,basisBefore,basisAfter})=>({symbol,remainingShares,basisBefore,basisAfter}))},
  marker={...payload,payloadDigest:digest(payload)},next={...corrected,approvedAccountRepairs:[...(corrected.approvedAccountRepairs||[]),marker]};
 verifiedMarker(next,config);
 const view=await validateView(next);
 let writeError=null;try{await store.write(path,next,saved.etag);}catch(error){writeError=error;}
 const reread=await store.read(path);
 if(!reread?.record||!verifiedMarker(reread.record,config)){if(writeError)throw writeError;fail();}
 // Concurrent successful application is accepted only through its genuine
 // matching receipts. Never rebase or repeat this financial write.
 const same=rawDigest(reread.record)===rawDigest(next),receipt=publicReceipt(verifiedMarker(reread.record,config),reread.record.revision);
 return {saved:reread,receipt,...(same?{view}:{}),appliedNow:true};
}
