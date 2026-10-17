// Server-only cryptographic binding. Client-reachable account analysis uses
// the canonical payload and accepted price fingerprint, without Node imports.
import {createHash} from 'node:crypto';
import {buildC1NonCashAdoptionReview} from './c1NonCashAdoption';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function reviewC1NonCashAdoption(input){
 const proposal=buildC1NonCashAdoptionReview(input);
 return {...proposal,reviewId:hash(JSON.stringify(proposal))};
}
export function verifyC1NonCashReceipts(account){
 for(const event of account.adoption.nonCashHoldings||[]){
  const {id,recordedAt,reviewId,reviewPayload,...proposal}=event;
  if(JSON.stringify(proposal)!==reviewPayload||hash(reviewPayload)!==id||reviewId!==id)throw new Error('Immutable MRNA adoption receipt verification failed');
 }
}
