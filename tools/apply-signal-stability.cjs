const fs=require('fs');

function patchTop5(){
  const path='pages/api/top5.js';
  let src=fs.readFileSync(path,'utf8');
  const importLine='import {seedDurableStrongBuyMemory} from "../../lib/strongBuyPersistence";';
  if(!src.includes(importLine)){
    const anchor='import {finalizeBroadOpportunityDecisions,relativeCapitalScore} from "../../lib/opportunityDecision";';
    if(!src.includes(anchor))throw new Error('top5 import anchor missing');
    src=src.replace(anchor,`${anchor}\n${importLine}`);
  }
  const old='rows=finalizeBroadOpportunityDecisions(rows);';
  const replacement='await seedDurableStrongBuyMemory();rows=finalizeBroadOpportunityDecisions(rows);';
  if(!src.includes(replacement)){
    if(!src.includes(old))throw new Error('top5 finalize anchor missing');
    src=src.replace(old,replacement);
  }
  fs.writeFileSync(path,src);
}

function patchPortfolioRefreshOrdering(){
  const path='pages/index.js';
  let src=fs.readFileSync(path,'utf8');
  const old="try{const [sr,pr]=await Promise.all([fetch(`/api/top5?theme=opportunities`,{cache:\"no-store\"}),fetch('/api/performance',{cache:'no-store'})]),sd=await sr.json(),pd=await pr.json();if(sr.ok&&Array.isArray(sd.stocks))snapshot=sd.stocks;if(pr.ok&&Array.isArray(pd.records))performance=pd.records;}catch{}";
  const replacement="try{const sr=await fetch(`/api/top5?theme=opportunities`,{cache:\"no-store\"}),sd=await sr.json();if(sr.ok&&Array.isArray(sd.stocks))snapshot=sd.stocks;const pr=await fetch('/api/performance',{cache:'no-store'}),pd=await pr.json();if(pr.ok&&Array.isArray(pd.records))performance=pd.records;}catch{}";
  if(!src.includes(replacement)){
    if(!src.includes(old))throw new Error('portfolio refresh ordering anchor missing');
    src=src.replace(old,replacement);
  }
  fs.writeFileSync(path,src);
}

patchTop5();
patchPortfolioRefreshOrdering();
console.log('Applied durable Strong Buy persistence and deterministic signal-history refresh ordering.');
