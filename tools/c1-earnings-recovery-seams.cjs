const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-earnings-recovery-source-seam.json');
const hash=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
exports.restore=source=>{
 source=require('./c1-earnings-symbol-seams.cjs').restore(source);
 assert.equal(hash(source),fixture.afterHash,'Exact reviewed earnings recovery module');
 for(const [after,before]of fixture.seams){assert.equal(source.split(after).length,2,'Unique earnings recovery inverse');source=source.replace(after,before);}
 assert.equal(hash(source),fixture.beforeHash,'Entire pre-repair event source is unchanged outside the reviewed seams');
 return source;
};
