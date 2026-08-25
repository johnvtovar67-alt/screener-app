import {RELEASE_MANIFEST} from "../../lib/releaseManifest";

const requiredFeatures=[
  "market-cycle-overhaul",
  "portfolio-sync",
  "proof-followthrough",
  "portfolio-action-summary",
  "winner-lifecycle",
  "swing-time-review-logic"
];

export default function handler(req,res){
  const featureSet=new Set(RELEASE_MANIFEST.features||[]);
  const checks={
    manifest:requiredFeatures.every(x=>featureSet.has(x)),
    fmpConfigured:Boolean(process.env.FMP_API_KEY||process.env.FMP_KEY),
    blobConfigured:Boolean(process.env.BLOB_READ_WRITE_TOKEN),
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
    features:RELEASE_MANIFEST.features
  });
}
