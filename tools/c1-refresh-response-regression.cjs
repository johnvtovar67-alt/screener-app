// Actual client readers; synthetic bodies only, no network/account/storage I/O.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createResearchModuleLoader}=require('./research-module-loader.cjs');
const source=fs.readFileSync('lib/c1RefreshResponse.js','utf8').replace(/export (async )?function /g,(_,a)=>(a||'')+'function ');
const logs=[],box={console:{warn:(...args)=>logs.push(args)},Error,Set,Number,Array,setTimeout,clearTimeout};vm.createContext(box);
vm.runInContext(source+';globalThis.api={readC1AccountResponse,c1RefreshResponseError};',box);
const {readC1AccountResponse:read,c1RefreshResponseError:failure}=box.api;
const {parseTop5Response,readTop5Response}=createResearchModuleLoader().load('lib/top5Response.js');
const clone=value=>JSON.parse(JSON.stringify(value)),id='01234567-89ab-4cde-8f01-23456789abcd';
const decision={contract:'c1-account-decision-v1',decisionId:'synthetic:1',revision:1,current:false,
 positions:[{symbol:'SYNTHETIC',shares:2,avgCost:100,stops:[],exits:[],reviewRules:[]}],opportunities:[],stockScreen:{candidates:[{symbol:'SYNTHETIC'}]}};
const body={decision,executionDecision:{...decision,decisionId:'synthetic:1:opening'},openingPlan:null,manualRecommendations:null,unknownExtension:{kept:true}};
const response=(value,status=200)=>({ok:status>=200&&status<300,status,headers:{get:()=>id},json:async()=>value});
async function main(){
 const valid=clone(body);assert.equal(await read(response(valid)),valid,'Reader preserves complete successful object identity, all fields and values');
 for(const status of [400,401,403,404,409,422,500,503]){
  const error={error:'existing controlled failure',code:'EXISTING_CODE'};assert.equal(await read(response(error,status)),error,'HTTP error dispatch remains the caller contract');
 }
 for(const value of [null,[],{}, {decision:null}, {decision:{...decision,positions:null}}, {decision:{...decision,positions:{}}},
  {decision:{...decision,positions:[null]}}, {decision:{...decision,positions:[[]]}}, {decision:{...decision,positions:[{}]}},
  {decision:{...decision,opportunities:{}}}, {decision:{...decision,stockScreen:{candidates:[null]}}},
  {decision:{...decision,revision:NaN}}, {decision:{...decision,decisionId:''}}, {decision,executionDecision:{...decision,positions:null}}]){
  await assert.rejects(read(response(value)),error=>error.code==='ACCOUNT_RESPONSE_INVALID'&&error.requestId===id);
 }
 for(const [name,code] of [['SyntaxError','ACCOUNT_RESPONSE_JSON_INVALID'],['TypeError','ACCOUNT_RESPONSE_INTERRUPTED']]){
  const sentinel='PRIVATE_BEARER_ACCOUNT_PROVIDER_BODY';
  await assert.rejects(read({...response(null),json:async()=>{const e=new Error(sentinel);e.name=name;throw e;}},{stage:'opening-review'}),error=>error.code===code&&error.stage==='opening-review'&&!error.message.includes(sentinel));
 }
 for(const requestId of [id,'0123456789',null,'PRIVATE_KEY','A'.repeat(500),'https://private.invalid?apikey=PRIVATE_KEY']){
  const res={status:200,headers:{get:()=>requestId}};
  const error=failure(res,{message:'Controlled copy',stage:'PRIVATE_BODY',code:'PRIVATE_TOKEN'});
  assert.equal(error.code,'ACCOUNT_RESPONSE_INVALID');assert.equal(error.stage,'account-read');
  assert.equal(error.requestId,[id,'0123456789'].includes(requestId)?requestId:null);
 }
 assert(logs.length);for(const [prefix,text] of logs){assert.equal(prefix,'C1_REFRESH_FAILURE');const value=JSON.parse(text);assert.deepEqual(Object.keys(value).sort(),['code','requestId','stage','status']);assert(!text.includes('PRIVATE')&&!text.includes('SYNTHETIC')&&!text.includes('shares')&&!text.includes('avgCost'));}
 const isolated={console:{warn(){throw Error('Logger failed');}},Error,Set,Number,Array,setTimeout,clearTimeout};vm.createContext(isolated);vm.runInContext(source+';globalThis.fail=c1RefreshResponseError;',isolated);
 assert.equal(isolated.fail({status:503,headers:{get(){throw Error('Bad header');}}},{message:'Controlled failure',stage:'account-read',code:'ACCOUNT_RESPONSE_INTERRUPTED'}).message,'Controlled failure');
 for(const [field,value] of [['stops',null],['stops',[null]],['exits',null],['exits',[null]],['reviewRules',{}],['reviewRules',[null]],['recentMomentumReviews',{}]]){
  const invalid=clone(body);invalid.decision.positions[0][field]=value;await assert.rejects(read(response(invalid)),error=>error.code==='ACCOUNT_RESPONSE_INVALID');
 }
 let deadline,cleared=0,reads=0;
 const clocked={console:{warn(){}},Error,Set,Number,Array,setTimeout:(callback,ms)=>{assert.equal(ms,90000);deadline=callback;return 7;},clearTimeout:timer=>{assert.equal(timer,7);cleared++;}};
 vm.createContext(clocked);vm.runInContext(source+';globalThis.read=readC1AccountResponse;',clocked);
 const stalled=clocked.read({...response(null),json:()=>{reads++;return new Promise(()=>{});}}, {stage:'opening-review'});
 await Promise.resolve();deadline();await assert.rejects(stalled,error=>error.code==='ACCOUNT_RESPONSE_TIMEOUT'&&error.stage==='opening-review');
 assert.equal(reads,1);assert.equal(cleared,1,'Body expiry clears its timer without another request or mutation abort');
 let settle;const delayed=read({...response(body),json:()=>new Promise(resolve=>{settle=resolve;})});let finished=false;delayed.then(()=>{finished=true;});await Promise.resolve();assert.equal(finished,false);settle(body);assert.equal(await delayed,body);
 const screen={stocks:[{symbol:'SYNTHETIC',price:100}],meta:{},extension:'retained'};assert.deepEqual(parseTop5Response(JSON.stringify(screen)),screen);
 for(const stocks of [[null],[false],['PRIVATE_BODY'],[[]]])assert.throws(()=>parseTop5Response(JSON.stringify({stocks,meta:{}})),error=>error.code==='SCREEN_RESPONSE_INVALID');
 await assert.rejects(readTop5Response({ok:true,status:200,headers:{get:()=> '0123456789'},text:async()=>{throw Error('PRIVATE_PROVIDER_BODY');}}),error=>error.code==='SCREEN_RESPONSE_INTERRUPTED'&&error.requestId==='0123456789'&&!error.message.includes('PRIVATE'));
 console.log('PASS: account/screen readers reject malformed successful collections before view publication; exact valid/error identity, interrupted/invalid JSON, delayed settlement and fixed secret-free stage/request correlation preserved.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
