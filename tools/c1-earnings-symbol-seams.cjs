const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const fixture=require('./fixtures/c1-earnings-symbol-source-seam.json');
const hash=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
exports.restore=source=>{
 assert.equal(hash(source),fixture.afterHash,'Exact reviewed earnings symbol module');
 for(const [after,before]of fixture.seams){assert.equal(source.split(after).length,2,'Unique earnings symbol inverse');source=source.replace(after,before);}
 assert.equal(hash(source),fixture.beforeHash,'Entire pre-symbol-repair event source is preserved');
 return source;
};
