from pathlib import Path
import logging

import joblib
import numpy as np
import pandas as pd
import requests

BASE_DIR = Path(__file__).resolve().parent.parent.parent
MODEL_DIR = BASE_DIR / "models"
DATA_PATH = BASE_DIR / "data" / "energy_data.csv"
# Model-specific consumptions CSVs — more recent data used for accurate lag features
_CONS_24_PATH = MODEL_DIR / "model_24" / "source" / "consumptions.csv"
_CONS_NTS_PATH = MODEL_DIR / "model_no_timeseries" / "source" / "consumptions.csv"

IZMIR_LAT = 38.4237
IZMIR_LON = 27.1428
SEQ_LEN_24 = 24

WEEKDAY_MAP = {
    "Monday": 0,
    "Tuesday": 1,
    "Wednesday": 2,
    "Thursday": 3,
    "Friday": 4,
    "Saturday": 5,
    "Sunday": 6,
}

# model_no_timeseries
_NTS_DIR = MODEL_DIR / "model_no_timeseries"
_NTS_MODEL_PATH = _NTS_DIR / "energy_model_final3.keras"
_NTS_SCALER_X_PATH = _NTS_DIR / "scaler_x.pkl"
_NTS_SCALER_Y_PATH = _NTS_DIR / "scaler_y.pkl"

# model_24
_TS24_DIR = MODEL_DIR / "model_24"
_TS24_MODEL_PATH = _TS24_DIR / "energy_model_final.keras"
_TS24_SCALER_X_PATH = _TS24_DIR / "scaler_x.pkl"
_TS24_SCALER_Y_PATH = _TS24_DIR / "scaler_y.pkl"

_logger = logging.getLogger(__name__)

_nts_model = None
_nts_scaler_x = None
_nts_scaler_y = None
_nts_features = None
_nts_loaded = False

_ts24_model = None
_ts24_scaler_x = None
_ts24_scaler_y = None
_ts24_features = None
_ts24_loaded = False

_weather_means_cache = None
_history_cache = None
# Cache of the warmed-up working df: (warmup_end_ts, working_df)
# Avoids re-running the expensive per-hour warmup loop on every API request.
_ts24_warmup_cache = None


def _load_nts_artifacts():
    global _nts_model, _nts_scaler_x, _nts_scaler_y, _nts_features, _nts_loaded
    if _nts_loaded:
        return
    try:
        from keras.models import load_model

        _nts_model = load_model(_NTS_MODEL_PATH) if _NTS_MODEL_PATH.exists() else None
    except Exception as e:
        _logger.exception("Failed to load model_no_timeseries: %s", e)
        _nts_model = None

    try:
        _nts_scaler_x = joblib.load(_NTS_SCALER_X_PATH) if _NTS_SCALER_X_PATH.exists() else None
        _nts_features = list(_nts_scaler_x.feature_names_in_) if _nts_scaler_x is not None else None
    except Exception as e:
        _logger.exception("Failed to load model_no_timeseries scaler_x: %s", e)
        _nts_scaler_x = None
        _nts_features = None

    try:
        _nts_scaler_y = joblib.load(_NTS_SCALER_Y_PATH) if _NTS_SCALER_Y_PATH.exists() else None
    except Exception as e:
        _logger.exception("Failed to load model_no_timeseries scaler_y: %s", e)
        _nts_scaler_y = None

    _nts_loaded = True


def _load_ts24_artifacts():
    global _ts24_model, _ts24_scaler_x, _ts24_scaler_y, _ts24_features, _ts24_loaded
    if _ts24_loaded:
        return
    try:
        from keras.models import load_model

        _ts24_model = load_model(_TS24_MODEL_PATH) if _TS24_MODEL_PATH.exists() else None
    except Exception as e:
        _logger.exception("Failed to load model_24: %s", e)
        _ts24_model = None

    try:
        _ts24_scaler_x = joblib.load(_TS24_SCALER_X_PATH) if _TS24_SCALER_X_PATH.exists() else None
        _ts24_features = list(_ts24_scaler_x.feature_names_in_) if _ts24_scaler_x is not None else None
    except Exception as e:
        _logger.exception("Failed to load model_24 scaler_x: %s", e)
        _ts24_scaler_x = None
        _ts24_features = None

    try:
        _ts24_scaler_y = joblib.load(_TS24_SCALER_Y_PATH) if _TS24_SCALER_Y_PATH.exists() else None
    except Exception as e:
        _logger.exception("Failed to load model_24 scaler_y: %s", e)
        _ts24_scaler_y = None

    _ts24_loaded = True


