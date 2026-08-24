const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['Desktop open-date column', '<th>Open Date</th>'],
  ['Swing non-cash open date', 's.role==="Swing"&&!CASH.includes(sym(s))&&s.openedAt'],
  ['Human-readable date', 'toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})'],
  ['Desktop date cell', 'className="openDateCell"'],
  ['Mobile open-date field', '<small>Open Date</small>'],
  ['No chip date class', 'positionOpenedDate']
];
const failed=[];
for(const [name,needle] of checks){
  if(name==='No chip date class'){if(s.includes(needle))failed.push(name);}
  else if(!s.includes(needle))failed.push(name);
}
if(failed.length){console.error('OPEN DATE DISPLAY FAIL:',failed.join(', '));process.exit(1);}
console.log('OPEN DATE DISPLAY PASS: dates stay in Portfolio Intelligence for non-cash Swing holdings only.');
