// A prospective server-plan policy, never a rewrite of the frozen benchmark.
// Only a new Swing ownership period may capture this policy. Existing lots and
// later additions retain their recorded stop; actual fills carry private replay
// authority after reconciliation against the original saved server order.
export const C1_NEW_SWING_STOP_POLICY='c1-new-swing-initial-stop-10-v1';
export const C1_NEW_SWING_STOP_PCT=10;
export function c1CapturedInitialSwingStop(order){
 const hasPolicy=order?.initialSwingStopPolicy!==undefined||order?.initialSwingStopPct!==undefined;
 if(!hasPolicy)return null;
 if(order?.side!=='buy'||order.initialSwingStopPolicy!==C1_NEW_SWING_STOP_POLICY||order.initialSwingStopPct!==C1_NEW_SWING_STOP_PCT)
  throw new Error('Invalid captured initial Swing stop policy');
 return C1_NEW_SWING_STOP_PCT;
}
