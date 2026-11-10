import {easternMarketClock,latestCompletedMarketSessionDay,marketSessionCloseMinutes,previousMarketSessionDay,isUsMarketSessionDay} from './marketSession';

const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&isUsMarketSessionDay(value);

// Display evidence only. This does not replace decision.current, opening
// verification, or any account/order check, and cannot authorize a purchase.
export function c1PublicationStatus({sourceSessionDate,analysisSessionDate,selectionEvidence,now=new Date()}={}){
 const clock=easternMarketClock(now),required=latestCompletedMarketSessionDay(now);
 const source=validDay(sourceSessionDate)?sourceSessionDate:null,analysis=validDay(analysisSessionDate)?analysisSessionDate:null;
 const result=(code,message)=>({contract:'c1-publication-status-v1',code,sourceSessionDate:source,
  analysisSessionDate:analysis,expectedSessionDate:required,message,executable:false});
 if(!clock||!required||!source||source>required||!analysis||analysis>source)
  return result('SOURCE_UNAVAILABLE','Accepted market-session evidence is unavailable. Publication and recovery status are unknown.');
 if(source<required){
  const inGrace=clock.isSessionDay&&clock.key===required&&source===previousMarketSessionDay(required)&&
   clock.minutes>=marketSessionCloseMinutes(required)&&clock.minutes<marketSessionCloseMinutes(required)+35;
  if(inGrace)return result('CLOSING_PUBLICATION_PENDING',`Market-data update pending for ${required}, within the normal 35-minute closing publication window. Analysis source: ${analysis}. Scheduled processing handles publication; repeated reloads are unnecessary.`);
  return result('SOURCE_OVERDUE',`Market-data update pending for ${required} and overdue. Last accepted market session: ${source}; analysis source: ${analysis}. The server update is unavailable; recovery has not been confirmed. Repeated reloads cannot complete the server update.`);
 }
 if(analysis<required)return result('ACCOUNT_ACTIVITY_PENDING',`Confirm completed-session activity in Account settings to update C1 beyond ${analysis}. Market data are available through ${source}.`);
 if(selectionEvidence?.evidenceComplete===false)return result('ENTRY_EVIDENCE_INCOMPLETE',`Analysis is current for completed session ${analysis}. Current candidate evidence is incomplete; only independently checked quantities for verified stocks may be used.`);
 return result('CURRENT',`Analysis is current for completed session ${analysis}.`);
}
