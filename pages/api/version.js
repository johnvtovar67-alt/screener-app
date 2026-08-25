import {RELEASE_MANIFEST} from "../../lib/releaseManifest";

export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.status(200).json({
    release:RELEASE_MANIFEST.release,
    baselineCommit:RELEASE_MANIFEST.baselineCommit,
    project:RELEASE_MANIFEST.canonicalProject,
    commit:(process.env.VERCEL_GIT_COMMIT_SHA||"local").slice(0,7),
    branch:process.env.VERCEL_GIT_COMMIT_REF||"local",
    environment:process.env.VERCEL_ENV||process.env.NODE_ENV||"local",
    features:RELEASE_MANIFEST.features
  });
}
