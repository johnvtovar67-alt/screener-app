// Reverse only the shared projection extraction, leaving every earlier source
// oracle and behavioral assertion unchanged. Never changes application files.
const fs=require('node:fs'),assert=require('node:assert/strict');
function restoreOpportunitiesProjection(source){
 const projection=fs.readFileSync('lib/c1OpportunitiesProjection.js','utf8');
 const start=source.indexOf(' const projection=projectC1Opportunities('),bodyStart=projection.indexOf(' const ready=');
 assert(start>=0&&bodyStart>=0,'Only the declared synchronous projection seam is reversible');
 let prefix=source.slice(0,start).replace("import {projectC1Opportunities} from '../lib/c1OpportunitiesProjection';\n",'');
 prefix=prefix.replace("import {useEffect,useRef,useState}","import {c1WatchPresentation,c1OpportunityPresentation} from '../lib/c1EntryReview';\nimport {useEffect,useRef,useState}");
 prefix=prefix.replace("import {c1ManualReviewCurrent} from '../lib/c1ManualRecommendations';", "import {c1OrderDisplayGroups} from '../lib/c1OrderDisplay';\nimport {c1ManualReviewCurrent,c1ManualOrdersForView} from '../lib/c1ManualRecommendations';\nimport {c1PositionPresentation,c1RecordedSellInstruction} from '../lib/c1PositionPresentation';\nimport {c1PlainDecisionReason} from '../lib/c1DecisionCopy';");
 let body=projection.slice(bodyStart).replace('c1ManualReviewCurrent(manualRecommendations,executionDecision,readTime());','c1ManualReviewCurrent(manualRecommendations,executionDecision);')
  .replace('openingPlan,view,now:readTime()});','openingPlan,view});')
  .replace("openingPlan,view:'opportunities',now:readTime()}","openingPlan,view:'opportunities'}")
  .replace('now:readTime()','now:new Date()');
 body=body.replace(' return {portfolioOnly,evidence,',' return renderC1AccountOpportunitiesView({portfolioOnly,evidence,').replace('watchView,ratedRows};','watchView,ratedRows});');
 return prefix+body;
}
module.exports={restoreOpportunitiesProjection};
