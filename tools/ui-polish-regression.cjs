const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['market radar state',s.includes('const[marketRadar,setMarketRadar]')],
  ['market radar render',s.includes('className="marketRadarBar"')],
  ['market cycle meta wiring',s.includes('marketCycleRadar')],
  ['theme leadership fallback',s.includes('themeLeadership')],
  ['date label removed',!s.includes('<small>Opened</small>')],
  ['date accessibility retained',s.includes('aria-label="Position opened date"')],
  ['standalone universe disclosure',s.includes('outsideBroadUniverse')&&s.includes('outside today’s Opportunities universe')],
  ['empty On Deck confirmation',s.includes('No stocks currently qualify for On Deck.')&&s.includes('Reload completed.')],
  ['visible reload engagement',s.includes('650-(Date.now()-started)')],
  ['theme feed health isolated',s.includes('themeFeedHealth')&&s.includes('feedHealth={themeFeedHealth}')]
];
const app=fs.readFileSync('pages/_app.js','utf8');
checks.push(['theme reload preserves client state',app.includes('clearTop5Cache();emitFeedNotice("");')&&!app.includes('e.preventDefault();e.stopPropagation();forceLiveRefresh();')]);
const failed=checks.filter(([,ok])=>!ok);
if(failed.length){for(const [name] of failed)console.error('FAIL:',name);process.exit(1);}
console.log(`UI POLISH PASS: ${checks.length} market-leadership/date-control checks passed.`);
