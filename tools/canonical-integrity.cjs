const fs=require('fs');
const path=require('path');

function read(file){return fs.readFileSync(file,'utf8');}
function assert(condition,message){if(!condition){throw new Error(`CANONICAL INTEGRITY FAILURE: ${message}`);}}
function hasAll(text,markers,file){for(const marker of markers)assert(text.includes(marker),`${file} is missing required marker: ${marker}`);}

const pkg=JSON.parse(read('package.json'));
const lifecycle=['preinstall','postinstall','prebuild','build','postbuild','verify'];
for(const name of lifecycle){
  const script=String(pkg.scripts?.[name]||'');
  assert(!/tools\/apply-[^ ]+\.cjs/.test(script),`${name} mutates source through an apply-* script`);
  assert(!/git\s+(commit|push|add)\b/.test(script),`${name} performs a Git write`);
}
const prebuild=String(pkg.scripts?.prebuild||'');
const verify=String(pkg.scripts?.verify||'');
assert(prebuild.includes('tools/canonical-integrity.cjs'),'prebuild must run canonical integrity check');
assert(verify.includes('tools/canonical-integrity.cjs'),'verify must run canonical integrity check');

const workflowDir='.github/workflows';
if(fs.existsSync(workflowDir)){
  const workflows=fs.readdirSync(workflowDir).filter(f=>/\.ya?ml$/i.test(f));
  assert(workflows.length===1&&workflows[0]==='ci.yml',`workflow directory must contain only ci.yml; found: ${workflows.join(', ')||'none'}`);
  for(const file of workflows){
    const text=read(path.join(workflowDir,file));
    assert(!/contents\s*:\s*write/i.test(text),`${file} grants contents: write`);
    assert(!/\bgit\s+(push|commit|add)\b/.test(text),`${file} writes back to Git`);
    assert(!/tools\/apply-[^\s]+\.cjs/.test(text),`${file} runs an apply-* source mutation`);
  }
}

const manifest=read('lib/releaseManifest.js');
hasAll(manifest,[
  'release:"2026-09-01-v11-setup-tolerance"',
  'canonicalProject:"screener-app-cq5t"',
  'canonicalBranch:"main"',
  '"entry-impulse-anti-chase"',
  '"capital-confirmation-margin"',
  '"capital-efficiency-ranking"',
  '"whole-share-capital-friction"',
  '"company-news-fda-risk-gate"',
  '"performance-mae-mfe-audit"',
  '"exit-structural-confirmation"',
  '"capitulation-review-guard"',
  '"strong-buy-hysteresis"',
  '"immutable-build-source"',
  '"canonical-version-integrity"',
  '"legacy-domain-canonical-redirect"',
  '"blob-oidc-health-check"',
  '"build-time-canonical-integrity"',
  '"us-market-session-persistence"',
  '"authoritative-live-refresh"',
  '"partial-universe-verification-pause"',
  '"bounded-stable-fmp-recovery"',
  '"mock-trade-allocation-simulation"',
  '"clean-performance-session-basis"',
  '"v11-momentum-production-policy"',
  '"durable-v11-policy-snapshot"',
  '"investor-facing-decision-language"',
  '"holding-aware-v11-lifecycle"',
  '"v11-strict-strong-buy-preservation"',
  '"portfolio-action-wrap"',
  '"authoritative-entry-badge"',
  '"user-controlled-screen-refresh"',
  '"holding-decision-explanations"',
  '"reconciled-hold-reunderwrite"',
  '"setup-window-noise-tolerance"',
  '"portfolio-rank-hidden"'
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

const health=read('pages/api/health.js');
hasAll(health,['canonicalProject','blobConfigured','gitMetadata'],'pages/api/health.js');

const app=read('pages/_app.js');
hasAll(app,['screener-app-cq5t.vercel.app','screener-app-nu.vercel.app','/api/version'],'pages/_app.js');

console.log('Canonical integrity check passed: one read-only CI workflow, immutable committed build source, canonical legacy redirects, and critical trading/version-control safeguards are present.');
