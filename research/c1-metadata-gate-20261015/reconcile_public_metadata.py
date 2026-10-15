#!/usr/bin/env python3
"""Explicit non-fuzzy comparison of public Dec-2024 metadata documents.

Canonical name matches and a recorded, manually reviewed legal-name/brand-name
crosswalk connect SEC common-stock descriptions to the pinned public CSV.
This is name/class corroboration, not proof of CUSIP/ISIN lineage or an index
provider's authoritative roster. The six duplicated issuer classes are mapped
explicitly rather than collapsed by CIK or corporate name.
"""
import collections
import csv
import json
import os
import re
import unicodedata
from pathlib import Path

ALIASES = {
 'Air Products & Chemicals, Inc.':'APD',
 'Alphabet, Inc. Class A':'GOOGL', 'Alphabet, Inc. Class C':'GOOG',
 'Amazon.com, Inc.':'AMZN', 'Bank of New York Mellon Corp.':'BK',
 "Campbell's Co.":'CPB', 'Capital One Financial Corp.':'COF',
 'CH Robinson Worldwide, Inc.':'CHRW',
 'Charles River Laboratories International, Inc.':'CRL',
 'Cisco Systems, Inc.':'CSCO',
 'Cognizant Technology Solutions Corp. Class A':'CTSH',
 'Costco Wholesale Corp.':'COST', 'Coterra Energy, Inc.':'CTRA',
 'Deckers Outdoor Corp.':'DECK', 'Digital Realty Trust, Inc. REIT':'DLR',
 'Discover Financial Services':'DFS', "Domino's Pizza, Inc.":'DPZ',
 'DuPont de Nemours, Inc.':'DD', 'Eli Lilly & Co.':'LLY',
 'Expeditors International of Washington, Inc.':'EXPD',
 'FactSet Research Systems, Inc.':'FDS',
 'Fox Corp. Class A':'FOXA', 'Fox Corp. Class B':'FOX',
 'GE HealthCare Technologies, Inc.':'GEHC', 'General Electric Co.':'GE',
 'Hartford Financial Services Group, Inc.':'HIG',
 'Honeywell International, Inc.':'HON',
 'International Business Machines Corp.':'IBM',
 'JB Hunt Transport Services, Inc.':'JBHT',
 'Johnson Controls International PLC':'JCI', 'L3Harris Technologies, Inc.':'LHX',
 'LyondellBasell Industries NV Class A':'LYB',
 'Mettler-Toledo International, Inc.':'MTD', 'MGM Resorts International':'MGM',
 'News Corp. Class A':'NWSA', 'News Corp. Class B':'NWS',
 'Norfolk Southern Corp.':'NSC', 'Old Dominion Freight Line, Inc.':'ODFL',
 "O'Reilly Automotive, Inc.":'ORLY', 'Paycom Software, Inc.':'PAYC',
 'Pinnacle West Capital Corp.':'PNW', 'Royal Caribbean Cruises Ltd.':'RCL',
 'Super Micro Computer, Inc.':'SMCI', 'Take-Two Interactive Software, Inc.':'TTWO',
 'Uber Technologies, Inc.':'UBER', 'Verizon Communications, Inc.':'VZ',
 'Westinghouse Air Brake Technologies Corp.':'WAB',
}

def canonical(name):
    value = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    value = re.sub(r'class\s+[abc]\b', '', value)
    value = re.sub(r'[^a-z0-9]+', ' ', value)
    value = re.sub(r'\b(inc|incorporated|corporation|corp|plc|co|company|companies|limited|ltd|the|cos|reit|sa|nv|group|holdings)\b', '', value)
    return ''.join(value.split())

def reconcile(directory):
    directory = Path(directory)
    public = list(csv.DictReader((directory/'public-sector-baseline.csv').open()))
    spy = json.loads((directory/'sec-spy-dec31-names.json').read_text())['holdings']
    sectors = json.loads((directory/'sec-sectors-dec31-names.json').read_text())['holdings']
    if {x['name'] for x in spy} != {x['name'] for x in sectors}:
        raise ValueError('Primary document common-stock identity sets differ')
    by_name = collections.defaultdict(list)
    for row in public:
        by_name[canonical(row['Security'])].append(row)
    by_symbol = {row['Symbol']:row for row in public}
    sector_by_name = {row['name']:row['gics_sector'] for row in sectors}
    results, unresolved = [], []
    for row in spy:
        candidates = by_name[canonical(row['name'])]
        if len(candidates) == 1:
            target, method = candidates[0], 'exact_canonical_name'
        elif row['name'] in ALIASES:
            target = by_symbol[ALIASES[row['name']]]
            method = 'explicit_reviewed_name_class_alias'
        else:
            unresolved.append(row['name'])
            continue
        results.append({'symbol':target['Symbol'], 'public_name':target['Security'],
          'sec_name':row['name'], 'sec_line':row['line'], 'join_method':method,
          'public_sector':target['GICS Sector'],
          'sec_sector':sector_by_name[row['name']], 'cik':target['CIK']})
    symbols = [x['symbol'] for x in results]
    if len(symbols) != len(set(symbols)):
        raise ValueError('Non-unique security-class join')
    summary = {'sec_spy_equities':len(spy), 'sec_sector_union':len(sectors),
      'public_snapshot_rows':len(public), 'matched':len(results),
      'methods':dict(collections.Counter(x['join_method'] for x in results)),
      'unresolved':unresolved,
      'sector_disagreements':[x for x in results if x['public_sector']!=x['sec_sector']],
      'fuzzy_join_used':False, 'fmp_taxonomy_equivalence_verified':False,
      'continuous_effective_history_verified':False,
      'authoritative_index_membership_certified':False,
      'sector_counts':dict(collections.Counter(x['sec_sector'] for x in results))}
    return summary, results

if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('directory');a=p.parse_args()
    summary, rows = reconcile(a.directory)
    output = Path(a.directory)/'public-sec-baseline-reconciliation.json'
    with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        json.dump({'summary':summary,'rows':rows}, handle, indent=2);handle.write('\n')
    print(json.dumps(summary,indent=2))
