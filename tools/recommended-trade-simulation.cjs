const fs=require('fs');
const vm=require('vm');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function load(file,{imports={},exports=[]}={}){let src=fs.readFileSync(file,'utf8').replace(/^import .*$/gm,'').replace(/export function /g,'function ').replace(/export const /g,'const ');src+=`\nmodule.exports={${exports.join(',')}};`;const box={module:{exports:{}},exports:{},console,Date,Intl,Math,Number,String,Object,Array,Set,Map,Boolean,RegExp,...imports};vm.createContext(box);vm.runInContext(src,box,{filename:file});return box.module.exports;}
const market=load('lib/marketSession.js',{exports:['marketObservationSessionDay']});
const governor=load('lib/portfolioGovernor.js',{imports:market,exports:['factorFor','factorWeightsFor','signalPersistence','portfolioRiskSnapshot','capitalAllowance','portfolioContributionGate','capitalSignalEligible','rotationGate']});
const capital=load('lib/capitalSimulation.js',{imports:governor,exports:['cloneProjectedRisk','applyProjectedBuy','applyProjectedSale','releaseExitRisk','wholeShareExecution']});
const personal=load('lib/personalCapitalPolicy.js',{exports:['applyPersonalCapitalPolicy']});

const rows=[
  {symbol:'NVDA',role:'Swing',value:6000,primaryTheme:'AI Compute & Platforms'},
  {symbol:'OKE',role:'Swing',value:5000,primaryTheme:'Energy'},
  {symbol:'KO',role:'Swing',value:5000,primaryTheme:'Consumer Staples'},
  {symbol:'CASH',role:'Swing',value:4000},
];
const risk=governor.portfolioRiskSnapshot(rows),projected=capital.cloneProjectedRisk(risk),exitPool={symbol:'NVDA',stock:rows[0],sourceValue:6000,remaining:6000};
const target={symbol:'DLR',price:190,primaryTheme:'AI Compute & Platforms',riskPlan:{invalidationPrice:178,firstTrimPrice:218}};
const before=governor.capitalAllowance({target,action:'Buy',requested:2000,risk:projected});
capital.releaseExitRisk(projected,[exitPool]);
const after=governor.capitalAllowance({target,action:'Buy',requested:2000,risk:projected});
assert(after.amount>before.amount,'an exiting position must release its full factor exposure before replacement sizing');
assert(projected.positions.NVDA.value===0,'full Exit must be absent from projected position risk');
assert(projected.swingCapital===risk.swingCapital,'selling to cash must not shrink the Swing-capital denominator');

const execution=capital.wholeShareExecution(2000,95.62);
assert(execution.shares===20&&execution.amount<=2000&&execution.residual>=0,'whole-share execution must never spend more than its approved budget');
assert(capital.wholeShareExecution(100,150).shares===0,'an unaffordable nominal share must not create fractional or negative cash');

const persistent={persistent:true,historyAvailable:true},oneSession={persistent:false,historyAvailable:true},unavailable={persistent:false,historyAvailable:false};
assert(governor.capitalSignalEligible({action:'Buy',persistence:persistent}).pass,'persistent ordinary Buy should be fundable');
assert(!governor.capitalSignalEligible({action:'Buy',persistence:oneSession}).pass,'one-session ordinary Buy must remain qualified but unfunded');
assert(!governor.capitalSignalEligible({action:'Buy',persistence:unavailable}).pass,'missing durable history must fail closed');
assert(governor.capitalSignalEligible({action:'Strong Buy',persistence:oneSession}).pass,'legitimate Strong Buy must not inherit the ordinary-Buy delay');

const candidates=[
  {symbol:'ALL',action:'Strong Buy',score:91,price:260,persistence:oneSession,primaryTheme:'Insurance',riskPlan:{invalidationPrice:245,firstTrimPrice:306}},
  {symbol:'OKE',action:'Buy',score:85,price:95,persistence:persistent,primaryTheme:'Energy',riskPlan:{invalidationPrice:89,firstTrimPrice:112}},
  {symbol:'KO',action:'Buy',score:82,price:90,persistence:oneSession,primaryTheme:'Consumer Staples',riskPlan:{invalidationPrice:83,firstTrimPrice:106}},
];
const allocationRisk=governor.portfolioRiskSnapshot([{symbol:'CASH',role:'Swing',value:5000},{symbol:'BASE',role:'Swing',value:15000,primaryTheme:'Other'}]),allocationProjected=capital.cloneProjectedRisk(allocationRisk);let cash=5000;const orders=[];
for(const candidate of candidates.sort((a,b)=>b.score-a.score)){
  if(!governor.capitalSignalEligible({target:candidate,action:candidate.action,persistence:candidate.persistence}).pass)continue;
  const allowance=governor.capitalAllowance({target:candidate,action:candidate.action,requested:Math.min(2000,cash),risk:allocationProjected}),order=capital.wholeShareExecution(allowance.amount,candidate.price),contribution=governor.portfolioContributionGate({target:candidate,approvedAmount:order.amount,risk:allocationProjected,existingValue:0});
  if(allowance.blocked||!contribution.pass||order.shares<1)continue;orders.push({...order,symbol:candidate.symbol});cash-=order.amount;capital.applyProjectedBuy(allocationProjected,candidate,order.amount);
}
assert(orders.some(x=>x.symbol==='ALL')&&orders.some(x=>x.symbol==='OKE'),'ranked simulation should fund eligible Strong Buy and persistent Buy when risk capacity exists');
assert(!orders.some(x=>x.symbol==='KO'),'ranked simulation must not fund a one-session ordinary Buy');
assert(orders.reduce((sum,x)=>sum+x.amount,0)<=5000&&cash>=0,'mock recommendations must conserve cash');

const missingPlan={symbol:'NOPLAN',price:50,primaryTheme:'Other'},noPlan=governor.portfolioContributionGate({target:missingPlan,approvedAmount:1500,risk:allocationProjected,existingValue:0});
assert(!noPlan.pass,'new position without valid upside and invalidation levels must fail the contribution gate');

const schw=personal.applyPersonalCapitalPolicy({symbol:'SCHW',finalDecision:{action:'Strong Buy',reason:'analytically qualified'}});
assert(schw.finalDecision.action==='Avoid'&&schw.finalDecision.personalCapitalBlocked,'personal SCHW concentration block must survive a Strong Buy input');

console.log(`RECOMMENDED TRADE SIMULATION PASS: ${orders.map(x=>`${x.symbol} ${x.shares}sh`).join(', ')} funded; nonpersistent KO excluded; cash and factor risk conserved.`);
