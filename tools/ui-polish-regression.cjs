const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['market radar state',s.includes('const[marketRadar,setMarketRadar]')],
  ['market radar render',s.includes('className="marketRadarBar"')],
  ['market cycle meta wiring',s.includes('marketCycleRadar')],
  ['theme leadership fallback',s.includes('themeLeadership')],
  ['date label removed',!s.includes('<small>Opened</small>')],
  ['date accessibility retained',s.includes('aria-label="Position opened date"')]
];
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){for(const [name] of failed)console.error('FAIL:',name);process.exit(1);}
console.log(`UI POLISH PASS: ${checks.length} market-leadership/date-control checks passed.`);
