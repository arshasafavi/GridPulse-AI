from django.urls import path
from .views import (
    overview_view,
    ForecastAPIView,
    forecast_get_view,
    export_forecast_csv,
    export_historical_csv,
    forecast_demo_view,
    scenario_view,
    metrics_view,
    historical_view,
)

app_name = "api"

urlpatterns = [
    path("overview/", overview_view, name="overview"),
    path("forecast/", forecast_get_view, name="forecast"),
    path("forecast/predict/", ForecastAPIView.as_view(), name="forecast_predict"),
    path("forecast/export_csv/", export_forecast_csv, name="forecast_export_csv"),
    path("forecast/demo/", forecast_demo_view, name="forecast_demo"),
    path("scenario/", scenario_view, name="scenario"),
    path("metrics/", metrics_view, name="metrics"),
    path("historical/", historical_view, name="historical"),
    path("historical/export_csv/", export_historical_csv, name="historical_export_csv"),
]

