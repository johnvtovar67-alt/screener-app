import {resolveC1ScreenEvidence} from './c1ScreenEvidence';
import {c1ManualReviewCurrent} from './c1ManualRecommendations';
import {projectC1Opportunities} from './c1OpportunitiesProjection';

// Join the independently observed inputs at their actual consumption point.
// Retained ratings provide display continuity; only the supplied checked server
// orders can supply quantities. This contract never fetches, stores or retries.
export function resolveC1OpportunitiesEvidence({decision,executionDecision=decision,openingPlan,manualRecommendations,screenRows=[],screenCurrent=false,previousEvidence=null},{readTime=()=>new Date(),reviewCurrent}={}){
 return resolveC1ScreenEvidence({decision,rows:screenRows,current:screenCurrent,previous:previousEvidence,
  reviewCurrent:reviewCurrent===undefined?Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision,readTime()):reviewCurrent});
}

export function joinC1Opportunities(input,{readTime=()=>new Date(),reviewCurrent,evidence}={}){
 const joinedEvidence=evidence===undefined?resolveC1OpportunitiesEvidence(input,{readTime,reviewCurrent}):evidence;
 const projection=projectC1Opportunities({...input,evidence:joinedEvidence},{readTime});
 return {contract:'c1-opportunities-join-v1',
  sourceSessionDate:input.decision?.sourceSessionDate||null,evidenceIdentity:joinedEvidence.key,
  evidence:joinedEvidence,projection};
}
