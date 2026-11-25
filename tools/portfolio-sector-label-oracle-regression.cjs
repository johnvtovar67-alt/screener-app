const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const inverse=require('./portfolio-sector-label-seams.cjs'),fixture=require('./fixtures/portfolio-sector-label-source-seams.json');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.equal(fixture.contract,'portfolio-sector-label-source-inverse-v1');
assert.equal(fixture.baselineCommit,'6398f3f33df67bf61ddceb099d9bbe5eff301a34');
assert.equal(hash('tools/fixtures/portfolio-sector-label-source-seams.json'),'fb74dc6874cbbf6c73915b6e7bf2deab3482c816051bf7f63b0344e1bcca5ace');
assert.equal(hash('lib/portfolioSectorLabel.js'),'4bd8cce7d484ee585764906a9e56eca4f34cdb6a13d645b0999b48ecac8623fa');
assert.deepEqual(Object.keys(fixture.files),['pages/index.js']);
for(const [file,patch]of Object.entries(fixture.files)){
 const current=require('./c1-planned-sale-attribution-seams.cjs').restore(file,fs.readFileSync(file,'utf8')),prior=inverse.restore(file,current);
 assert.equal(inverse.blob(current),patch.afterHash);assert.equal(inverse.blob(prior),patch.beforeHash);
 assert.equal(inverse.restore(file,prior),prior,'The exact inverse is idempotent');
 const unknown=current+'\n/* unreviewed source retains its own identity */\n';
 assert.equal(inverse.restore(file,unknown),unknown,'No fuzzy source normalization');
 assert.equal(require('./c1-stock-momentum-exit-seams.cjs').restore(file,unknown),unknown,'The existing composed chain rejects unknown source');
}
for(const [file,pin]of [
 ['tools/fixtures/c1-sell-quantity-summary-source-seams.json','c6bb8f8c572f2197a02e321111e45f5f7f3e430cdfe619016ed4212fb75d37df'],
 ['tools/fixtures/c1-stock-momentum-exit-source-seams.json','f22de344ef352b1b1c7ec059acb8526bfad7fc69a4539584fe1ff549398c8fa8'],
 ['tools/fixtures/c1-account-policy-source-seams.json','87fc19d0285cb01dc5cb70c3eb66295ec24fce48453b116dddce2130ef8de299']
])assert.equal(hash(file),pin,'Published policy/source evidence remains unchanged');
const consumers=[];
function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=dir+'/'+entry.name;if(entry.isDirectory())visit(file);
 else if(file!=='lib/portfolioSectorLabel.js'&&/\.[jt]sx?$/.test(file)&&fs.readFileSync(file,'utf8').includes('portfolioSectorLabel'))consumers.push(file);
}}
for(const dir of ['lib','components','pages'])visit(dir);
assert.deepEqual(consumers,['pages/index.js'],'Display fallbacks never feed C1 risk, selection, recording or financial calculations');
console.log('PASS: exact portfolio display inverse, unchanged published policy fixtures, unknown-source rejection and presentation-only helper consumption.');
