// Reverse only the reviewed November 27 additions before older source oracles.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const seams = require('./fixtures/c1-recorded-opening-source-seams.json');

const blob = source => createHash('sha1').update('blob ' + Buffer.byteLength(source) + '\0').update(source).digest('hex');

function restore(file, source) {
  const seam = seams[file];
  if (!seam || blob(source) === seam.baselineBlob) return source;
  assert.equal(blob(source), seam.authorizedBlob, 'Complete November 27 recorded-opening source: ' + file);
  for (const {before, after} of [...seam.chunks].reverse()) {
    assert.equal(source.split(after).length, 2, 'Unique recorded-opening source seam: ' + file);
    source = source.replace(after, before);
  }
  assert.equal(blob(source), seam.baselineBlob, 'Unchanged pre-repair source oracle: ' + file);
  return source;
}

module.exports = {restore};
