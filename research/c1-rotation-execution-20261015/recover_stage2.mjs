// Recover one new stage-2 prefix only. No acquisition, listing, or original archive access.
import {get} from '/workspace/screener-app/node_modules/@vercel/blob/dist/index.js';
import {chmodSync, mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const CAP = 250;
const BYTE_CAP = 20 * 1024 * 1024;
// Independent recovery allocation bound for the small journal, manifest and gate.
const METADATA_CAP = 5 * 1024 * 1024;
const COMPRESSED_OVERHEAD = 1024 * 1024;
const CONCURRENCY = 4;
const HASH = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0;

async function fetchPrivate(reference, limit, privateGet) {
  const response = await privateGet(reference, {
    access: 'private', useCache: false, abortSignal: AbortSignal.timeout(20000),
  });
  if (!response || response.statusCode !== 200) throw new Error('Private retrieval failed');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.stream) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('Compressed retrieval exceeds recovery bound');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

async function restoreBytes(reference, expectedHash, maxOutput, privateGet, expectedCompressedBytes) {
  if (!HASH.test(expectedHash ?? '')) throw new Error('Expected private hash missing');
  const compressed = await fetchPrivate(reference, maxOutput + COMPRESSED_OVERHEAD, privateGet);
  if (expectedCompressedBytes !== undefined && compressed.length !== expectedCompressedBytes) {
    throw new Error('Compressed response byte mismatch');
  }
  // A zero-byte provider body still has a nonempty gzip envelope.
  const bytes = gunzipSync(compressed, {maxOutputLength: Math.max(1, maxOutput)});
  if (bytes.length > maxOutput || digest(bytes) !== expectedHash) throw new Error('Private integrity mismatch');
  return bytes;
}

function privateResponsePath(item, index, prefix) {
  const filename = `response-${String(index).padStart(2, '0')}.json`;
  if (item.response_file !== filename || item.private_saved !== true) {
    throw new Error('Missing private response receipt');
  }
  const url = new URL(item.private_url);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      !/^[a-z0-9]+\.private\.blob\.vercel-storage\.com$/.test(url.hostname) ||
      url.pathname !== '/' + prefix + filename + '.gz') {
    throw new Error('Private response is outside the exact stage prefix');
  }
  // Fetch the computed exact pathname, never an arbitrary URL supplied by a journal.
  return {filename, reference: prefix + filename + '.gz'};
}

function validateJournal(journal, prefix) {
  if (journal?.contract !== 'c1-rotation-stage2-v1' || journal.sealed !== true ||
      journal.private_prefix !== prefix || journal.cap !== CAP || journal.byte_cap !== BYTE_CAP ||
      !Array.isArray(journal.calls) || journal.calls.length > CAP ||
      !integer(journal.response_bytes) || journal.response_bytes > BYTE_CAP ||
      !HASH.test(journal.request_manifest_sha256 ?? '') || !HASH.test(journal.recovery_receipt_sha256 ?? '')) {
    throw new Error('Stage-2 journal contract mismatch');
  }
  const responses = [];
  let declaredBytes = 0;
  let callsWithoutResponse = 0;
  journal.calls.forEach((item, position) => {
    if (!item || item.index !== position + 1) throw new Error('Noncanonical call index');
    if (item.private_saved !== true) {
      const bodyFields = ['bytes', 'sha256', 'response_file', 'private_url', 'compressed_bytes'];
      if (journal.status !== 'STOPPED' || position !== journal.calls.length - 1 ||
          bodyFields.some(key => Object.hasOwn(item, key)) ||
          !(typeof item.failure === 'string' || typeof item.failure_class === 'string')) {
        throw new Error('Unrecoverable response bytes');
      }
      callsWithoutResponse++;
      return;
    }
    if (!integer(item.bytes) || item.bytes > BYTE_CAP || !HASH.test(item.sha256 ?? '') ||
        !integer(item.compressed_bytes) || item.compressed_bytes === 0 ||
        item.compressed_bytes > item.bytes + COMPRESSED_OVERHEAD) {
      throw new Error('Invalid response integrity metadata');
    }
    const location = privateResponsePath(item, position + 1, prefix);
    declaredBytes += item.bytes;
    if (declaredBytes > BYTE_CAP) throw new Error('Declared byte cap exceeded');
    responses.push({item, ...location});
  });
  if (declaredBytes !== journal.response_bytes) throw new Error('Journal byte total mismatch');
  return {responses, callsWithoutResponse};
}

