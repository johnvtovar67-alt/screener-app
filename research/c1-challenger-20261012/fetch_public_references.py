#!/usr/bin/env python3
"""Restore already-public reference receipts, never private market-data inputs."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parent
index = json.loads((root / 'public-reference-index.json').read_text())
for entry in index['files']:
    relative = entry['path']
    if not relative.startswith('docs/research/') or '..' in Path(relative).parts:
        raise ValueError('Unexpected public-reference path')
    url = 'https://raw.githubusercontent.com/' + index['repository'] + '/' + index['immutableCommit'] + '/' + relative
    with urlopen(url, timeout=30) as response:
        data = response.read()
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    if blob != entry['gitBlobSha']:
        raise ValueError('Changed public receipt: ' + relative)
    target = root / 'imported' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
print(json.dumps({'publicReferenceFilesVerified': len(index['files']), 'privateInputsDownloaded': 0}))
