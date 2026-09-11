const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createResearchModuleLoader } = require('./research-module-loader.cjs');
const { buildC1PriorSessionPrices } = createResearchModuleLoader(process.cwd()).load('lib/c1LiveInput.js');
const date = '2026-09-10';
const histories = {
 'BRK-B': [{date,close:507}], 'BF-B': [{date,close:26.59}],
 ABBV: [{date,close:255}], MISSING: [{date:'2026-09-11',close:10}]
};
const before = JSON.stringify(histories);
const result = buildC1PriorSessionPrices(histories,Object.keys(histories),date);
assert.equal(result.closes['BRK.B'],507);
assert.equal(result.closes['BF.B'],26.59);
assert.equal(result.closes.ABBV,255,'A genuine revised price must never be replaced with the saved value');
assert.equal(result.closes.MISSING,null,'Missing data must remain missing');
assert.equal(Object.hasOwn(result.closes,'BRK-B'),false);
assert.equal(Object.hasOwn(result.closes,'BF-B'),false);
assert.equal(JSON.stringify(histories),before,'Provider evidence is immutable');
assert.equal(buildC1PriorSessionPrices({'BRK.B':[{date,close:507}]},['BRK.B'],date).closes['BRK.B'],507);
assert.throws(()=>buildC1PriorSessionPrices(histories,['BRK-B','BRK.B'],date),/Duplicate canonical/);
assert.throws(()=>buildC1PriorSessionPrices(histories,['BF-B','BF.B'],date),/Duplicate canonical/);
assert.ok(fs.readFileSync('lib/c1LiveInputProvider.js','utf8').includes('buildC1PriorSessionPrices(histories, symbols, previousDate)'));
console.log('PASS: FMP share-class anchors match model identities; revisions, missing values and original evidence remain unchanged');
