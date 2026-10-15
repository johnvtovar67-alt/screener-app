#!/usr/bin/env python3
"""One explicitly bounded three-request continuation after report-output failure.

This is not archive recovery or an infrastructure operation. The first attempt
validated all eight securities but its private aggregate write failed with errno30
(read-only destination). No inputs survived. This driver consumes only remaining
three requests (NVDA/PG/SPY), verifies identical response hashes to the successful
validation, executes unchanged statistics for the declared two-security subset,
and writes only private aggregates. It cannot be rerun within this experiment.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import acquire

ROOT=Path(__file__).resolve().parent

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--private-output',required=True)
    a=p.parse_args();dest=Path(a.private_output).resolve()
    current=json.loads((ROOT/'acquisition-audit.json').read_text())
    if current.get('provider_calls_including_initial_probe')!=17 or current.get('status')!='failed_prerequisite':
        raise acquire.DataFailure('One-time continuation refused: original remaining-three-call state is no longer current')
    if dest.is_relative_to(ROOT.parents[1]):
        raise acquire.DataFailure('Private derived result must be outside Git checkout')
    # Open and sync the actual output filesystem BEFORE any subscription request.
    dest.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(prefix='c1-private-aggregate-',dir=dest.parent)
    os.write(fd,b'');os.fsync(fd)
    audit=json.loads((ROOT/'attempt1-audit.json').read_text())
    if audit['provider_calls_including_initial_probe']!=17 or audit['status']!='failed_prerequisite':
        raise acquire.DataFailure('Continuation requires exact audited17-call attempt1')
    c=acquire.Client();c.calls=list(audit['requests']);c.bytes=audit['bytes_including_initial_probe']
    expected={r['params'].get('symbol'):r['sha256'] for r in audit['requests']
      if r['endpoint']=='historical-price-eod/dividend-adjusted' and r['params'].get('from')==acquire.FROM}
    data={}
    out=dict(audit)
    out['attempt1']={'validation':'passed all acquisition checks','comparison_output':'not retained',
      'failed_prerequisite':'Owner report destination /codex is read-only in execution environment (OSError errno30)',
      'raw_inputs_retained':False}
    out['sentinel_amendment']={'declared_before_observing_comparative_numbers':True,
      'comparison_symbols':['NVDA','PG'],'calendar_symbol':'SPY',
      'selection_reason':'High/low volatility sentinel businesses with corporate-action/overlap checks already completed; no outcome selection',
      'methods_and_thresholds_unchanged':True,'additional_request_cap':3,'private_destination_preflight_passed':True}
    try:
        for symbol in ['NVDA','PG','SPY']:
            raw=c.get('historical-price-eod/dividend-adjusted',symbol=symbol,**{'from':acquire.FROM,'to':acquire.TO})
            if c.calls[-1]['sha256']!=expected[symbol]:
                raise acquire.DataFailure(f'{symbol}: sentinel full payload hash differs from audited vintage')
            bars=acquire.normalize(raw,symbol)
            if [b['date'] for b in bars]!=acquire.sessions():
                raise acquire.DataFailure(f'{symbol}: sentinel independent calendar mismatch')
            data[symbol]=bars
        spec=importlib.util.spec_from_file_location('c1_sentinel_analysis',ROOT/'analyze.py')
        mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        result=mod.analyze(data,securities=('NVDA','PG'))
        result['execution_amendment']=out['sentinel_amendment']
        result['prior_validation']={'securities':audit['symbols'],'sessions_each':1510,'warmup_sessions':252,
          'missing_observations':0,'repeat_and_action_checks_passed':True,
          'sentinel_hashes_identical_to_prior_full_payloads':True}
        with os.fdopen(fd,'w') as f:
            json.dump(result,f,indent=2,allow_nan=False);f.write('\n');f.flush();os.fsync(f.fileno())
        fd=None;os.replace(tmp,dest)
        out['status']='complete_partial_research_sentinel'
        out.pop('failure',None)
        out['analysis_executed']=True
        out['numerical_results']='Owner-private aggregate output; public numerical display rights unverified'
        out['sentinel_payloads_identical_to_prior_validation']=True
    except Exception as e:
        out['status']='failed_sentinel_prerequisite'
        out['failure']=str(e) if isinstance(e,acquire.DataFailure) else type(e).__name__
        raise
    finally:
        if fd is not None:os.close(fd)
        if os.path.exists(tmp):os.unlink(tmp)
        out['requests']=c.calls;out['provider_calls_including_initial_probe']=len(c.calls)+1
        out['bytes_including_initial_probe']=c.bytes
        (ROOT/'acquisition-audit.json').write_text(json.dumps(out,indent=2,allow_nan=False)+'\n')
        print(json.dumps({'status':out['status'],'total_calls':len(c.calls)+1,'total_bytes':c.bytes,
          'private_aggregate_saved':out['status']=='complete_partial_research_sentinel','failure':out.get('failure')}))

if __name__=='__main__':
    try:main()
    except Exception as e:
        print('Stopped: '+(str(e) if isinstance(e,acquire.DataFailure) else type(e).__name__))
        raise SystemExit(2)
