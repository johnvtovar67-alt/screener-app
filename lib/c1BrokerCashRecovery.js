import {easternMarketClock} from './marketSession';

export const C1_BROKER_CASH_RECOVERY_PREFIX='#c1-broker-cash-review=';
export const C1_BROKER_CASH_RECOVERY_CONTRACT='c1-broker-cash-review-draft-v1';
const key='c1-broker-cash-review-draft',sessionContract='c1-broker-cash-review-session-v1';
const maxEncoded=16000,maxText=500*1024,lifetime=6*60*60*1000;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const bytes=value=>new TextEncoder().encode(value).byteLength;
const sourceValid=value=>plain(value)&&Object.keys(value).sort().join(',')==='contract,statementText,targetAccountHash'&&
 value.contract===C1_BROKER_CASH_RECOVERY_CONTRACT&&/^[a-f0-9]{64}$/.test(value.targetAccountHash||'')&&
 typeof value.statementText==='string'&&value.statementText.trim().length>0&&bytes(value.statementText)<=maxText;
const same=(left,right)=>left?.targetAccountHash===right?.targetAccountHash&&left?.statementText===right?.statementText;
function stored(storage){
 const raw=storage.getItem(key);if(!raw)return null;
 if(raw.length>maxText*4)throw new Error('The retained statement draft is invalid.');
 const value=JSON.parse(raw);
 if(!plain(value)||Object.keys(value).sort().join(',')!=='attempted,contract,expiresAt,receivedAt,source'||value.contract!==sessionContract||!sourceValid(value.source)||typeof value.attempted!=='boolean'||
  !Number.isFinite(value.receivedAt)||value.receivedAt<0||value.expiresAt!==value.receivedAt+lifetime)throw new Error('The retained statement draft is invalid.');
 return value;
}
const save=(storage,draft)=>{storage.setItem(key,JSON.stringify(draft));return draft;};

// Private fragments never enter HTTP requests. Remove them before parsing or
// waiting for the account; only statement evidence is retained, never approval.
export function loadC1BrokerCashRecovery({location,history,storage,now=Date.now()}={}){
 const fragment=location?.hash||'',incoming=fragment.startsWith(C1_BROKER_CASH_RECOVERY_PREFIX);
 if(incoming)history.replaceState(null,'',location.pathname+location.search);
 let previous;try{previous=stored(storage);}catch(error){if(!incoming)throw error;}
 let draft=previous;
 if(incoming){
  const encoded=fragment.slice(C1_BROKER_CASH_RECOVERY_PREFIX.length);
  if(!encoded||encoded.length>maxEncoded||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('The supplied statement recovery link is invalid.');
  const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/'));
  const source=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,char=>char.charCodeAt(0))));
  if(!sourceValid(source))throw new Error('The supplied statement recovery link is invalid.');
  if(!previous||!same(previous.source,source)){
   draft={contract:sessionContract,source,receivedAt:now,expiresAt:now+lifetime,attempted:false};
   try{save(storage,draft);}catch{draft={...draft,attempted:true,storageUnavailable:true};}
  }
 }
 if(!draft)return null;
 const expired=now<draft.receivedAt||now>=draft.expiresAt||easternMarketClock(now)?.key!==easternMarketClock(draft.receivedAt)?.key;
 // Expiry ends automatic review only. Keep the evidence for an explicit review.
 return {...draft,expired};
}
export function markC1BrokerCashRecoveryAttempt(storage,draft){
 const current=stored(storage);if(!current||!same(current.source,draft?.source)||current.attempted||draft.expired)return false;
 save(storage,{...current,attempted:true});return true;
}
export function updateC1BrokerCashRecovery(storage,draft,statementText){
 const current=stored(storage),source={...draft.source,statementText};
 if(!current||!same(current.source,draft.source)||!sourceValid(source))return draft;
 return {...save(storage,{...current,source,attempted:true}),expired:draft.expired};
}
export function clearC1BrokerCashRecovery(storage,draft){
 const current=stored(storage);if(!current||!same(current.source,draft?.source))return false;
 storage.removeItem(key);return true;
}