_nts_history_cache = None


def _load_history(cons_path=None):
    """Load Izmir history, merging deep energy_data.csv with the more recent
    model-specific consumptions.csv so lag/rolling features are as fresh as possible."""
    global _history_cache
    cache_key = str(cons_path) if cons_path else "default"
    cached = _history_cache if cache_key == "default" else None

    if cached is not None:
        return cached.copy()

    # 1. Base: full history from energy_data.csv
    df_base = pd.read_csv(DATA_PATH)
    df_base["Timestamp"] = pd.to_datetime(df_base["Timestamp"])
    if "city" not in df_base.columns:
        df_base["city"] = "Izmir"
    df_base = df_base[df_base["city"].astype(str).str.lower() == "izmir"].copy()

    # 2. Extension: recent data from the model-specific consumptions.csv (if available)
    ext_path = cons_path if cons_path else _CONS_24_PATH
    if Path(ext_path).exists():
        df_ext = pd.read_csv(ext_path)
        df_ext["Timestamp"] = pd.to_datetime(df_ext["Timestamp"])
        if "city" not in df_ext.columns:
            df_ext["city"] = "Izmir"
        df_ext = df_ext[df_ext["city"].astype(str).str.lower() == "izmir"].copy()
        # Merge: base provides deep history, ext overrides/extends with more recent rows
        df = pd.concat([df_base, df_ext], ignore_index=True)
    else:
        df = df_base

    df = df.sort_values("Timestamp").drop_duplicates("Timestamp", keep="last").reset_index(drop=True)

    if cache_key == "default":
        _history_cache = df
    return df.copy()


def _load_nts_history():
    """Same merge logic but using the model_no_timeseries consumptions.csv."""
    global _nts_history_cache
    if _nts_history_cache is not None:
        return _nts_history_cache.copy()
    result = _load_history(cons_path=_CONS_NTS_PATH)
    _nts_history_cache = result
    return result.copy()


def get_historical_weather_means():
    global _weather_means_cache
    if _weather_means_cache is not None:
        return _weather_means_cache
    try:
        df = _load_history()
        result = {}
        for h in range(24):
            subset = df[df["Timestamp"].dt.hour == h]
            if len(subset):
                result[h] = {
                    "tavg": float(subset["tavg"].mean()),
                    "prcp": float(subset["prcp"].mean()),
                    "wspd": float(subset["wspd"].mean()),
                    "humidity": float(subset["humidity"].mean()),
                    "energy_mean": float(subset["EnergyConsumption"].mean()),
                }
        _weather_means_cache = result
        return result
    except Exception as e:
        _logger.exception("Failed to load weather means: %s", e)
        return {}


def _fetch_online_weather_hourly(start_ts, end_ts):
    start_date = pd.to_datetime(start_ts).strftime("%Y-%m-%d")
    end_date = pd.to_datetime(end_ts).strftime("%Y-%m-%d")

    params = {
        "latitude": IZMIR_LAT,
        "longitude": IZMIR_LON,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ["temperature_2m", "dew_point_2m", "precipitation", "windspeed_10m"],
        "timezone": "auto",
    }

    urls = [
        "https://api.open-meteo.com/v1/forecast",
        "https://archive-api.open-meteo.com/v1/archive",
    ]

    for url in urls:
        try:
            r = requests.get(url, params=params, timeout=30)
            if r.status_code != 200:
                continue
            hourly = r.json().get("hourly", {})
            if not hourly or "time" not in hourly:
                continue

            df = pd.DataFrame(
                {
                    "Timestamp": pd.to_datetime(hourly.get("time", [])),
                    "tavg": np.array(hourly.get("temperature_2m", []), dtype=float),
                    "prcp": np.array(hourly.get("precipitation", []), dtype=float),
                    "wspd": np.array(hourly.get("windspeed_10m", []), dtype=float),
                    "d2m": np.array(hourly.get("dew_point_2m", []), dtype=float),
                }
            )
            if df.empty:
                continue

            t = df["tavg"]
            d = df["d2m"]
            alpha_d = (17.625 * d) / (243.04 + d)
            alpha_t = (17.625 * t) / (243.04 + t)
            df["humidity"] = (100 * np.exp(alpha_d - alpha_t)).clip(0, 100)
            return df[["Timestamp", "tavg", "prcp", "wspd", "humidity"]]
        except Exception:
            continue

    return pd.DataFrame(columns=["Timestamp", "tavg", "prcp", "wspd", "humidity"])


