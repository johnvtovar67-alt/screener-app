// Compatibility entry point. C1 superseded the V11 production-policy name;
// keep one authoritative suite so safety assertions cannot sit unreachable
// behind an early process exit.
require("./c1-production-policy-regression.cjs");
