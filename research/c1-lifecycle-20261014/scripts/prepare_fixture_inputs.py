#!/usr/bin/env python3
"""Decode existing checked-in output fixtures. No downloads or strategy runs."""
import base64, gzip, hashlib, json
from pathlib import Path
from research_paths import work_root, source_root
ROOT=work_root()
REPO=source_root()
EXPECTED={'sp500':'06959bc52f6fb6f4ec664ff3f8aa3fa36a3778e76c993a619208ffd81dd039b5',
          'nasdaq':'9b5a19a7f13ac5adacbeb6d2edff4e9038ead6f645ef3207056212b9a0751ee8'}
(ROOT/'data').mkdir(exist_ok=True)
inventory=[]
for universe,digest in EXPECTED.items():
    source=REPO/'tools/fixtures'/f'c1-{universe}-accounting.json.gz.base64'
    encoded=source.read_bytes()
    assert hashlib.sha256(encoded).hexdigest()==digest
    raw=gzip.decompress(base64.b64decode(encoded))
    assert isinstance(json.loads(raw),list)
    target=ROOT/'data'/f'{universe}-accounting.json'
    if target.exists():assert target.read_bytes()==raw
    else:target.write_bytes(raw)
    inventory.append(dict(universe=universe,source=str(source),sourceSha256=digest,
                          decodedSha256=hashlib.sha256(raw).hexdigest()))
path=ROOT/'data/fixture-inventory.json'
if path.exists():
    current=json.loads(path.read_text())
    for expected,actual in zip(inventory,current['inventory']):
        for key,value in expected.items():assert actual[key]==value
else:path.write_text(json.dumps({'purpose':'Existing historical output fixtures only','inventory':inventory},indent=2)+'\n')
print(json.dumps({'prepared_existing_fixtures':2,'downloads':0,'strategy_runs':0}))
