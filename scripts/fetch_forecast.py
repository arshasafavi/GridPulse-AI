import urllib.request
import json
import sys

import argparse

parser = argparse.ArgumentParser(description='Fetch forecast JSON from local dev server')
parser.add_argument('--city', default='Istanbul')
parser.add_argument('--horizon', type=int, default=4)
args = parser.parse_args()

url = f'http://127.0.0.1:8000/api/forecast/?city={args.city}&horizon={args.horizon}'
try:
    with urllib.request.urlopen(url, timeout=180) as resp:
        data = json.load(resp)
        print(json.dumps(data, indent=2, ensure_ascii=False))
except Exception as e:
    print('ERROR:', e, file=sys.stderr)
    sys.exit(1)
