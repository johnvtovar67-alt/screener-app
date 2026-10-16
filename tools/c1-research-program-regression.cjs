// Discovered by the existing canonical regression runner. Offline mechanics only.
require('./c1-research/test.cjs');

const report=require('./c1-research/control-parity-test.cjs').runTests({costs:[12,25,50],policyModes:['production-dated','retrospective-current']});
console.log(JSON.stringify({controlAdapter:report.status,assertions:report.assertions,scope:report.scope}));

require('./c1-research/independent-review/review.cjs');
require('./c1-research/independent-review/policy-cost-review.cjs');
require('./c1-research/independent-review/profile-temporal-review.cjs');
