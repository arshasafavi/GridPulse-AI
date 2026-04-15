from django.test import TestCase
from rest_framework.test import APIClient
from django.urls import reverse


class ForecastApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = reverse('api:forecast')

    def test_forecast_success(self):
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
        resp = self.client.post(self.url, payload, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('predicted_energy', resp.data)

    def test_forecast_validation_error(self):
        # missing tavg
        payload = {
            "Timestamp": "2026-03-26 15:00:00",
            "city": "Istanbul",
            "weekday": "Friday",
            "hour": 15,
            "prcp": 0.0,
            "wspd": 2.5,
            "humidity": 60.0,
        }
        resp = self.client.post(self.url, payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['status'], 'error')