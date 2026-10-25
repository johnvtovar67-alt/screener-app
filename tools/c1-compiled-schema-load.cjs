// Import-only compiled route diagnostic. Never invoke a handler or real network.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const buildRoot=path.resolve(process.argv[2]||process.cwd()),expected=Number(process.argv[3]);
assert.ok([0,1].includes(expected),'Expected simulator initialization count must be0 or1');
process.env={NODE_ENV:'production'};
let networkCalls=0;
const forbiddenNetwork=()=>{networkCalls++;throw Error('Network forbidden during compiled import-only diagnostic');};
global.fetch=forbiddenNetwork;
for(const name of ['node:http','node:https']){const api=require(name);api.request=forbiddenNetwork;api.get=forbiddenNetwork;}
require('node:net').Socket.prototype.connect=forbiddenNetwork;
require('node:tls').connect=forbiddenNetwork;
const chunkRoot=path.join(buildRoot,'.next/server/chunks'),targets=[];
for(const file of fs.readdirSync(chunkRoot).filter(file=>file.endsWith('.js'))){
 const source=fs.readFileSync(path.join(chunkRoot,file),'utf8'),exports={};
 vm.runInNewContext(source,{exports,module:{exports},require:()=>{throw Error('Unexpected chunk top-level dependency');}},{filename:file});
 for(const [id,factory]of Object.entries(exports.modules||{})){
  const text=String(factory);
  if(!['researchRankMode','unresolvedUniverseRemovals','rankRegimeDiagnostics'].every(marker=>text.includes(marker)))continue;
  const args=text.match(/^(?:function[^\(]*)?\(([^)]*)\)/)?.[1].split(',').map(v=>v.trim());
  assert.ok(args?.[2],'Compiled factory require parameter must be identified');
  const escaped=args[2].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(new RegExp('\\b'+escaped+'\\(\\d+\\)').test(text))continue;
  targets.push({id,file,bytes:Buffer.byteLength(text)});
 }
}
assert.equal(targets.length,1,'Identify the actual pure simulator factory, not a fixed webpack ID');
const runtime=require(path.join(buildRoot,'.next/server/webpack-api-runtime.js'));
let initializations=0,registered=0;
for(const {id}of targets){let wrapped;Object.defineProperty(runtime.m,id,{configurable:true,
 get(){return wrapped;},set(factory){registered++;wrapped=function(...args){initializations++;return factory(...args);};}});}
// Fail fast on unexpected synchronous string-path reads. This diagnostic bound
// is not a complete filesystem sandbox. It never reads environment files.
const realRead=fs.readFileSync;
fs.readFileSync=function(file,...args){if(typeof file==='string'){
 const resolved=path.resolve(file);assert.ok(resolved.startsWith(buildRoot+path.sep),'Unexpected file read outside compiled fixture root');
 assert.ok(!path.basename(resolved).startsWith('.env'),'Environment-file read forbidden');
 }return realRead.call(this,file,...args);};
(async()=>{
 const route=await require(path.join(buildRoot,'.next/server/pages/api/c1-account.js'));
 assert.ok(route&&typeof route==='object','Actual compiled route import must finish');
 assert.equal(initializations,expected);assert.equal(networkCalls,0);
 console.log(JSON.stringify({routeImported:true,handlerInvoked:false,networkCalls,simulatorInitializations:initializations,registeredSimulatorFactories:registered,simulatorFactories:targets}));
})().catch(error=>{console.error(error);process.exitCode=1;});
