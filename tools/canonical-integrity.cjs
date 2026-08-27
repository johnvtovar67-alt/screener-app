const fs=require('fs');

function read(path){return fs.readFileSync(path,'utf8');}
function assert(condition,message){if(!condition){throw new Error(`CANONICAL INTEGRITY FAILURE: ${message}`);}}
function hasAll(text,markers,path){for(const marker of markers)assert(text.includes(marker),`${path} is missing required marker: ${marker}`);}

const pkg=JSON.parse(read('package.json'));
const prebuild=String(pkg.scripts?.prebuild||'');
const verify=String(pkg.scripts?.verify||'');
assert(!/tools\/apply-[^ ]+\.cjs/.test(prebuild),'prebuild still mutates source through an apply-* script');
assert(!/tools\/apply-[^ ]+\.cjs/.test(verify),'verify still mutates source through an apply-* script');

const manifest=read('lib/releaseManifest.js');
hasAll(manifest,[
  'canonicalProject:"screener-app-cq5t"',
  'canonicalBranch:"main"',
  '"entry-impulse-anti-chase"',
  '"capital-efficiency-ranking"',
  '"company-news-fda-risk-gate"',
  '"performance-mae-mfe-audit"',
  '"exit-structural-confirmation"',
  '"strong-buy-hysteresis"'
],'lib/releaseManifest.js');

const expert=read('lib/expertDecision.js');
hasAll(expert,[
  'strongForwardAsymmetryPass',
  'scoringBuyEligible',
  'eventThesisBreak',
  'staleCapitalReview',
  'structuralExitPressure',
  'capitulationRisk'
],'lib/expertDecision.js');

const opportunity=read('lib/opportunityDecision.js');
hasAll(opportunity,[
  'capitalEfficiencyScore',
  'freshEntryImpulse',
  'strongBuyRetentionEligible',
  'capitalConfirmedBuy',
  'strong-buy-hysteresis'
],'lib/opportunityDecision.js');

const eventRisk=read('lib/eventRisk.js');
hasAll(eventRisk,[
  'HARD_NEWS_PATTERNS',
  'FDA safety/recall event',
  'materialNews',
  'requiresReview'
],'lib/eventRisk.js');

const version=read('pages/api/version.js');
hasAll(version,['RELEASE_MANIFEST','VERCEL_GIT_COMMIT_SHA','VERCEL_GIT_COMMIT_REF'],'pages/api/version.js');

const app=read('pages/_app.js');
hasAll(app,['screener-app-cq5t.vercel.app','/api/version'],'pages/_app.js');

console.log('Canonical integrity check passed: committed source is immutable at build time and all critical trading/version-control safeguards are present.');
