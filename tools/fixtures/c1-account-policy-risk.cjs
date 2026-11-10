// Browser/API fixtures exercise the actual owner-approved server configuration.
// Pending/forgery cases have separate isolated overrides in their own tests.
const {createResearchModuleLoader}=require('../research-module-loader.cjs');
function approvedOperationalRiskModules(root=process.cwd()){
 const config=createResearchModuleLoader(root).load('lib/c1OperationalRiskDecision.js');
 if(config.C1_OPERATIONAL_RISK_DECISION.status!=='approved'||config.C1_OPERATIONAL_RISK_DECISION.mode!==config.C1_OPERATIONAL_RISK_MODE)
  throw new Error('This fixture requires the actual owner-approved risk policy');
 return {};
}
module.exports={approvedOperationalRiskModules};
