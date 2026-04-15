from django.urls import path
from .views import (
    dashboard_home,
    historical_page,
    forecasting_page,
    scenario_page,
    performance_page,
)

app_name = "dashboard"

urlpatterns = [
    path("", dashboard_home, name="home"),
    path("historical/", historical_page, name="historical"),
    path("forecasting/", forecasting_page, name="forecasting"),
    path("scenario/", scenario_page, name="scenario"),
    path("performance/", performance_page, name="performance"),
]