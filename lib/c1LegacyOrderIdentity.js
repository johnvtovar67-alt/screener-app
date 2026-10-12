import {projectC1LegacyRecordedAccountSession} from './c1AccountProjection';

// The generator verifies the original account/seed/calendar bytes before
// binding this historical identity-only graph. Corrected current dependencies
// still govern live account state and every new opening recommendation.
export const C1_LEGACY_ORDER_SOURCE={commit:'9097e894a487a91eeace7a8f76fb3b42f54a991d',
  sha256:'15aecf5479fa496bb7fe232f8367aab2c4d37597bba0c347b2064e38e1886e4b',
  seedSha256:'c252e5f7c96d55b44aa8aa56dd10f57102d5968617bacadab6f47cb53506147e',
  calendarSha256:'2b12b67b5000249f05431908e21c8b8e0979d881f2390d11430287aafe818cc6',
  hashScope:'original sources before private dependency binding'};

export function reconstructC1LegacyOrderIdentity({record,observedAt,...input}) {
  const plan=projectC1LegacyRecordedAccountSession({...input,record,replayObservedAt:observedAt});
  const orders=new Map(plan.orders.map(order=>[order.id,order]));
  if(orders.size!==plan.orders.length)throw new Error('Duplicate legacy account order');
  // The ledger validates every original ID/symbol/side and all financial facts
  // against this pinned plan after its existing owner/replacement augmentation.
  // No fill is relabelled and no old ID is inferred from today's selected name.
  // Ordinary recordingEvidence/entryPlanEvidence remain in the saved history;
  // they never become an independent purchase authority here.
  return {...plan,legacyOrderIdentitySource:{...C1_LEGACY_ORDER_SOURCE}};
}
