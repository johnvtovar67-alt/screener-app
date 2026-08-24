const fs=require('fs');
const s=fs.readFileSync('pages/index.js','utf8');
const checks=[
  ['cash date suppressed','!CASH.includes(sym(s))&&s.openedAt'],
  ['cash dry powder label','cashDryPowder?"Dry Powder":"Price"'],
  ['cash total value','cashDryPowder?money(s.value):money(price(s))'],
  ['cash unit price','$1.00/share'],
  ['cash value styling','className="cashValue"']
];
const failed=checks.filter(([,needle])=>!s.includes(needle)).map(([name])=>name);
if(failed.length){console.error('CASH DISPLAY FAIL:',failed.join(', '));process.exit(1);}
console.log('CASH DISPLAY PASS: cash has no open date and exposes dry powder plus $1/share unit cost.');
