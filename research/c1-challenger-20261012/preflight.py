#!/usr/bin/env python3
"""Read-only readiness check. This command never runs or alters a strategy."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

PROGRAM = Path(__file__).resolve().parent
EVIDENCE = PROGRAM / 'imported/docs/research/c1-validation-20261012'
EXPECTED_MANIFEST = 'b6d83ac68fce80937de36d78d3735bcf87f114442cb56db0f280d8c6249c44ad'
CONTRACT = 'c1-source-pinned-current253-conditional-historical-input-v1'


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(file):
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def contained(root, relative):
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError('Input path escapes its designated archive root')
    return target


def inspect(data_root=None, durability_receipt=None):
    errors = []
    manifest_file = EVIDENCE / 'current-input-manifest.json'
    manifest_bytes = manifest_file.read_bytes()
    manifest = json.loads(manifest_bytes)
    if checksum(manifest_bytes) != EXPECTED_MANIFEST:
        errors.append('Recovered Champion input manifest differs from its immutable reference')
    if manifest.get('inputContract') != CONTRACT:
        errors.append('Wrong Champion input contract')
    if manifest.get('actualLiveInputAccepted') is not False or manifest.get('eligibleForAlphaClaim') is not False:
        errors.append('Conditional evidence limitation is missing')

    source_inventory = PROGRAM / 'imported/source-snapshot-manifest.json'
    source_checks = []
    if not source_inventory.exists():
        errors.append('Exact application source snapshot inventory is unavailable')
    else:
        inventory = json.loads(source_inventory.read_text())
        for entry in inventory['files']:
            source = contained(PROGRAM / 'imported/source', entry['path'])
            ok = source.is_file() and file_hash(source) == entry['sha256']
            source_checks.append({'path': entry['path'], 'matched': ok})
            if not ok:
                errors.append('Missing or changed source snapshot: ' + entry['path'])

    root = Path(data_root).resolve() if data_root else PROGRAM / 'unavailable-inputs'
    required = [{'pathname': manifest['acceptanceReceipt']['receiptPath'],
                 'sha256': manifest['acceptanceReceipt']['receiptSha256'], 'kind': 'acceptance'}]
    required += [{'pathname': item['pathname'], 'sha256': item['compressedSha256'],
                  'bytes': item['compressedBytes'], 'contentSha256': item['contentSha256'],
                  'kind': 'current-derived-chunk'} for item in manifest['chunks']]
    input_checks = []
    for entry in required:
        target = contained(root, entry['pathname'])
        result = {'path': entry['pathname'], 'present': target.is_file(), 'matched': False}
        if target.is_file():
            result['matched'] = file_hash(target) == entry['sha256']
            if 'bytes' in entry:
                result['matched'] &= target.stat().st_size == entry['bytes']
            if result['matched'] and 'contentSha256' in entry:
                digest = hashlib.sha256()
                with gzip.open(target, 'rb') as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(block)
                result['matched'] &= digest.hexdigest() == entry['contentSha256']
        input_checks.append(result)
        if not result['matched']:
            errors.append('Missing or changed input: ' + entry['pathname'])

    durable = False
    if durability_receipt:
        receipt = json.loads(Path(durability_receipt).read_text())
        # This receipt documents independently verified GitHub blob identities.
        # Merely writing this file does not prove remote persistence.
        records = {entry['path']: entry for entry in receipt.get('inputs', [])}
        durable = receipt.get('remoteBlobVerificationPassed') is True
        durable &= bool(receipt.get('repository') and receipt.get('immutableCommit'))
        for entry in required:
            record = records.get(entry['pathname'], {})
            durable &= record.get('sha256') == entry['sha256'] and bool(record.get('gitBlobSha'))
        durable &= receipt.get('originalArchiveAndRawWarmupPersisted') is True
    if not durable:
        errors.append('All raw inputs and warmup are not verified persisted to GitHub')
    errors.append('Champion source identity is unresolved: audit snapshot and engineering source have different holding-rank behavior')

    return {'contract': 'c1-challenger-readiness-v1', 'readyForLongAnalysis': not errors,
            'championReproducedThisProgram': False, 'challengersRun': 0,
            'sourceChecksScope': 'Recovered audit Champion snapshot only; not equivalence to engineering commit e2b9847',
            'engineeringSourceHistoricalEquivalenceEstablished': False,
            'sourceIdentityResolution': 'blocked: audit snapshot and engineering source have materially different holding ranks',
            'comparativePerformanceFindingsVerified': False,
            'actualLiveInputAccepted': False, 'eligibleForAlphaClaim': False,
            'sourceChecks': source_checks, 'inputChecks': input_checks,
            'requiredCurrentChunkCount': len(manifest['chunks']),
            'requiredCurrentCompressedBytes': sum(item['compressedBytes'] for item in manifest['chunks']),
            'githubInputPersistenceVerified': durable, 'errors': errors,
            'nextGate': 'Restore and persist exact inputs, then reproduce Champion before Challenger execution'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root')
    parser.add_argument('--durability-receipt')
    args = parser.parse_args()
    try:
        report = inspect(args.data_root, args.durability_receipt)
    except (OSError, ValueError, KeyError, gzip.BadGzipFile) as error:
        report = {'contract': 'c1-challenger-readiness-v1', 'readyForLongAnalysis': False,
                  'championReproducedThisProgram': False, 'challengersRun': 0,
                  'errors': [str(error)]}
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['readyForLongAnalysis'] else 2)
