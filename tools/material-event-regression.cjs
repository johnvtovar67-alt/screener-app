const fs=require('fs');
const vm=require('vm');
const assert=(c,m)=>{if(!c)throw new Error(m)};
let src=fs.readFileSync('lib/expertDecision.js','utf8');
src=src.replace(/^import .*$/m,"const marketSessionProgress=()=>1; const pacedRelativeVolume=s=>{const v=Number(s?.volume),a=Number(s?.avgVolume??s?.averageVolume??s?.avgVolume30Day);return v>0&&a>0?v/a:null;}; const marketExecutionState=()=>({isOpen:false,sessionDay:'2026-08-28'}); const marketObservationSessionDay=()=> '2026-08-28';");
src=src.replace(/export function /g,'function ');
src+='\nmodule.exports={portfolioDecision};';
const sandbox={module:{exports:{}},exports:{},console,Math,Number,String,Object,Array,Boolean,Date,Set,Map};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const {portfolioDecision}=sandbox.module.exports;

function stock(extra={}){return {symbol:'TEST',price:100,fiftyDayAverage:95,twoHundredDayAverage:90,volume:1200000,avgVolume:1000000,dayChangePct:0.5,score:72,fundamentalScore:74,technicalScore:65,momentumScore:60,relativeStrengthScore:66,entryQualityScore:62,riskScore:48,extensionRisk:35,finalDecision:{action:'Watch',reason:'Broad screen says watch.'},...extra};}
function rec(extra={}){return {score:72,businessQualityScore:74,technicalScore:65,momentumScore:60,leadershipScore:66,entryQualityScore:62,riskScore:48,extensionRisk:35,...extra};}
const position={role:'Swing',pnlPct:0,weightPct:5};

let r=portfolioDecision({stock:stock(),recommendation:rec(),position});
assert(r.action==='Hold','Normal young/healthy Swing must remain a normal Hold, not an event escalation');

r=portfolioDecision({stock:stock({eventRisk:{material:true,blockNewCapital:true,status:'blocked',label:'Material company event',detail:'Outcome is unresolved.'}}),recommendation:rec(),position});
assert(r.action==='Review','Material unresolved event must immediately override an ordinary Swing Hold with Review');
assert(r.eventRisk.materialReview===true&&!r.eventRisk.thesisBreak,'Material review metadata must be explicit');
assert(/overrides the normal time-in-trade stage/.test(r.reason),'Material event Review must state that time stage is overridden');

r=portfolioDecision({stock:stock({eventRisk:{blockNewCapital:true,thesisBreak:true,status:'blocked',label:'Thesis invalidated',detail:'Core premise no longer holds.'}}),recommendation:rec(),position});
assert(r.action==='Exit','Explicit thesis-breaking event must immediately Exit a Swing regardless of age');
assert(r.eventRisk.thesisBreak===true,'Thesis-break metadata must be explicit');

const broken=stock({price:70,fiftyDayAverage:95,twoHundredDayAverage:90,dayChangePct:-6,technicalScore:20,momentumScore:18,relativeStrengthScore:25,entryQualityScore:20,riskScore:90,score:30,finalDecision:{action:'Avoid',reason:'Broken'}});
r=portfolioDecision({stock:broken,recommendation:rec({score:30,businessQualityScore:35,technicalScore:20,momentumScore:18,leadershipScore:25,entryQualityScore:20,riskScore:90}),position:{...position,pnlPct:-12}});
assert(r.action==='Exit','Extreme technical/trade breakdown must still Exit without waiting for a time-in-trade stage');

const page=fs.readFileSync('pages/index.js','utf8');
assert(page.includes('if(base.action==="Hold")return reviewedHold'), 'Time-in-trade reunderwrite must run after the base decision remains Hold');
assert(page.includes('decision:{...hold,action:"Hold"}'), 'An Add reconciled to Hold must receive the same existing-position re-underwrite');
console.log('MATERIAL EVENT PASS: normal noise, immediate Review, thesis-break Exit, technical-break Exit, and time-stage precedence verified.');
