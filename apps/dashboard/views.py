from django.shortcuts import render
from django.test import RequestFactory
from django.utils import timezone
import json

# reuse internal forecast generator
from ..api.views import forecast_get_view

CITY_LIST = ["Izmir"]


def dashboard_home(request):
    # Attempt to populate initial forecast rows by calling internal forecast view
    forecast_rows = []
    try:
        rf = RequestFactory()
        # request a short horizon to keep page responsive (show first 24 hours)
        internal_req = rf.get('/api/forecast/', data={'horizon': 24})
        resp = forecast_get_view(internal_req)
        data = json.loads(resp.content)
        preds = data.get('predictions', [])[:12]
        for p in preds:
            hist = p.get('historical_mean')
            diff = None
            diff_pct = None
            if hist is not None:
                try:
                    diff = int(round(p.get('predicted_demand', 0) - float(hist)))
                    diff_pct = round((diff / float(hist)) * 100, 1) if float(hist) != 0 else 0
                except Exception:
                    diff = None
                    diff_pct = None

            forecast_rows.append({
                'datetime': p.get('datetime'),
                'predicted_demand': int(round(p.get('predicted_demand', 0))),
                'historical_mean': round(p.get('historical_mean'), 2) if p.get('historical_mean') is not None else None,
                'diff': diff,
                'diff_pct': diff_pct,
                'temperature': int(round(p.get('temperature'))) if p.get('temperature') is not None else None,
                'humidity': int(round(p.get('humidity'))) if p.get('humidity') is not None else None,
                'is_holiday': p.get('is_holiday', False),
                'status': p.get('status', 'Normal'),
            })
    except Exception:
        # fallback to empty list - template will show placeholder rows
        forecast_rows = []

    context = {
        "active_page": "overview",
        "selected_city": "Izmir",
        "cities": CITY_LIST,
        "updated_at": timezone.now().strftime("%Y-%m-%d %H:00"),
        "forecast_rows": forecast_rows,
    }
    return render(request, "dashboard/dashboard_home.html", context)


def historical_page(request):
    context = {
        "active_page": "historical",
        "selected_city": "Istanbul",
        "cities": CITY_LIST,
    }
    return render(request, "dashboard/historical.html", context)


def forecasting_page(request):
    context = {
        "active_page": "forecasting",
        "selected_city": "Istanbul",
        "cities": CITY_LIST,
    }
    return render(request, "dashboard/forecasting.html", context)


def scenario_page(request):
    context = {
        "active_page": "scenario",
        "selected_city": "Istanbul",
        "cities": CITY_LIST,
    }
    return render(request, "dashboard/scenario.html", context)


def performance_page(request):
    context = {
        "active_page": "performance",
        "selected_city": "Istanbul",
        "cities": CITY_LIST,
    }
    return render(request, "dashboard/performance.html", context)