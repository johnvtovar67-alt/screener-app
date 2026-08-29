import {factorFor,factorWeightsFor} from './portfolioGovernor';

const symbol=s=>String(s?.symbol||s?.ticker||'').toUpperCase();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};

export function cloneProjectedRisk(risk={}){return{...risk,factors:{...(risk.factors||{})},factorPct:{...(risk.factorPct||{})},positions:Object.fromEntries(Object.entries(risk.positions||{}).map(([key,value])=>[key,{...value,factorWeights:{...(value?.factorWeights||{})}}]))};}

export function applyProjectedBuy(risk,stock,amount){const key=symbol(stock),weights=factorWeightsFor(stock),value=n(amount);if(!(value>0))return risk;for(const[factor,weight]of Object.entries(weights)){risk.factors[factor]=n(risk.factors[factor])+value*weight;risk.factorPct[factor]=risk.swingCapital?risk.factors[factor]/risk.swingCapital:0;}const position=risk.positions[key]||{value:0,pctSwing:0,factor:factorFor(stock),factorWeights:weights};position.value=n(position.value)+value;position.pctSwing=risk.swingCapital?position.value/risk.swingCapital:0;position.factorWeights=weights;risk.positions[key]=position;return risk;}

export function applyProjectedSale(risk,stock,amount){const key=symbol(stock),weights=factorWeightsFor(stock),value=Math.max(0,n(amount));for(const[factor,weight]of Object.entries(weights)){risk.factors[factor]=Math.max(0,n(risk.factors[factor])-value*weight);risk.factorPct[factor]=risk.swingCapital?risk.factors[factor]/risk.swingCapital:0;}if(risk.positions[key]){risk.positions[key].value=Math.max(0,n(risk.positions[key].value)-value);risk.positions[key].pctSwing=risk.swingCapital?risk.positions[key].value/risk.swingCapital:0;}return risk;}

export function releaseExitRisk(risk,exitPools=[]){for(const pool of exitPools)applyProjectedSale(risk,pool.stock,pool.sourceValue);return risk;}

export function wholeShareExecution(amount,price){const budget=Math.max(0,n(amount)),unit=n(price);if(!(budget>0&&unit>0))return{shares:0,amount:0,residual:budget};const shares=Math.floor((budget+1e-6)/unit),invested=shares*unit;return{shares,amount:invested,residual:Math.max(0,budget-invested)};}
