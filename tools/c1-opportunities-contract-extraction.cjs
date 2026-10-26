// Reverse only the consumed evidence/join extraction. Earlier immutable
// projection/renderer source pins and all their behavioral assertions survive.
const assert=require('node:assert/strict');
function restoreOpportunitiesContract(source){
 if(!source.includes("import {joinC1Opportunities} from '../lib/c1OpportunitiesContract';"))return source;
 const joined=" const {evidence,projection}=joinC1Opportunities({decision,executionDecision,openingPlan,openingError,manualRecommendations,purchaseDiagnostics,screenRows,positionRows,portfolio,view,screenCurrent:screenCurrent&&cacheReady,previousEvidence:lastVerified.current?.key===sourceKey?lastVerified.current:restored.value});";
 assert(source.includes(joined),'Only the declared complete evidence/join extraction is reversible');
 return source.replace("import {joinC1Opportunities} from '../lib/c1OpportunitiesContract';","import {projectC1Opportunities} from '../lib/c1OpportunitiesProjection';")
  .replace('writeC1ScreenEvidence}', 'writeC1ScreenEvidence,resolveC1ScreenEvidence}')
  .replace("import {useEffect,useRef,useState} from 'react';", "import {useEffect,useRef,useState} from 'react';\nimport {c1ManualReviewCurrent} from '../lib/c1ManualRecommendations';")
  .replace(joined," const evidence=resolveC1ScreenEvidence({decision,rows:screenRows,current:screenCurrent&&cacheReady,previous:lastVerified.current?.key===sourceKey?lastVerified.current:restored.value,reviewCurrent:Boolean(openingPlan)&&c1ManualReviewCurrent(manualRecommendations,executionDecision)});")
  .replace(' return projection?renderC1AccountOpportunitiesView(projection):null;'," const projection=projectC1Opportunities({decision,executionDecision,openingPlan,openingError,manualRecommendations,purchaseDiagnostics,screenRows,positionRows,portfolio,view,evidence});\n return projection?renderC1AccountOpportunitiesView(projection):null;");
}
function restoreCanaryContract(source){
 return source.replace("loader.load('lib/c1OpportunitiesContract.js').resolveC1OpportunitiesEvidence({decision,\n  screenRows:rows,screenCurrent:healthy,previousEvidence:capture.previousEvidence||null},{readTime:()=>new Date(at),reviewCurrent:reviewed})", "loader.load('lib/c1ScreenEvidence.js').resolveC1ScreenEvidence({decision,\n  rows,current:healthy,previous:capture.previousEvidence||null,reviewCurrent:reviewed})")
  .replace("const {projection}=loader.load('lib/c1OpportunitiesContract.js').joinC1Opportunities({", "const projection=loader.load('lib/c1OpportunitiesProjection.js').projectC1Opportunities({")
  .replace("portfolio:capture.portfolio,view:'opportunities'\n  },{readTime:()=>new Date(at),evidence});", "portfolio:capture.portfolio,evidence,view:'opportunities'\n  },{readTime:()=>new Date(at)});");
}
module.exports={restoreOpportunitiesContract,restoreCanaryContract};
