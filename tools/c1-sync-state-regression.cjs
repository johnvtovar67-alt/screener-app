const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const loader=createResearchModuleLoader(process.cwd());
const {cleanC1ControlState}=loader.load('lib/c1CapitalState.js');
const {c1DrawdownControl}=loader.load('lib/portfolioGovernor.js');
let stored=null;
const source=fs.readFileSync('pages/api/portfolio-sync.js','utf8')
 .replace(/^import .*;\n/gm,'').replace('export const config=','const config=')
 .replace('export default async function handler','async function handler');
const sandbox={cleanC1ControlState,createHash,console,Response,
 list:async()=>({blobs:stored?[{pathname:stored.path}]:[]}),
 get:async()=>stored?{statusCode:200,stream:new Response(stored.body).body}:null,
 put:async(path,body)=>{stored={path,body};}};
vm.createContext(sandbox);vm.runInContext(source+'\nglobalThis.handler=handler;',sandbox);
async function request(method,state){
 let payload,status;
 const req={method,query:{},headers:{authorization:'Bearer '+ 'x'.repeat(32)},body:{portfolio:[],c1ControlState:state}};
 const res={setHeader(){},status(s){status=s;return this;},json(p){payload=p;return this;}};
 await sandbox.handler(req,res);assert.equal(status,200);return payload;
}
(async()=>{
 const prior={version:2,highWater:100000,triggerDay:'2026-09-09',portfolioSignature:'before',reconciliationRequired:true,observedPortfolioSignature:'after'};
 await request('PUT',prior);
 const restored=(await request('GET')).c1ControlState;
 assert.equal(JSON.stringify(restored),JSON.stringify(cleanC1ControlState(prior)),'Actual PUT/GET must preserve risk identity');
 const result=c1DrawdownControl({swingEquity:87000,state:restored,portfolioSignature:'after',now:new Date('2026-09-10T15:00:00Z')});
 assert.equal(result.reconciliationRequired,true);assert.equal(result.cooldown,false);
 assert.equal(result.state.highWater,100000);assert.equal(result.state.triggerDay,'2026-09-09');
 await request('PUT',{highWater:100000,triggerDay:'2026-09-09'});
 assert.equal((await request('GET')).c1ControlState.reconciliationRequired,true,'Legacy identity must not be silently invented');
 await request('PUT',{});assert.equal(Object.keys((await request('GET')).c1ControlState).length,0);
 assert.equal(cleanC1ControlState({...prior,triggerDay:'2026-02-31'}).reconciliationRequired,true);
 console.log('PASS: API PUT/storage/GET preserves risk state; legacy records require reconciliation; edits cannot reset loss history.');
})().catch(e=>{console.error(e);process.exitCode=1;});
