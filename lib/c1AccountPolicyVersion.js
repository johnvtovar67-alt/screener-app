import {isUsMarketSessionDay} from './marketSession';

// Shared activation metadata is safe for browser selection. Reconciliation and
// private account identities remain in the server account-policy module.
export const C1_ACCOUNT_POLICY='c1-account-policy-v2';
export const C1_ACCOUNT_POLICY_ACTIVATION_DATE='2026-11-11';
export const C1_ACCOUNT_POLICY_SOURCE_DATE='2026-11-10';
const validDay=date=>typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date&&isUsMarketSessionDay(date);
export const c1AccountPolicyApplies=date=>validDay(date)&&date>=C1_ACCOUNT_POLICY_ACTIVATION_DATE;
export const c1AccountPolicySourceApplies=date=>validDay(date)&&date>=C1_ACCOUNT_POLICY_SOURCE_DATE;

// Opaque request/version fingerprint only. It is not authentication authority;
// every funding/action boundary rebuilds the actual account facts server-side.
// Keep financial amounts and stock names out of action/telemetry identifiers.
export function c1AccountPolicyFingerprint(value){
 const text=JSON.stringify(value),state=[0x811c9dc5,0x9e3779b9,0x85ebca6b,0xc2b2ae35];
 for(let index=0;index<text.length;index++)for(let lane=0;lane<state.length;lane++){
  state[lane]=Math.imul(state[lane]^(text.charCodeAt(index)+(lane+1)*257),0x01000193);
  state[lane]^=state[lane]>>>13;
 }
 return state.map(part=>(part>>>0).toString(16).padStart(8,'0')).join('');
}

