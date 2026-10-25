// Reverse only the approved owner guard so earlier exact source pins remain
// immutable. Current handlers are still exercised by their normal regressions.
const assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const ownerImport="import {rejectUnauthorizedC1Owner} from '../../lib/c1OwnerAccess';\n";
const accountGuard="  if(rejectUnauthorizedC1Owner(res,{key,environment,surface:'account'}))return;\n";
const portfolioGuard="  if(['GET','PUT'].includes(req.method)&&rejectUnauthorizedC1Owner(res,{key,environment:process.env.VERCEL_ENV,surface:'portfolio'}))return;\n";
function reverse(source,guard){
 assert.equal(source.split(ownerImport).length,2,'One owner guard import');
 assert.equal(source.split(guard).length,2,'One owner guard invocation');
 return source.replace(ownerImport,'').replace(guard,'');
}
// Older manual route VMs already use an isolated process.env. Bind their newly
// imported actual owner helper to that same synthetic configuration, rather
// than inheriting production enrollment through the research module loader.
// Otherwise a future normal enforce/rollback build could reject fixture keys.
function ownerAccessFixture(env={},logger=console){
 const source=fs.readFileSync('lib/c1OwnerAccess.js','utf8').replace(/^import .*;\n/gm,'').replace('export function ','function ');
 return new Function('process','createHash','timingSafeEqual','Buffer','console',source+';return {rejectUnauthorizedC1Owner};')(
  {env:{...env}},crypto.createHash,crypto.timingSafeEqual,Buffer,logger);
}
module.exports={originalAccountSource:source=>reverse(source,accountGuard),originalPortfolioSource:source=>reverse(source,portfolioGuard),ownerAccessFixture};
