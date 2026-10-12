#!/usr/bin/env python3
"""Verify recovered evidence bytes and source pins; never simulate a portfolio."""
import base64
from datetime import date
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
EVIDENCE = ROOT / 'imported/docs/research/c1-validation-20261012'
SOURCE = ROOT / 'imported/source'
AUDIT_COMMIT = '006e067697385143684c7417b18bc7909c2d217e'
REPAIR_COMMIT = 'e2b98471311fb702113baf0ca64473b92ccfd142'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def audit():
    declared = json.loads((EVIDENCE / 'final-artifact-manifest.json').read_text())
    public = {item['file']: item for item in declared['publicArtifacts']}
    rows, checks = [], []
    for cost in (12, 25, 50):
        name = f'current-{cost}bps-results.json'
        payload = (EVIDENCE / name).read_bytes()
        expected = public[name]
        assert sha(payload) == expected['sha256'] and len(payload) == expected['bytes'], name
        run = json.loads(payload)
        assert run['slippageBps'] == cost
        assert run['actualLiveInputAccepted'] is False and run['eligibleForAlphaClaim'] is False
        assert run['engineSha256'] == sha((SOURCE / 'tools/c1-production-policy-replay.cjs').read_bytes())
        assert run['inputManifestSha256'] == sha((EVIDENCE / 'current-input-manifest.json').read_bytes())
        for path, digest in run['sourcePin']['sources'].items():
            assert sha((SOURCE / path).read_bytes()) == digest, path
        assert run['sourcePin']['adapterSha256'] == sha((SOURCE / 'tools/c1-production-replay-loader.cjs').read_bytes())
        verifier_file = EVIDENCE / run['sourceVerification']['file']
        if cost == 12 and not verifier_file.exists():
            verifier_file = ROOT / 'reference-12bps-verifier.json.gz.base64'
        encoded = verifier_file.read_bytes()
        decoded = gzip.decompress(base64.b64decode(encoded))
        assert sha(encoded) == run['sourceVerification']['encodedSha256']
        assert sha(decoded) == run['sourceVerification']['canonicalSha256']
        assert len(decoded) == run['sourceVerification']['canonicalBytes']
        receipt = json.loads(decoded)
        assert receipt['passed'] is True and receipt['cost'] == cost and receipt['observations'] == 918
        assert all(receipt[key] is True for key in ('sourceGraphMatches', 'inputContentMatches', 'inputManifestMatches'))
        assert receipt['actualLiveInputAccepted'] is False and receipt['eligibleForAlphaClaim'] is False
        for sleeve in ('base', 'cooldown15', 'sector40'):
            saved = run['sourceVerification']['results'][sleeve]
            assert saved['completeSourceOutputMatches'] and saved['everySessionTraceMatches']
            assert saved['sourceOutputSha256'] == saved['cachedSourceOutputSha256']
            assert saved['traceSha256'] == saved['cachedTraceSha256']
        metrics = run['metrics']
        calculated_return = (metrics['endingEquity'] / metrics['initialCapital'] - 1) * 100
        assert abs(calculated_return - metrics['totalReturnPct']) < 1e-10
        for benchmark in metrics['benchmarkComparisons'].values():
            assert abs(metrics['totalReturnPct'] - benchmark['simpleReturnPct'] - benchmark['excessReturnPct']) < 1e-10
        years = (date.fromisoformat(run['endDate']) - date.fromisoformat(run['startDate'])).days / 365.25
        cagr = ((metrics['endingEquity'] / metrics['initialCapital']) ** (1 / years) - 1) * 100
        rows.append({'costBps': cost, 'status': 'saved_reference_integrity_verified_not_replayed',
                     **metrics, 'derivedCalendarCagrPct': cagr,
                     'derivedCalmar': cagr / abs(metrics['maxDrawdownPct']),
                     'fullRunAvailableHere': False, 'resultSha256': sha(payload),
                     'sourceGraphSha256': run['sourcePin']['sourceGraphSha256'],
                     'verifierCanonicalSha256': sha(decoded),
                     'privateFullRunIdentity': run['privateFullRunArtifact']})
        checks.append({'costBps': cost, 'resultHashMatches': True, 'engineSourceMatches': True,
                       'all25ApplicationSourceHashesMatch': True, 'recordedReceiptHashesMatch': True,
                       'independentSummaryArithmeticMatches': True,
                       'newFullHistoricalReplayCompleted': False})
    return {'contract': 'c1-challenger-independent-saved-evidence-review-v1', 'passed': True,
            'auditCommit': AUDIT_COMMIT, 'engineeringCommit': REPAIR_COMMIT,
            'championSourceIsExactAuditSnapshot': True,
            'championFullHistoryReproducedThisProgram': False, 'challengersTested': 0,
            'checks': checks, 'savedChampionScorecard': rows,
            'scope': 'Independent byte/source/receipt and available summary arithmetic review. Full raw replay, trade-ledger arithmetic, regimes and right tails remain unverified in this program.',
            'actualLiveInputAccepted': False, 'eligibleForAlphaClaim': False}


if __name__ == '__main__':
    print(json.dumps(audit(), indent=2))
