'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {parseAudit,stringifyAudit}=require('../imported/tools/c1-production-policy-replay.cjs');
const {developmentCard,baselineSummary,scorecard,publicSummary}=require('./scorecard.cjs');
const {compareFinalist}=require('./compare-validation.cjs');
const {createFinalistLock,verifyGitHubLock,verifyGitHubLockFromReadReceipt,authorizeValidation,PRODUCTION_COMMIT,PRODUCTION_GRAPH}=require('./finalist-lock.cjs');
const REPO=path.resolve(__dirname,'../../..');
function assert(condition,message){if(!condition)throw new Error(message);}
function within(file,root){return file!==root&&file.startsWith(root+path.sep);}
function existingEntry(file){try{return fs.lstatSync(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
function privateRoot(root){assert(root,'--private-root is required');const resolved=fs.realpathSync(root);assert(!within(resolved,REPO)&&resolved!==REPO,'Row-level outputs must be outside the public repository');return resolved;}
function privatePath(file,root,{output=false}={}){
 assert(file,'A private path is required');const absolute=path.resolve(file),parent=fs.realpathSync(path.dirname(absolute));const resolved=path.join(parent,path.basename(absolute));assert(within(resolved,root),'Private files must be inside --private-root');
 assert(!within(resolved,REPO),'Raw/reconstructable row-level material is forbidden in the public repository');
 const entry=existingEntry(resolved);if(entry)assert(!entry.isSymbolicLink(),'Private file symlinks are forbidden');
 if(!output)assert(entry?.isFile(),'Private regular-file input is absent');return resolved;
}
function read(file){const bytes=fs.readFileSync(file);return parseAudit((file.endsWith('.gz')?zlib.gunzipSync(bytes):bytes).toString());}
function writePrivate(file,data,root){const output=privatePath(file,root,{output:true}),bytes=Buffer.from(stringifyAudit(data,2));fs.writeFileSync(output,output.endsWith('.gz')?zlib.gzipSync(bytes):bytes,{mode:0o600,flag:'wx'});}
function writePublic(file,data){
 const resolved=path.resolve(file),parent=fs.realpathSync(path.dirname(resolved)),target=path.join(parent,path.basename(resolved));assert(within(target,path.resolve(__dirname,'..')),'Public summaries and locks must stay in the research directory');const entry=existingEntry(target);assert(!entry||!entry.isSymbolicLink(),'Public output symlinks are forbidden');fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
}
function gates(run,provided,required=['G0','G1','G2','G3','G4']){const evidence=provided||run.researchIdentity?.gates;assert(evidence&&required.every(g=>evidence[g]?.passed===true&&/^[0-9a-f]{64}$/.test(evidence[g].receiptSha256)),'Verified required source/input/private-durability/baseline/software/GitHub stage receipt identities are required');return evidence;}
function requireChronologicalVerification(run){const receipt=run.privateChronologicalVerification;assert(run.researchIdentity?.privateChronologicalVerificationPassed===true&&receipt?.passed===true&&receipt.effectiveSourceIdentityMatches===true&&receipt.sourceGraphMatches===true&&receipt.inputContentMatches===true&&receipt.inputManifestMatches===true,'Raw replay requires passing private complete chronological, effective source, graph, input and manifest verification');return true;}
function main(){
 const args=process.argv.slice(2),stage=args.shift(),option=(name,defaultValue)=>{const i=args.indexOf('--'+name);return i===-1?defaultValue:args[i+1];};
 assert(['baseline','development','audit','validation','lock','compare'].includes(stage),'Usage: node analysis/analyze.cjs baseline|development|audit|validation|lock|compare --private-root DIR [options]; see analysis/README.md');
 const root=privateRoot(option('private-root')),matrix=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../experiments.json')));
 const verifyRemote=()=>option('lock-read-receipt')?verifyGitHubLockFromReadReceipt({receipt:read(privatePath(option('lock-read-receipt'),root)),matrix}):verifyGitHubLock({repoRoot:REPO,branch:option('lock-branch'),commit:option('lock-commit'),lockPath:option('lock-path'),matrix});
 if(stage==='lock'){
  const data=read(privatePath(option('selection-input'),root));const governance=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../governance-amendment.json')));const lock=createFinalistLock({...data,matrix,governance});assert(option('public-summary'),'--public-summary lock path is required');writePublic(option('public-summary'),lock);process.stdout.write(JSON.stringify({completed:true,stage,finalists:lock.finalists.map(f=>f.experimentId),validationPerformanceExposed:false,pushRequiredBeforeValidation:true})+'\n');return;
 }
 if(stage==='compare'){
  const data=read(privatePath(option('comparison-input'),root)),verified=verifyRemote();
  const report=compareFinalist({...data,verified});writePrivate(option('private-output'),report,root);if(option('public-summary'))writePublic(option('public-summary'),report);
  process.stdout.write(JSON.stringify({completed:true,stage,experimentId:report.experimentId,conditional:true,eligibleForAlphaClaim:false,productionChangesAuthorized:false})+'\n');return;
 }
 const run=read(privatePath(option('run'),root)),identity=run.researchIdentity;assert(identity,'Replay artifact must contain explicit researchIdentity');requireChronologicalVerification(run);const experimentId=option('experiment',identity.experimentId);assert(identity.experimentId===experimentId,'CLI experiment differs from replay metadata');
 const gateEvidence=option('gate-evidence')?read(privatePath(option('gate-evidence'),root)):undefined;gates(run,gateEvidence,stage==='baseline'?['G0','G1','G3','G4']:undefined);
 const baselineRole=identity.baselineRole;assert(['historical-audit','production-equivalent'].includes(baselineRole),'Replay baseline role missing or ambiguous');
 if(baselineRole==='production-equivalent')assert(identity.sourceCommit===PRODUCTION_COMMIT&&identity.baseSourceGraphSha256===PRODUCTION_GRAPH,'Production-equivalent source metadata mismatch');
 else assert(identity.sourceCommit==='006e067697385143684c7417b18bc7909c2d217e'&&identity.baseSourceGraphSha256==='ac7355c070966f6ce34fcbd5d930f93280c8d271dedb469146a5c27afa262fdb','Historical audit source metadata mismatch');
 if(stage==='baseline'){
  assert(experimentId==='champion'&&[12,25,50].includes(run.slippageBps),'Baseline-only stage permits independently replayed Champion 12/25/50 bps only');const summary=baselineSummary(run);writePrivate(option('private-output'),summary,root);if(option('public-summary'))writePublic(option('public-summary'),summary);process.stdout.write(JSON.stringify({completed:true,stage,baselineRole,sourceCommit:summary.sourceCommit,costBps:summary.costBps,validationSlicesExposed:false,eligibleForAlphaClaim:false})+'\n');return;
 }
 if(stage==='development')assert(baselineRole==='production-equivalent'&&run.slippageBps===25,'Development selection uses production-equivalent 25 bps only');
 if(stage==='audit')assert(baselineRole==='historical-audit'&&experimentId==='champion','Unrestricted audit diagnostics apply only to the separate saved historical implementation');
 let verified;if(stage==='validation'){verified=verifyRemote();authorizeValidation(run,experimentId,verified);}
 const benchmark=option('spy-history')?read(privatePath(option('spy-history'),root)):undefined,marks=option('opportunity-marks')?read(privatePath(option('opportunity-marks'),root)):undefined;
 const options={baselineRole,experimentId,spyHistory:benchmark,opportunityMarks:marks},card=stage==='development'?developmentCard(run,options):scorecard(run,options);
 if(verified)card.finalistLockVerification=verified.verification;
 writePrivate(option('private-output'),card,root);
 if(option('public-summary')){const summary=publicSummary(card);if(verified)summary.finalistLockVerification=verified.verification;writePublic(option('public-summary'),summary);}
 process.stdout.write(JSON.stringify({completed:true,stage,experimentId,baselineRole,sourceCommit:card.sourceCommit,inputContentSha256:card.inputContentSha256,conditional:true,eligibleForAlphaClaim:false,validationPerformanceExposed:stage==='validation'})+'\n');
}
if(require.main===module){try{main();}catch(error){process.stderr.write('Analysis blocked: '+error.message+'\n');process.exitCode=2;}}
module.exports={privateRoot,privatePath,writePrivate,writePublic,gates,requireChronologicalVerification};
