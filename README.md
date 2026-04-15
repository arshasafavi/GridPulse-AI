# ⚡ GridPulse AI – Energy Demand Forecasting Intelligence

**GridPulse AI** is an advanced AI-powered platform for **real-time electricity demand forecasting** with an interactive web dashboard. It combines deep learning models, historical weather analysis, and scenario simulation to deliver actionable insights for power grid optimization and energy planning.

Developed for the **AI Challenge: Energy Demand Forecasting**, this project showcases end-to-end machine learning, REST APIs, and modern web UI design.

---

## 🎯 Project Overview

### Challenge Context
Urban electricity demand fluctuates based on numerous interconnected factors: **temperature, humidity, time-of-day patterns, weekday/weekend effects, holidays, wind speed, and seasonal variations**. Accurate hourly forecasting is critical for:
- ✅ **Grid Optimization** – Balance energy supply with predicted demand
- ✅ **Cost Reduction** – Minimize waste and peak-hour penalties  
- ✅ **Operational Planning** – Anticipate infrastructure stress
- ✅ **Decision Support** – Provide data-driven scenario analysis

### Objectives
- Forecast hourly electricity demand for **whole country** (primary target) using multi-city data
- Implement two complementary neural network models with distinct architectures
- Support scenario simulation for "what-if" analysis
- Deliver a product-grade interactive dashboard with real-time metrics
- Provide RESTful API for integration with external systems

---

## 📊 Dataset & Features

### Data Structure
The system processes **hourly energy consumption records** with 10 engineered features:

| Feature | Type | Meaning |
|---------|------|---------|
| `datetime` | Timestamp | Exact hour of observation |
| `hour` | Integer [0-23] | Hour of day (captures intra-day patterns) |
| `weekday` | Integer [0-6] | Day of week (Mon=0, Sun=6) |
| `is_holiday` | Binary | Public holiday indicator |
| `tavg` | Float | Average temperature (°C) |
| `humidity` | Float | Relative humidity (%) |
| `wspd` | Float | Wind speed (m/s) |
| `prcp` | Float | Precipitation (mm) |
| `consumption_kWh` | Target | Actual energy consumption (hourly) |


## 🧠 Machine Learning Models

### Model 1: `model_24` – Sequential GRU
**Architecture:** Time-series aware GRU (Long Short-Term Memory) neural network
- **Input:** Sliding 24-hour window of historical consumption + current features
- **Layers:** Bidirectional GRU + Dense layers with dropout regularization
- **Purpose:** Captures temporal dependencies and consumption momentum
- **Strength:** Excellent for short-term patterns (next 1-366 hours)
- **File:** `models/model_24/energy_model_final.keras`

### Model 2: `model_no_timeseries` – Feedforward GRU Network
**Architecture:** Multi-layer feedforward neural network without sequence memory
- **Input:** Current hour's static features (temperature, humidity, day-of-week, etc.)
- **Layers:** GRU layers with batch normalization + dropout
- **Purpose:** Direct feature-to-demand mapping; simpler, faster inference
- **Strength:** Robust generalization; minimal overfitting
- **File:** `models/model_no_timeseries/energy_model_final3.keras`

