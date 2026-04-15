import urllib.request
import json
import sys
import time

import argparse

parser = argparse.ArgumentParser(description='Fetch forecast JSON from local dev server')
parser.add_argument('--city', default='Istanbul')
parser.add_argument('--horizon', type=int, default=4)
args = parser.parse_args()

url = f'http://127.0.0.1:8000/api/forecast/?city={args.city}&horizon={args.horizon}'
start = time.time()
try:
    with urllib.request.urlopen(url, timeout=600) as resp:
        data = json.load(resp)
        elapsed = time.time() - start
        print(f'Fetched horizon={args.horizon} city={args.city} in {elapsed:.1f}s; predictions={len(data.get("predictions", []))}')
except Exception as e:
    elapsed = time.time() - start
    print(f'ERROR after {elapsed:.1f}s: {e}', file=sys.stderr)
    sys.exit(1)
