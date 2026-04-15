# API Endpoints (brief)

This file documents the main API endpoints provided by the `apps.api` Django app.

Base URL: `/api/`

1) `GET /api/overview/`
- Purpose: Return dashboard KPIs, mini charts and insights (mocked/sample data).
- Query params: `city` (optional, default `Istanbul`)
- Response: JSON payload with `kpis`, `insights`, and `mini_charts`.

2) `POST /api/forecast/`
- Purpose: Run a single prediction using the trained model.
- Content-Type: `application/json`
- Expected payload (example):
  {
    "Timestamp": "2026-03-26 15:00:00",
    "city": "Istanbul",
    "weekday": "Friday",
    "hour": 15,
    "tavg": 19.0,
    "prcp": 0.0,
    "wspd": 2.5,
    "humidity": 60.0
  }
- Response (success):
  {
    "status": "success",
    "predicted_energy": 1531.03
  }
- Response (error): status 400 with `{"status":"error","message":"..."}`
- Notes: The endpoint calls `apps.api.ml_service.predict_single`. The ML artifacts are lazily loaded on first call; missing files will produce an error message.

3) `GET /api/forecast/demo/`
- Purpose: Demo prediction with query parameters.
- Query params: `city`, `timestamp`, `weekday`, `tavg`, `prcp`, `wspd`, `humidity`, `hour`, `is_holiday`.
- Response: similar to `/api/forecast/` including the `input` sent.

4) `POST /api/scenario/`
- Purpose: Generate baseline and scenario forecasts for a scenario input (mock model logic).
- Content-Type: `application/json`
- Payload fields: `city`, `horizon`, `temperature_delta`, `humidity_delta`, `wind_speed_delta`, `precipitation_delta`, `is_holiday`, `is_weekend`.
- Response: JSON with `baseline`, `scenario`, `summary`, and `table`.

5) `GET /api/metrics/`
- Purpose: Return synthetic model metrics and time series for evaluation pages.
- Query params: `city`, `model` (lstm|gru|xgboost), `horizon`.
- Response: JSON with `metrics`, `series`, `comparison`, and `samples`.

Security & Validation recommendations:
- Add input validation for `/api/forecast/` (missing keys, types).
- Avoid returning raw exception messages in production.
- Rate-limit or add auth for model endpoints if exposed.