export async function recoverStage2({run, output, expectedJournalHash, privateGet = get}) {
  const receipt = {
    contract: 'c1-rotation-stage2-private-recovery-v1', private: true, passed: false,
    original_archive_accessed: false, original_local_inputs_accessed: false,
    restored_responses: 0, restored_bytes: 0, attempted_requests: 0,
    calls_without_response_body: 0, restored_error_bodies: 0,
    journal_hash_verified: false, manifest_hash_verified: false, recovery_gate_hash_verified: false,
    authenticated_private_read: false, clean_output_directory: false, fmp_requests: 0,
  };
  let created = false;
  let directory;
  try {
    if (!/^stage2-[a-zA-Z0-9-]+$/.test(run ?? '') || typeof output !== 'string' || !output ||
        !HASH.test(expectedJournalHash ?? '')) throw new Error('Three valid recovery arguments required');
    const requested = path.resolve(output);
    directory = path.join(realpathSync(path.dirname(requested)), path.basename(requested));
    const repository = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
    if (directory === repository || directory.startsWith(repository + path.sep)) {
      throw new Error('Private recovery output must be outside the source repository');
    }
    mkdirSync(directory, {mode: 0o700});
    chmodSync(directory, 0o700);
    created = true;
    receipt.clean_output_directory = true;
    receipt.run = run;
    const save = (name, bytes) => writeFileSync(path.join(directory, name), bytes, {mode: 0o600, flag: 'wx'});
    const prefix = 'research/c1-rotation-2025q1/stages/' + run + '/';
    const raw = await restoreBytes(prefix + 'journal.json.gz', expectedJournalHash, METADATA_CAP, privateGet);
    const journal = JSON.parse(raw);
    const {responses, callsWithoutResponse} = validateJournal(journal, prefix);
    save('journal.json', raw);
    receipt.authenticated_private_read = true;
    receipt.journal_hash_verified = true;
    receipt.attempted_requests = journal.calls.length;
    receipt.calls_without_response_body = callsWithoutResponse;

    for (const [name, expected, flag] of [
      ['manifest.json', journal.request_manifest_sha256, 'manifest_hash_verified'],
      ['recovery-gate.json', journal.recovery_receipt_sha256, 'recovery_gate_hash_verified'],
    ]) {
      const bytes = await restoreBytes(prefix + name + '.gz', expected, METADATA_CAP, privateGet);
      const parsed = JSON.parse(bytes);
      const contract = name === 'manifest.json' ? 'c1-rotation-stage2-manifest-v1' : 'c1-rotation-stage2-recovery-gate-v1';
      if (parsed?.contract !== contract) throw new Error('Private acquisition input contract mismatch');
      save(name, bytes);
      receipt[flag] = true;
    }

    let next = 0;
    let failure;
    const workers = Array.from({length: Math.min(CONCURRENCY, responses.length)}, async () => {
      while (!failure && next < responses.length) {
        const {item, filename, reference} = responses[next++];
        try {
          const bytes = await restoreBytes(reference, item.sha256, item.bytes, privateGet, item.compressed_bytes);
          if (bytes.length !== item.bytes) throw new Error('Response byte mismatch');
          // Preserve exact raw bytes, including empty, malformed JSON and provider error bodies.
          save(filename, bytes);
          receipt.restored_responses++;
          receipt.restored_bytes += bytes.length;
          if (item.status !== 200 || item.provider_error_payload || item.failure || item.failure_class) {
            receipt.restored_error_bodies++;
          }
        } catch (error) {
          failure ??= error;
        }
      }
    });
    await Promise.all(workers);
    if (failure) throw failure;
    if (receipt.restored_responses !== responses.length || receipt.restored_bytes !== journal.response_bytes) {
      throw new Error('Recovered totals mismatch');
    }
    receipt.passed = true;
  } catch (error) {
    receipt.error_class = ['Error', 'TypeError', 'RangeError', 'AbortError', 'SyntaxError'].includes(error?.name) ? error.name : 'Error';
  }
  if (created) {
    writeFileSync(path.join(directory, 'recovery-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const receipt = await recoverStage2(args.length === 3 ? {
    run: args[0], output: args[1], expectedJournalHash: args[2],
  } : {});
  // Counts and integrity results only: no source values, URLs, or hash values.
  console.log(JSON.stringify(receipt));
  if (!receipt.passed) process.exitCode = 2;
}