def _build_nts_features(raw):
    _load_nts_artifacts()
    if _nts_features is None or _nts_scaler_x is None:
        raise RuntimeError("model_no_timeseries artifacts are unavailable")

    features = _nts_features
    df = pd.DataFrame([raw]).copy()
    df["Timestamp"] = pd.to_datetime(df["Timestamp"])
    ts = df["Timestamp"].iloc[0]

    city_cols = [c for c in features if c.startswith("city_")]
    for col in city_cols:
        df[col] = 0
    city_col = "city_" + str(raw.get("city", "Izmir"))
    if city_col in city_cols:
        df[city_col] = 1
    if "city" in df.columns:
        df.drop(columns=["city"], inplace=True)

    dow_cols = [c for c in features if c.startswith("dow_")]
    weekday_num = WEEKDAY_MAP.get(str(raw.get("weekday", "")), ts.weekday())
    df["weekday_num"] = weekday_num
    for col in dow_cols:
        df[col] = 0
    dow_col = f"dow_{weekday_num}"
    if dow_col in dow_cols:
        df[dow_col] = 1
    if "weekday" in df.columns:
        df.drop(columns=["weekday"], inplace=True)

    hour = int(raw.get("hour", ts.hour))
    month = ts.month
    df["year"] = ts.year
    df["month"] = month
    df["dayofyear"] = ts.dayofyear
    df["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)
    hour_week = hour + weekday_num * 24
    df["hour_week_sin"] = np.sin(2 * np.pi * hour_week / 168)
    df["hour_week_cos"] = np.cos(2 * np.pi * hour_week / 168)

    tavg = float(raw.get("tavg", 0))
    wspd = float(raw.get("wspd", 0))
    humidity = float(raw.get("humidity", 0))
    df["temp_sq"] = tavg ** 2
    df["temp_humidity"] = tavg * humidity
    df["temp_wind"] = tavg * wspd
    df["wind_humidity"] = wspd * humidity
    df["is_holiday"] = int(raw.get("is_holiday", 0))

    df = df.reindex(columns=features, fill_value=0)
    df[features] = _nts_scaler_x.transform(df[features])
    return df[features].values.reshape(1, 1, len(features))


def predict_single(user_input):
    _load_nts_artifacts()
    if _nts_model is None or _nts_scaler_y is None:
        raise RuntimeError("model_no_timeseries artifacts are unavailable")
    x = _build_nts_features(user_input)
    pred_scaled = _nts_model.predict(x, verbose=0)
    return float(np.expm1(_nts_scaler_y.inverse_transform(pred_scaled))[0][0])


def _build_ts24_feature_frame(df):
    _load_ts24_artifacts()
    if _ts24_features is None:
        raise RuntimeError("model_24 features unavailable")

    feat = df.copy()
    feat["Timestamp"] = pd.to_datetime(feat["Timestamp"])
    feat = feat.sort_values("Timestamp").reset_index(drop=True)

    feat["EnergyConsumption"] = feat["EnergyConsumption"].ffill().bfill()
    feat["Energy_log"] = np.log1p(feat["EnergyConsumption"])

    feat["hour"] = feat["Timestamp"].dt.hour
    feat["weekday_num"] = feat["Timestamp"].dt.weekday
    feat["month"] = feat["Timestamp"].dt.month
    feat["dayofyear"] = feat["Timestamp"].dt.dayofyear
    feat["year"] = feat["Timestamp"].dt.year
    feat["is_holiday"] = feat["weekday_num"].isin([5, 6]).astype(int)

    feat["hour_sin"] = np.sin(2 * np.pi * feat["hour"] / 24)
    feat["hour_cos"] = np.cos(2 * np.pi * feat["hour"] / 24)
    feat["month_sin"] = np.sin(2 * np.pi * feat["month"] / 12)
    feat["month_cos"] = np.cos(2 * np.pi * feat["month"] / 12)
    hour_week = feat["hour"] + feat["weekday_num"] * 24
    feat["hour_week_sin"] = np.sin(2 * np.pi * hour_week / 168)
    feat["hour_week_cos"] = np.cos(2 * np.pi * hour_week / 168)

    for c in ["tavg", "humidity", "wspd", "prcp"]:
        if c not in feat.columns:
            feat[c] = 0
        feat[c] = feat[c].ffill().bfill()

    feat["temp_sq"] = feat["tavg"] ** 2
    feat["temp_humidity"] = feat["tavg"] * feat["humidity"]
    feat["temp_wind"] = feat["tavg"] * feat["wspd"]
    feat["wind_humidity"] = feat["wspd"] * feat["humidity"]

    for l in [1, 2, 3, 6, 12, 24, 48, 72, 168, 336]:
        feat[f"lag_{l}"] = feat["Energy_log"].shift(l)

    shifted = feat["Energy_log"].shift(1)
    for w in [6, 12, 24, 48, 168]:
        feat[f"roll_mean_{w}"] = shifted.rolling(w).mean()
        feat[f"roll_std_{w}"] = shifted.rolling(w).std()
    for w in [6, 24, 168]:
        feat[f"roll_min_{w}"] = shifted.rolling(w).min()
        feat[f"roll_max_{w}"] = shifted.rolling(w).max()

    feat["diff_1"] = feat["Energy_log"].diff(1)
    feat["diff_24"] = feat["Energy_log"].diff(24)

    city_cols = [c for c in _ts24_features if c.startswith("city_")]
    for col in city_cols:
        feat[col] = 0
    if "city_Izmir" in city_cols:
        feat["city_Izmir"] = 1

    for i in range(7):
        feat[f"dow_{i}"] = (feat["weekday_num"] == i).astype(int)

    for col in _ts24_features:
        if col not in feat.columns:
            feat[col] = 0

    return feat


def _merge_online_weather(df, start_ts, end_ts):
    weather_df = _fetch_online_weather_hourly(start_ts, end_ts)
    if weather_df.empty:
        means = get_historical_weather_means()
        rng = pd.date_range(start=start_ts, end=end_ts, freq="h")
        fallback = []
        for ts in rng:
            wm = means.get(ts.hour, {})
            fallback.append(
                {
                    "Timestamp": ts,
                    "tavg": wm.get("tavg", 14.0),
                    "prcp": wm.get("prcp", 0.0),
                    "wspd": wm.get("wspd", 2.0),
                    "humidity": wm.get("humidity", 55.0),
                }
            )
        weather_df = pd.DataFrame(fallback)

    merged = df.copy()
    merged = pd.concat([merged, weather_df], ignore_index=True)
    merged = merged.sort_values("Timestamp").drop_duplicates("Timestamp", keep="last").reset_index(drop=True)
    merged["city"] = "Izmir"
    return merged


def _safe_last_energy(working_df):
    """Return last finite energy value, defaulting to 0.0 if unavailable."""
    if "EnergyConsumption" not in working_df.columns:
        return 0.0
    s = pd.to_numeric(working_df["EnergyConsumption"], errors="coerce")
    s = s[np.isfinite(s)]
    if len(s):
        return float(s.iloc[-1])
    return 0.0


def predict_horizon_hourly(start_ts, horizon_hours, city="Izmir", model_choice=None):
    """
    Predict hourly demand for Izmir.
    Uses model_24 up to 336h (next 2 weeks), model_no_timeseries for longer horizons.
    """
    horizon = int(max(1, min(int(horizon_hours), 720)))
    start_ts = pd.to_datetime(start_ts)
    if getattr(start_ts, "tzinfo", None) is not None:
        try:
            start_ts = start_ts.tz_convert(None)
        except Exception:
            start_ts = start_ts.tz_localize(None)
    start_ts = start_ts.replace(minute=0, second=0, microsecond=0)
    city = "Izmir"

    _load_ts24_artifacts()
    _load_nts_artifacts()

    requested_model = str(model_choice).strip().lower() if model_choice is not None else None
    ts24_ready = (
        _ts24_model is not None
        and _ts24_scaler_x is not None
        and _ts24_scaler_y is not None
        and _ts24_features is not None
    )
    nts_ready = (_nts_model is not None and _nts_scaler_x is not None and _nts_scaler_y is not None and _nts_features is not None)

    use_ts24 = (
        (requested_model in (None, "", "auto") and horizon <= 336 and ts24_ready)
        or (requested_model == "model_24" and ts24_ready)
    )

    if requested_model == "model_no_timeseries" and not nts_ready:
        raise RuntimeError("model_no_timeseries artifacts are not available")

    history = _load_history()
    # Capture the last real-data timestamp BEFORE extending with forecast weather.
    # This is the boundary where the warmup pass must start.
    _real_history_end = history["Timestamp"].max()
    target_range = pd.date_range(start=start_ts, periods=horizon, freq="h")

    max_target = target_range.max()
    if max_target > _real_history_end:
        history = _merge_online_weather(history, _real_history_end + pd.Timedelta(hours=1), max_target)

    preds = []

    # Enough history rows for all lags (max=336) + sequence window (24) + buffer
    # Keep rows needed for max lag (336) + sequence window (24) + buffer
    _KEEP_HOURS = 400

    def _ts24_predict_one(working_df, ts):
        """Predict a single timestamp and write prediction back into working_df."""
        # Trim rows older than ts - KEEP_HOURS to keep dataframe small but correct
        needed_from = ts - pd.Timedelta(hours=_KEEP_HOURS)
        if working_df["Timestamp"].min() < needed_from:
            working_df = working_df[working_df["Timestamp"] >= needed_from].reset_index(drop=True)
        fallback_energy = _safe_last_energy(working_df)
        means = get_historical_weather_means().get(pd.to_datetime(ts).hour, {})

        # Some weather API responses may miss individual hours. Ensure target ts exists
        # so we always return exactly `horizon` predictions.
        if not (working_df["Timestamp"] == ts).any():
            fill_row = {
                "Timestamp": pd.to_datetime(ts),
                "city": "Izmir",
                "EnergyConsumption": fallback_energy,
                "tavg": float(means.get("tavg", 14.0)),
                "prcp": float(means.get("prcp", 0.0)),
                "wspd": float(means.get("wspd", 2.0)),
                "humidity": float(means.get("humidity", 55.0)),
            }
            working_df = pd.concat([working_df, pd.DataFrame([fill_row])], ignore_index=True)
            working_df = (
                working_df.sort_values("Timestamp")
                .drop_duplicates("Timestamp", keep="last")
                .reset_index(drop=True)
            )

        feat_df = _build_ts24_feature_frame(working_df)
        idx_match = feat_df.index[feat_df["Timestamp"] == ts]
        if len(idx_match) == 0:
            return working_df, fallback_energy
        i = int(idx_match[0])
        if i < SEQ_LEN_24:
            raw = pd.to_numeric(working_df.loc[working_df["Timestamp"] == ts, "EnergyConsumption"], errors="coerce").iloc[0]
            pred_val = float(raw) if np.isfinite(raw) else fallback_energy
        else:
            seq_features = feat_df.loc[i - SEQ_LEN_24: i - 1, _ts24_features].copy()
            # When working windows are trimmed, early rolling/lag rows can still carry
            # NaN/Inf. Fill locally so model inference stays dynamic instead of falling
            # back to a constant value for several initial hours.
            seq_features = seq_features.replace([np.inf, -np.inf], np.nan).ffill().bfill().fillna(0)
            x_seq = _ts24_scaler_x.transform(seq_features)
            if not np.isfinite(x_seq).all():
                pred_val = fallback_energy
                working_df.loc[working_df["Timestamp"] == ts, "EnergyConsumption"] = pred_val
                return working_df, pred_val
            x_seq = x_seq.reshape(1, SEQ_LEN_24, len(_ts24_features))
            pred_scaled = _ts24_model.predict(x_seq, verbose=0)
            pred_val = float(np.expm1(_ts24_scaler_y.inverse_transform(pred_scaled))[0][0])
            if not np.isfinite(pred_val):
                pred_val = fallback_energy
        working_df.loc[working_df["Timestamp"] == ts, "EnergyConsumption"] = pred_val
        return working_df, pred_val

    if use_ts24:
        global _ts24_warmup_cache
        hist_end = _real_history_end

        # Warmup: fill predictions for every hour between history end and start_ts
        # so lag/rolling features are based on iteratively predicted values rather
        # than flat ffill constants. Results are cached to avoid re-running on
        # every API request.
        if start_ts > hist_end + pd.Timedelta(hours=1):
            warmup_end_needed = start_ts - pd.Timedelta(hours=1)

            cached_end, cached_working = _ts24_warmup_cache if _ts24_warmup_cache else (None, None)

            if cached_end is not None and cached_end >= warmup_end_needed:
                # Cache already covers everything we need — use it directly
                working = cached_working.copy()
            else:
                # Start from cache or fresh history, then run remaining warmup
                if cached_end is not None and cached_end > hist_end:
                    working = cached_working.copy()
                    resume_from = cached_end + pd.Timedelta(hours=1)
                else:
                    working = history.copy()
                    resume_from = hist_end + pd.Timedelta(hours=1)

                warmup_range = pd.date_range(start=resume_from, end=warmup_end_needed, freq="h")
                for wts in warmup_range:
                    working, _ = _ts24_predict_one(working, wts)

                _ts24_warmup_cache = (warmup_end_needed, working.copy())
        else:
            working = history.copy()

        for ts in target_range:
            working, pred_val = _ts24_predict_one(working, ts)
            if pred_val is None:
                continue
            row = working.loc[working["Timestamp"] == ts].iloc[0]

            preds.append(
                {
                    "datetime": pd.to_datetime(ts).isoformat(),
                    "predicted_demand": int(round(pred_val)),
                    "temperature": float(row.get("tavg", np.nan)),
                    "humidity": float(row.get("humidity", np.nan)),
                    "precipitation": float(row.get("prcp", np.nan)),
                    "wind_speed": float(row.get("wspd", np.nan)),
                    "is_holiday": bool(pd.to_datetime(ts).weekday() >= 5),
                    "hour": int(pd.to_datetime(ts).hour),
                    "weekday": pd.to_datetime(ts).strftime("%A"),
                    "model_used": "model_24",
                }
            )
        return preds

    # fallback / long-horizon path: model_no_timeseries
    means = get_historical_weather_means()
    nts_history = _load_nts_history()
    if max_target > nts_history["Timestamp"].max():
        nts_history = _merge_online_weather(nts_history, nts_history["Timestamp"].max() + pd.Timedelta(hours=1), max_target)
    for ts in target_range:
        ts = pd.to_datetime(ts)
        row = nts_history.loc[nts_history["Timestamp"] == ts]
        if len(row):
            row = row.iloc[0]
            tavg = float(row.get("tavg", np.nan))
            prcp = float(row.get("prcp", np.nan))
            wspd = float(row.get("wspd", np.nan))
            humidity = float(row.get("humidity", np.nan))
        else:
            wm = means.get(ts.hour, {})
            tavg = float(wm.get("tavg", 14.0))
            prcp = float(wm.get("prcp", 0.0))
            wspd = float(wm.get("wspd", 2.0))
            humidity = float(wm.get("humidity", 55.0))

        pred = predict_single(
            {
                "Timestamp": ts.isoformat(),
                "city": city,
                "tavg": tavg,
                "prcp": prcp,
                "wspd": wspd,
                "humidity": humidity,
                "hour": int(ts.hour),
                "weekday": ts.strftime("%A"),
                "is_holiday": 1 if ts.weekday() >= 5 else 0,
            }
        )

        preds.append(
            {
                "datetime": ts.isoformat(),
                "predicted_demand": int(round(pred)),
                "temperature": tavg,
                "humidity": humidity,
                "precipitation": prcp,
                "wind_speed": wspd,
                "is_holiday": bool(ts.weekday() >= 5),
                "hour": int(ts.hour),
                "weekday": ts.strftime("%A"),
                "model_used": "model_no_timeseries",
            }
        )

    return preds
