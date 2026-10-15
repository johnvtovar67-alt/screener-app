#!/usr/bin/env python3
"""Extract dated equity identities/sectors from SEC web-connector text views.

Inputs are JSON web connector responses or plain text containing L<number>:
lines. Retrieve the cited SEC documents through a permitted source transport,
with overlapping viewports until all source lines are covered. The extractor
excludes prices, share counts, cash and collateral from its output. This is a
document-specific research adapter, not a general SEC filing parser.
"""
import argparse
import collections
import json
import os
import re
from pathlib import Path

SECTORS = {
    'COMMUNICATION SERVICES': 'Communication Services',
    'CONSUMER DISCRETIONARY': 'Consumer Discretionary',
    'CONSUMER STAPLES': 'Consumer Staples', 'ENERGY': 'Energy',
    'FINANCIAL': 'Financials', 'HEALTH CARE': 'Health Care',
    'INDUSTRIAL': 'Industrials', 'MATERIALS': 'Materials',
    'REAL ESTATE': 'Real Estate', 'TECHNOLOGY': 'Information Technology',
    'UTILITIES': 'Utilities',
}

def collect_lines(texts):
    lines = {}
    for text in texts:
        for raw in text.splitlines():
            match = re.match(r'^L(\d+): ?(.*)$', raw)
            if not match:
                continue
            number, value = int(match[1]), match[2]
            if number in lines and lines[number] != value:
                raise ValueError(f'Conflicting source line {number}')
            lines[number] = value
    if not lines:
        raise ValueError('No source line records')
    if set(lines) != set(range(max(lines) + 1)):
        raise ValueError('Incomplete source viewport coverage')
    return lines

def extract(lines, sector_funds):
    out, sector, active = [], None, False
    for number in range(max(lines) + 1):
        value = lines[number].strip()
        heading = re.match(r'^THE (.*?) SELECT SECTOR SPDR FUND', value)
        if heading:
            sector = SECTORS[heading[1]]
        if (sector_funds and value.startswith('COMMON STOCKS')) or (
                not sector_funds and value.startswith('Common Stocks  |')):
            active = True
        if value.upper().startswith('TOTAL COMMON STOCKS'):
            active = False
        if not active or not value:
            continue
        if re.match(r'^[|*【\d]', value) and not value.startswith('3M '):
            continue
        following = number + 1
        while following in lines and not lines[following].strip():
            following += 1
        if lines.get(following, '').strip() != '* * *':
            continue
        following += 1
        while following in lines and not lines[following].strip():
            following += 1
        cells = [x.strip() for x in lines.get(following, '').split('|')
                 if x.strip()]
        if len(cells) != 2 or not re.fullmatch(r'[\d,]+', cells[0]) or not re.fullmatch(r'\$?[\d,]+', cells[1]):
            continue
        row = {'line': number, 'name': re.sub(r'\s*\([a-z]\)', '', value)}
        if sector_funds:
            if sector is None:
                raise ValueError('Missing fund sector')
            row['gics_sector'] = sector
        out.append(row)
    names = [x['name'] for x in out]
    if len(names) != len(set(names)):
        raise ValueError('Duplicate equity identities')
    if len(names) != 503:
        raise ValueError(f'Expected 503 equities for this dated source, found {len(names)}')
    return out

def flatten_json(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from flatten_json(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key == 'text':
                yield str(item)
            elif key in ('content', 'responses'):
                yield from flatten_json(item)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--kind', choices=('spy', 'sectors'), required=True)
    p.add_argument('--chunks', nargs='+', required=True)
    p.add_argument('--source-url', required=True)
    p.add_argument('--as-of', required=True)
    p.add_argument('--available-at', required=True)
    p.add_argument('--output', required=True)
    args = p.parse_args()
    texts = []
    for path in args.chunks:
        text = Path(path).read_text()
        try:
            texts.extend(flatten_json(json.loads(text)))
        except json.JSONDecodeError:
            texts.append(text)
    rows = extract(collect_lines(texts), args.kind == 'sectors')
    result = {'source_url': args.source_url, 'as_of': args.as_of,
              'available_at': args.available_at, 'holdings': rows,
              'effective_intervals_verified': False,
              'fmp_taxonomy_equivalence_verified': False}
    with os.fdopen(os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        json.dump(result, handle, indent=2)
        handle.write('\n')
    print(json.dumps({'equities': len(rows), 'sector_counts':
          dict(collections.Counter(x.get('gics_sector') for x in rows))}))

if __name__ == '__main__':
    main()
