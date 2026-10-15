#!/usr/bin/env python3
"""Verify public checkpoint bytes and Python syntax, without empirical inputs."""
import ast
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root/'publication-manifest.json').read_text())
for name, record in manifest['public_files'].items():
    relative = Path(name)
    assert not relative.is_absolute() and '..' not in relative.parts
    data = (root/relative).read_bytes()
    assert len(data) == record['bytes'], name
    assert hashlib.sha256(data).hexdigest() == record['sha256'], name
    git_blob = b'blob '+str(len(data)).encode()+b'\0'+data
    assert hashlib.sha1(git_blob).hexdigest() == record['git_blob_sha1'], name
    if relative.suffix == '.py':
        ast.parse(data, filename=name)
summary=json.loads((root/'aggregate-evidence.json').read_text())
assert summary['is_portfolio_backtest'] is False
assert summary['reference_is_current_champion'] is False
assert summary['included_episodes']==470
assert summary['independently_recomputed_episode_rule_pairs']==1410
matrix=json.loads((root/'six-challengers.json').read_text())
assert [x['id'] for x in matrix['challengers']]==['F','L','E','H','X','P']
assert matrix['execution_authorized_without_data_checks'] is False
print(json.dumps({'public_artifacts_verified':len(manifest['public_files']),
                  'python_syntax_verified':True,'empirical_replay_performed':False}))
