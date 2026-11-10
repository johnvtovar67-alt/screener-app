import {reconcileC1AccountInvestmentPeriods,nextC1PolicySession} from './c1AccountStockCooldown';
import {marketSessionDistance} from './marketSession';
import {C1_OPERATIONAL_RISK_DECISION} from './c1OperationalRiskDecision';
import {C1_ACCOUNT_POLICY,C1_ACCOUNT_POLICY_ACTIVATION_DATE,C1_ACCOUNT_POLICY_SOURCE_DATE,c1AccountPolicyApplies,c1AccountPolicySourceApplies,c1AccountPolicyFingerprint} from './c1AccountPolicyVersion';

export {C1_ACCOUNT_POLICY,C1_ACCOUNT_POLICY_ACTIVATION_DATE,C1_ACCOUNT_POLICY_SOURCE_DATE,c1AccountPolicyApplies,c1AccountPolicySourceApplies,c1AccountPolicyFingerprint};
export const c1AccountPolicyNextSession=nextC1PolicySession;

// Financial records stay immutable. Historical loss completion dates, not the
// software activation/read time, determine elapsed sessions and exact expiry.
export function buildC1AccountPolicy(account,{date,now=new Date()}={}){
 const base={contract:C1_ACCOUNT_POLICY,version:C1_ACCOUNT_POLICY,schemaVersion:2,activationDate:C1_ACCOUNT_POLICY_ACTIVATION_DATE,sourceActivationDate:C1_ACCOUNT_POLICY_SOURCE_DATE,
  date,decisionDate:date,active:c1AccountPolicyApplies(date),accountRevision:account?.revision??null,
  portfolioRiskBaseline:'existing-high-water-reference-preserved',operationalRiskDecision:C1_OPERATIONAL_RISK_DECISION,
  riskBaselineDecisionRequired:C1_OPERATIONAL_RISK_DECISION.status!=='approved'};
 try{
  const facts=reconcileC1AccountInvestmentPeriods(account,{date,now});
  const stockCooldowns=facts.stockCooldowns;
  const blockedSymbols=[...new Set([...stockCooldowns.filter(c=>c.active),...facts.accountingRestrictions.filter(c=>c.active)].map(c=>c.symbol))].sort();
  const transition=[];
  const seen=new Map();
  for(const record of account.records||[]){
   for(const evidence of [record.entryPlanEvidence,record.executionEvidence,record.recordingEvidence]){
    for(const [allocation,risk] of Object.entries(evidence?.riskBySleeve||{})){
     const prior=seen.get(allocation);
     if(risk.paused===true&&prior?.paused===false&&marketSessionDistance(prior.date,record.date)<=1){
      const losses=facts.periods.filter(c=>c.loss===true&&c.triggerDate===record.date&&c.participatingAllocations.includes(allocation));
      transition.push({allocation,originalTriggerDate:record.date,evidence:'saved-risk-transition-and-actual-completed-loss',symbols:[...new Set(losses.map(c=>c.symbol))].sort(),
       elapsedSessions:marketSessionDistance(record.date,date),clockRestarted:false,unrelatedStockPurchaseProhibitionRemoved:base.active});
     }
     seen.set(allocation,{date:record.date,paused:risk.paused});
    }
   }
  }
  const identity=base.contract+':'+c1AccountPolicyFingerprint([date,base.accountRevision,facts.periods.map(p=>[p.symbol,p.completedAt,p.netRealizedPnl,p.participatingAllocations]),blockedSymbols]);
  return {...base,...facts,blockedSymbols,activeExitSymbols:[],transition,identity,decisionId:identity};
 }catch(error){
  return {...base,complete:false,unavailableReason:'Account stock-cooldown evidence is incomplete: '+String(error.message).slice(0,180),stockCooldowns:[],blockedSymbols:[],activeExitSymbols:[],transition:[],
   identity:base.contract+':'+c1AccountPolicyFingerprint([date,base.accountRevision,'incomplete']),decisionId:base.contract+':'+c1AccountPolicyFingerprint([date,base.accountRevision,'incomplete'])};
 }
}

export function retargetC1AccountPolicy(policy,date){
 if(!policy)return null;
 const stockCooldowns=(policy.stockCooldowns||[]).map(c=>({...c,active:date>=c.triggerDate&&date<=c.expiresAfterSession,elapsedSessions:marketSessionDistance(c.triggerDate,date)}));
 const accountingRestrictions=(policy.accountingRestrictions||[]).map(c=>({...c,active:date>=c.triggerDate&&date<=c.expiresAfterSession}));
 const blockedSymbols=[...new Set([...stockCooldowns,...accountingRestrictions].filter(c=>c.active).map(c=>c.symbol))].sort();
 const baseIdentity=policy.baseIdentity||policy.identity,identity=C1_ACCOUNT_POLICY+':'+c1AccountPolicyFingerprint([baseIdentity,date,blockedSymbols,policy.activeExitSymbols||[]]);
 return {...policy,baseIdentity,date,decisionDate:date,active:c1AccountPolicyApplies(date),stockCooldowns,accountingRestrictions,blockedSymbols,identity,decisionId:identity};
}
