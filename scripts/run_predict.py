import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from apps.api import ml_service as s
import json, traceback

input_dict = {
    "Timestamp": "2026-03-26 12:00:00",
    "city": "Istanbul",
    "weekday": "Friday",
    "hour": 12,
    "tavg": 18.5,
    "prcp": 0.0,
    "wspd": 3.2,
    "humidity": 56.0,
}

print('Running simulated prediction...')
try:
    pred = s.predict_single(input_dict)
    print('PREDICTION:', pred)
except Exception as e:
    print('ERROR:', e)
    traceback.print_exc()
