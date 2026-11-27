const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const fixture = require('./fixtures/c1-bounded-screen-continuation-source-seams.json');

const blob = source => createHash('sha1').update('blob ' + Buffer.byteLength(source) + '\0').update(source).digest('hex');

function restore(file, source) {
  const patch = fixture.files[file];
  if (!patch || blob(source) !== patch.afterHash) return source;
  for (const { before, after } of [...patch.chunks].reverse()) {
    assert.equal(source.split(after).length, 2, 'Unique bounded screen continuation inverse: ' + file);
    source = source.replace(after, () => before);
  }
  assert.equal(blob(source), patch.beforeHash, 'Exact deployed bounded screen source: ' + file);
  return source;
}

const readPrior = file => restore(file, readFileSync(file, 'utf8'));

module.exports = { restore, readPrior, blob };