### Model Training
Both models use **Keras/TensorFlow** with:
- Feature scaling via `StandardScaler` (persisted as `.pkl` files)
- Train/test split on temporal data (respecting time-order)
- Hyperparameter tuning via grid search
- Validation metrics: MAE, RMSE, MAPE, R² Score, Bias, Peak Error

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────┐
│  Django Backend (REST API + Templates)  │
├─────────────────────────────────────────┤
│  • /api/metrics/          – Model stats │
│  • /api/forecast/         – Predictions │
│  • /api/scenario/         – Simulations │
│  • /dashboard/            – Web UI      │
├─────────────────────────────────────────┤
│  ML Service (ml_service.py)             │
│  • Load Keras models & scalers          │
│  • Feature engineering & preprocessing  │
│  • Inference (model_24 / model_nts)     │
├─────────────────────────────────────────┤
│  Data Layer                             │
│  • energy_data.csv (historical hourly)  │
│  • performance_metrics.json (override)  │
│  • predictions.csv / predictions_24.csv │
└─────────────────────────────────────────┘
```

---

## 🎨 Dashboard UI – 4 Main Pages

### 📈 **Overview** (Home)
Real-time energy intelligence hub:
- **KPI Cards:** Current demand, peak forecast, daily average, temperature
- **Main Chart:** Dynamic Plotly line chart (Actual vs Predicted demand)
- **Mini Charts:** Daily load pattern, temperature–demand correlation, weekly trend
- **Insights Panel:** Peak hour, lowest demand, weather effects, forecast confidence

### 📊 **Historical Analysis**
Deep dive into historical patterns:
- **Trend Chart:** Full energy time-series with annotations
- **Heatmap:** Hourly × monthly consumption patterns (identify peak seasons)
- **Weather Correlation:** Temperature vs demand U-curve visualization
- **Sample Table:** Structured historical records with filtering

### 🔮 **Forecasting**
Future demand outlook:
- **Demand Drivers:** Feature importance bar chart (which factors matter most)
- **Status Distribution:** Pie chart showing low/medium/high demand probability
- **Forecast Table:** Hour-by-hour predictions for next 24–240 hours
- **Summary Cards:** Risk indicators, trend direction, operational alerts

### 📉 **Model Performance**
Evaluation & benchmarking:
- **Metrics Dashboard:** MAE, RMSE, MAPE%, R² Score, Bias, Peak Error
- **Model Selector:** Toggle between `model_24` and `model_no_timeseries`
- **Actual vs Predicted:** CSV-driven line chart (model-specific data)
- **Error Distribution:** Residual histogram (Predicted – Actual)
- **Model Comparison:** Side-by-side metrics for both models
- **Evaluation Samples:** Real test-period examples with error breakdown

**Features:**
- ✨ Responsive design (mobile-friendly)
- 📊 Interactive Plotly charts with hover tooltips
- 🎯 Real-time data refresh with Refresh buttons
- 💾 Manual metrics override via `data/performance_metrics.json`

---

## 🔗 REST API Endpoints

All endpoints return JSON. Base URL: `/api/`

| Endpoint | Method | Purpose | Parameters |
|----------|--------|---------|-----------|
| `/metrics/` | GET | Fetch model performance metrics | `model_choice` (model_24 / model_no_timeseries) |
| `/forecast/` | POST | Generate single prediction | `{timestamp, city, hour, tavg, humidity, ...}` |
| `/scenario/` | POST | Simulate "what-if" scenarios | `{city, temp_delta, humidity_delta, is_holiday, ...}` |

### Fast-Path Optimization
- If `data/performance_metrics.json` contains all 6 metrics for a model → **skip ML inference**, return cached JSON immediately (~1ms)
- Fallback: Run full model prediction pipeline (~2-3 seconds on cold start)
- CSV row caching: Historical data parsed once, reused across requests

---

## 🚀 Installation & Setup

### Requirements
- Python 3.8+
- Django 6.0.3
- TensorFlow/Keras 2.12+
- Plotly 6.6.0 (frontend charts)
- Scikit-learn 1.3.2
- Pandas 3.0.1

### Quick Start
```bash
# 1. Clone and navigate
cd GridPulse_AI

# 2. Install dependencies
pip install -r requirements.txt

# 3. Initialize database
python manage.py migrate

# 4. Run development server
python manage.py runserver

# 5. Open browser
http://127.0.0.1:8000/
```

---

## 💡 Key Technologies

| Layer | Tools |
|-------|-------|
| **Frontend** | Django Templates, Bootstrap 5, Plotly.js, HTML5/CSS3 |
| **Backend** | Django 6.0, Django REST Framework, Pandas, NumPy |
| **ML/AI** | TensorFlow/Keras, Scikit-learn, XGBoost, Joblib |
| **Data** | CSV (pandas), JSON, SQLite |
| **Visualization** | Plotly (interactive), Matplotlib (static charts) |

---

## 📁 Project Structure

```
GridPulse_AI/
├── manage.py                          # Django CLI
├── requirements.txt                   # Dependencies
├── config/                            # Django settings
│   ├── settings.py, urls.py, wsgi.py
├── apps/
│   ├── api/                           # ML service + REST endpoints
│   │   ├── ml_service.py              # Keras model loading & inference
│   │   ├── views.py                   # API view functions
│   │   └── urls.py
│   ├── dashboard/                     # Web UI
│   │   ├── views.py                   # Page rendering
│   │   ├── static/dashboard/
│   │   │   ├── js/dashboard.js        # Interactive JS logic
│   │   │   ├── css/dashboard.css      # Styling
│   │   │   └── charts/                # Pre-rendered Plotly HTMLs (11 charts)
│   │   └── templates/dashboard/
│   │       ├── base.html              # Layout wrapper
│   │       ├── dashboard_home.html    # Overview page
│   │       ├── historical.html        # Historical page
│   │       ├── forecasting.html       # Forecasting page
│   │       └── performance.html       # Performance page
├── models/
│   ├── model_24/energy_model_final.keras    # LSTM model
│   └── model_no_timeseries/energy_model_final3.keras
├── data/
│   ├── energy_data.csv                # Historical hourly data
│   └── performance_metrics.json       # Manual metrics override
└── charts/                            # Pre-computed Plotly visualizations
    └── (11 static HTML files + 2 CSV prediction files)
```

---

## ✨ Highlights & Innovations

🎯 **Dual Model Strategy** – Compare LSTM vs. Feedforward for robustness  
📊 **Interactive Dashboards** – Responsive, real-time, multi-page analysis  
🔄 **Scenario Simulation** – "What-if" analysis for grid planning  
⚡ **Smart Caching** – Fast-path JSON metrics + row cache for CSV  
🎨 **Beautiful UI** – Glass-morphism design, smooth animations, mobile-friendly  
🔌 **RESTful API** – Integration-ready endpoints for external systems  
📈 **Production-Ready** – Error handling, logging, performance optimization

---

## 👤 Competition & Deployment

Developed for **AI Challenge: Energy Demand Forecasting**  
Production-ready platform suitable for deployment on cloud infrastructure (AWS, Azure, Heroku)

**Status:** ✅ Complete – All features implemented and tested