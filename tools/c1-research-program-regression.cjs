// Discovered by the existing canonical regression runner. Offline mechanics only.
require('./c1-research/test.cjs');

const report=require('./c1-research/control-parity-test.cjs').runTests();
console.log(JSON.stringify({controlAdapter:report.status,assertions:report.assertions,scope:report.scope}));
