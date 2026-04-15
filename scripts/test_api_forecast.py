import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from urllib import request, error

url = 'http://127.0.0.1:8000/api/forecast/'
headers = {'Content-Type': 'application/json'}

payload = {
    "Timestamp": "2026-03-26 15:00:00",
    "city": "Istanbul",
    "weekday": "Friday",
    "hour": 15,
    "tavg": 19.0,
    "prcp": 0.0,
    "wspd": 2.5,
    "humidity": 60.0,
}

data = json.dumps(payload).encode('utf-8')
req = request.Request(url, data=data, headers=headers, method='POST')

print('Sending POST to', url)
try:
    with request.urlopen(req, timeout=180) as resp:
        body = resp.read().decode('utf-8')
        print('Status:', resp.status)
        print('Response:', body)
except error.HTTPError as e:
    print('HTTPError:', e.code, e.reason)
    print(e.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)
