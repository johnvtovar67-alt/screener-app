// Manufactured fixtures only. The injected private getter makes no network calls.
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, statSync, symlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {recoverStage2} from './recover_stage2.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'c1-stage2-recovery-test-'));
const run = 'stage2-synthetic-local';
const prefix = 'research/c1-rotation-2025q1/stages/' + run + '/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let serial = 0;

function fixture(change = () => {}) {
  const inputs = new Map();
  const manifest = Buffer.from(JSON.stringify({contract: 'c1-rotation-stage2-manifest-v1', requests: []}));
  const gate = Buffer.from(JSON.stringify({contract: 'c1-rotation-stage2-recovery-gate-v1', passed: true}));
  inputs.set(prefix + 'manifest.json.gz', gzipSync(manifest));
  inputs.set(prefix + 'recovery-gate.json.gz', gzipSync(gate));
  const bodies = [
    Buffer.from('[{"synthetic":true}]'), Buffer.from('quota boundary reached'),
    Buffer.alloc(0), Buffer.from('<error>manufactured fixture</error>'),
  ];
  const calls = bodies.map((body, index) => {
    const response_file = `response-${String(index + 1).padStart(2, '0')}.json`;
    const compressed = gzipSync(body);
    inputs.set(prefix + response_file + '.gz', compressed);
    return {
      index: index + 1, bytes: body.length, sha256: sha(body), response_file,
      private_saved: true, compressed_bytes: compressed.length, status: index === 1 ? 429 : 200,
      private_url: 'https://synthetic.private.blob.vercel-storage.com/' + prefix + response_file + '.gz',
    };
  });
  calls.push({index: 5, failure_class: 'TransportError'});
  const journal = {
    contract: 'c1-rotation-stage2-v1', sealed: true, status: 'STOPPED', cap: 250,
    byte_cap: 20 * 1024 * 1024, private_prefix: prefix, calls,
    response_bytes: bodies.reduce((sum, body) => sum + body.length, 0),
    request_manifest_sha256: sha(manifest), recovery_receipt_sha256: sha(gate),
  };
  change({journal, inputs, bodies});
  const raw = Buffer.from(JSON.stringify(journal));
  inputs.set(prefix + 'journal.json.gz', gzipSync(raw));
  let active = 0;
  let peak = 0;
  const references = [];
  const privateGet = async (reference, options) => {
    references.push(reference);
    assert.equal(options.access, 'private');
    assert.equal(options.useCache, false);
    assert.ok(reference.startsWith(prefix));
    assert.ok(inputs.has(reference));
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return {
      statusCode: 200,
      stream: new ReadableStream({start(controller) { controller.enqueue(inputs.get(reference)); controller.close(); }}),
    };
  };
  return {journal, bodies, privateGet, expectedJournalHash: sha(raw), references, peak: () => peak};
}

async function check(change, expected = true) {
  const current = fixture(change);
  const output = path.join(directory, 'restore-' + serial++);
  const receipt = await recoverStage2({run, output, expectedJournalHash: current.expectedJournalHash, privateGet: current.privateGet});
  assert.equal(receipt.passed, expected);
  assert.equal(statSync(output).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(output, 'recovery-receipt.json')).mode & 0o777, 0o600);
  assert.ok(current.references.every(reference => reference.startsWith(prefix)));
  if (expected) {
    assert.equal(receipt.restored_responses, 4);
    assert.equal(receipt.calls_without_response_body, 1);
    assert.equal(receipt.restored_bytes, current.journal.response_bytes);
    assert.equal(receipt.manifest_hash_verified, true);
    assert.equal(receipt.recovery_gate_hash_verified, true);
    current.bodies.forEach((body, index) => {
      const restored = path.join(output, `response-${String(index + 1).padStart(2, '0')}.json`);
      assert.deepEqual(readFileSync(restored), body);
      assert.equal(statSync(restored).mode & 0o777, 0o600);
    });
    assert.equal(current.peak(), 4);
  }
}

try {
  // Exact bytes survive successful, error, malformed JSON and empty responses.
  await check();
  await check(({journal}) => {
    journal.calls[0].private_url = journal.calls[0].private_url.replace('/stage2-synthetic-local/', '/stage1-forbidden/');
  }, false);
  await check(({journal}) => journal.response_bytes++, false);
  await check(({journal}) => journal.calls[0].sha256 = '0'.repeat(64), false);
  await check(({journal}) => journal.request_manifest_sha256 = '0'.repeat(64), false);
  await check(({journal}) => journal.contract = 'wrong', false);
  await check(({journal}) => journal.calls[4].bytes = 0, false);
  await check(({journal}) => journal.sealed = false, false);
  await check(({journal}) => {
    journal.response_bytes -= journal.calls[0].bytes;
    journal.calls[0] = {index: 1, failure_class: 'TransportError'};
  }, false);

  const current = fixture();
  const rejectFetch = () => assert.fail('Invalid output or stage must not fetch');
  const dirty = await recoverStage2({run, output: directory, expectedJournalHash: current.expectedJournalHash, privateGet: rejectFetch});
  assert.equal(dirty.passed, false);
  const invalid = await recoverStage2({run: 'stage1-forbidden', output: path.join(directory, 'invalid'), expectedJournalHash: current.expectedJournalHash, privateGet: rejectFetch});
  assert.equal(invalid.passed, false);

  const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  symlinkSync(repository, path.join(directory, 'source-link'));
  const linked = await recoverStage2({run, output: path.join(directory, 'source-link', 'synthetic-must-not-create'), expectedJournalHash: current.expectedJournalHash, privateGet: rejectFetch});
  assert.equal(linked.passed, false);
  console.log(JSON.stringify({passed: true, synthetic_cases: 12, network_requests: 0}));
} finally {
  rmSync(directory, {recursive: true, force: true});
}
