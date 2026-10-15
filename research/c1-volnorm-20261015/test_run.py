import json
import unittest
from unittest.mock import patch
import run

class Response:
    status=200
    headers={'Content-Type':'application/json'}
    def __init__(self,payload):self.body=json.dumps(payload).encode()
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self,n):return self.body[:n]

class AcquisitionTests(unittest.TestCase):
    def test_independent_special_closures(self):
        dates=run.sessions()
        for d in ('2012-10-29','2012-10-30','2018-12-05','2025-01-09'):self.assertNotIn(d,dates)
        self.assertIn('2018-12-04',dates)
    def test_budget_stops_before_request(self):
        with patch.dict('os.environ',{'FMP_API_KEY':'synthetic-key'}):client=run.Client()
        client.calls=[{}]*run.CALL_CAP
        with patch('urllib.request.urlopen') as request:
            with self.assertRaises(run.Failure):client.get('synthetic')
            request.assert_not_called()
    def test_optional_empty_and_private_fingerprint(self):
        with patch.dict('os.environ',{'FMP_API_KEY':'synthetic-key'}):client=run.Client()
        with patch('urllib.request.urlopen',return_value=Response([])),patch('time.sleep'):
            self.assertEqual(client.get('synthetic',optional=True),[])
        self.assertNotIn('sha256',client.calls[0])
        self.assertNotIn('synthetic-key',json.dumps(client.calls))
        self.assertIn('sha256',client.fingerprints[0])
    def test_byte_cap_no_retry(self):
        with patch.dict('os.environ',{'FMP_API_KEY':'synthetic-key'}):client=run.Client()
        with patch.object(run,'BYTE_CAP',2),patch('urllib.request.urlopen',return_value=Response([{'x':1}])) as request,patch('time.sleep'):
            with self.assertRaises(run.Failure):client.get('synthetic')
            self.assertEqual(request.call_count,1)

if __name__=='__main__':unittest.main()
