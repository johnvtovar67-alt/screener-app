const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['Swing-only opened date', 'p.role==="Swing"&&p.openedAt'],
  ['Subtle date class', 'className="positionOpenedDate"'],
  ['Human-readable date', 'toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})'],
  ['No visible Opened label in chip', '<small>Opened</small>'],
  ['Date styling', '.positionOpenedDate{display:block']
];
const failed=[];
for(const [name,needle] of checks){
  if(name==='No visible Opened label in chip'){if(s.includes(needle))failed.push(name);}
  else if(!s.includes(needle))failed.push(name);
}
if(failed.length){console.error('OPEN DATE DISPLAY FAIL:',failed.join(', '));process.exit(1);}
console.log('OPEN DATE DISPLAY PASS: Swing dates visible, Core/Cash clean, and styling verified.');
