import {createC1ProspectiveSeeds} from './c1AccountSeed';
import {continueC1ActualAccount,planC1ContinuedAccountOpening} from './c1AccountExecution';
import {buildC1AccountDecision} from './c1AccountDecision';
import {latestCompletedMarketSessionDay} from './marketSession';

export function adoptC1Account({portfolio,capitalRecord,book,now=new Date()}={}) {
 const baseline=book.model.sessions.at(-1);
 if(book.universe!=='sp500'||baseline.date!==latestCompletedMarketSessionDay(now))throw new Error('Current observed S&P 500 input required');
 const adoption=createC1ProspectiveSeeds({portfolio,baseline,capitalRecord,adoptionConfirmed:true});
 return {contract:'c1-private-account-v1',revision:0,adoption,records:[],sourceHashes:[{date:baseline.date,hash:book.captures.find(c=>c.sessionDate===baseline.date)?.hash}],createdAt:now.toISOString()};
}
export function evaluateC1Account({account,book,now=new Date()}={}) {
 if(account?.contract!=='c1-private-account-v1'||book?.universe!=='sp500')throw new Error('Stored C1 account and S&P input required');
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 const sessions=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate&&s.date<=through);
 for(const accepted of account.sourceHashes){if(!accepted.hash||book.captures.find(c=>c.sessionDate===accepted.date)?.hash!==accepted.hash)throw new Error('An accepted account input changed; original account retained');}
 const continued=continueC1ActualAccount({adoption:account.adoption,sessions,records:account.records,observedAt:now});
 const sourceHash=book.captures.find(c=>c.sessionDate===sessions.at(-1).date)?.hash;
 return buildC1AccountDecision({continued,sourceHash,revision:account.revision,now});
}
export function appendC1AccountSession({account,record,book,expectedRevision,now=new Date()}={}) {
 if(account?.revision!==expectedRevision)throw new Error('Account changed; refresh before recording activity');
 const capture=book.captures.find(c=>c.sessionDate===record?.date);
 if(!capture)throw new Error('Observed session input missing');
 const next={...account,revision:account.revision+1,records:[...account.records,record],sourceHashes:[...account.sourceHashes,{date:record.date,hash:capture.hash}]};
 evaluateC1Account({account:next,book,now});
 return next;
}

export function pendingC1AccountSession({account,book,now=new Date()}={}) {
 const through=account.records.at(-1)?.date||account.adoption.sourceSessionDate;
 const all=book.model.sessions.filter(s=>s.date>=account.adoption.sourceSessionDate),index=all.findIndex(s=>s.date===through);
 if(index<0||index===all.length-1)return null;
 const openingObservedAt=book.captures.find(c=>c.sessionDate===all[index+1].date)?.observedAt;
 const plan=planC1ContinuedAccountOpening({adoption:account.adoption,sessions:all.slice(0,index+1),records:account.records,opening:all[index+1],observedAt:openingObservedAt});
 return {date:all[index+1].date,openingObservedAt,plan,revision:account.revision};
}
