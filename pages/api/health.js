import {list} from '@vercel/blob';
import {RELEASE_MANIFEST} from "../../lib/releaseManifest";

const requiredFeatures=[
  "market-cycle-overhaul",
  "portfolio-sync",
  "proof-followthrough",
  "portfolio-action-summary",
  "winner-lifecycle",
  "swing-time-review-logic",
  "forward-asymmetry-gates",
  "entry-impulse-anti-chase",
  "capital-confirmation-margin",
  "capital-efficiency-ranking",
  "whole-share-capital-friction",
  "company-news-fda-risk-gate",
  "performance-mae-mfe-audit",
  "strong-buy-hysteresis",
  "exit-structural-confirmation",
  "capitulation-review-guard",
  "immutable-build-source",
  "canonical-version-integrity",
  "legacy-domain-canonical-redirect",
  "blob-oidc-health-check",
  "build-time-canonical-integrity",
  "us-market-session-persistence",
  "authoritative-live-refresh",
  "partial-universe-verification-pause",
  "bounded-stable-fmp-recovery",
  "mock-trade-allocation-simulation",
  "clean-performance-session-basis",
  "full-market-daily-discovery",
  "point-in-time-walk-forward-research",
  "c1-active-swing-production-policy",
  "durable-c1-policy-snapshot",
  "investor-facing-decision-language",
  "holding-aware-c1-lifecycle",
  "c1-three-sleeve-risk-contract",
  "portfolio-action-wrap",
  "authoritative-entry-badge",
  "user-controlled-screen-refresh"
];

async function blobAvailable(){
  try{
    await list({prefix:'screener-performance-ledger.json',limit:1});
    return true;
  }catch{
    return false;
  }
}

export default async function handler(req,res){
  const featureSet=new Set(RELEASE_MANIFEST.features||[]);
  const checks={
    manifest:requiredFeatures.every(x=>featureSet.has(x)),
    fmpConfigured:Boolean(process.env.FMP_API_KEY||process.env.FMP_KEY),
    blobConfigured:await blobAvailable(),
    gitMetadata:Boolean(process.env.VERCEL_GIT_COMMIT_SHA)||process.env.NODE_ENV!=="production"
  };
  const ok=Object.values(checks).every(Boolean);
  res.setHeader("Cache-Control","no-store");
  res.status(ok?200:503).json({
    ok,
    checks,
    release:RELEASE_MANIFEST.release,
    canonicalProject:RELEASE_MANIFEST.canonicalProject,
    commit:(process.env.VERCEL_GIT_COMMIT_SHA||"local").slice(0,7),
    capabilities:{
      fullMarketDiscovery:true,
      discoverySchedulerConfigured:Boolean(process.env.CRON_SECRET),
      pointInTimeResearchRunner:true,
      productionPolicy:"c1-active-swing-ensemble-20260904"
    },
    features:RELEASE_MANIFEST.features
  });
}
