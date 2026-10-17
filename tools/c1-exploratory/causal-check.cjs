const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {compile}=require('./compile.cjs'),{execute}=require('./runner.cjs');
const dir=process.argv[2],raw=JSON.parse(fs.readFileSync(path.join(dir,'raw.json'))),ds=JSON.parse(fs.readFileSync(path.join(dir,'compiled.json')));
const prefix={...raw,sessions:raw.sessions.filter(s=>s.date<='2025-01-02')},other=compile(prefix);
assert.equal(JSON.stringify(other.sessions),JSON.stringify(ds.sessions.slice(0,2)),'Serialized prefix differs (JSON canonicalizes signed zero)');
// Poison all future prices: compiler-prefix equality proves they're unnecessary.
const future=structuredClone(raw);for(const s of future.sessions)if(s.date>'2025-01-02')for(const p of s.prices){p.open=p.high=p.low=p.close=1;p.volume=0;}
const poisoned=compile({...future,sessions:future.sessions.filter(s=>s.date<='2025-01-02')});assert.equal(JSON.stringify(other.sessions),JSON.stringify(poisoned.sessions));
const report={status:'PASS',compilerPrefixSessions:2,earlyOutputIdentity:'exact JSON serialization; signed zero canonicalized by saved dataset',futureDataRequired:false,scope:'Signal causality only; not historical authenticity or data qualification',compiledHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compiled.json'))).digest('hex')};fs.writeFileSync(path.join(dir,'causal-gates.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(report);
