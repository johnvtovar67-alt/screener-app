import {joinC1Opportunities} from '../lib/c1OpportunitiesContract';
import {renderC1AccountOpportunitiesView} from './C1AccountOpportunitiesView';
import {c1ScreenEvidenceKey,readC1ScreenEvidence,writeC1ScreenEvidence} from '../lib/c1ScreenEvidence';
import {useEffect,useRef,useState} from 'react';
export default function C1AccountOpportunities({decision,executionDecision=decision,openingPlan,openingError,manualRecommendations,purchaseDiagnostics,screenRows=[],positionRows=[],screenCurrent=false,portfolio=[],view="opportunities"}){
 const [,expire]=useState(0);
 useEffect(()=>{
  const remaining=Date.parse(manualRecommendations?.validUntil)-Date.now();
  if(!Number.isFinite(remaining)||remaining<0)return;
  const timer=setTimeout(()=>expire(n=>n+1),Math.min(remaining+1,120001));
  return ()=>clearTimeout(timer);
 },[manualRecommendations?.validUntil]);
 const lastVerified=useRef(null);
 const sourceKey=c1ScreenEvidenceKey(decision);
 const [restored,setRestored]=useState({key:null,value:null});
 const cacheReady=typeof window==='undefined'||restored.key===sourceKey;
 useEffect(()=>{if(typeof window!=='undefined'){let value=null;try{value=readC1ScreenEvidence(window.localStorage,decision);}catch{}setRestored({key:sourceKey,value});}},[sourceKey]);
 const {evidence,projection}=joinC1Opportunities({decision,executionDecision,openingPlan,openingError,manualRecommendations,purchaseDiagnostics,screenRows,positionRows,portfolio,view,screenCurrent:screenCurrent&&cacheReady,previousEvidence:lastVerified.current?.key===sourceKey?lastVerified.current:restored.value});
 useEffect(()=>{if(evidence.verified){lastVerified.current=evidence;if(typeof window!=='undefined')try{writeC1ScreenEvidence(window.localStorage,evidence);}catch{}}},[evidence]);
 return projection?renderC1AccountOpportunitiesView(projection):null;
}
