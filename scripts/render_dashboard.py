import os
import sys
import django

# ensure project root is on sys.path
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import RequestFactory
from apps.dashboard.views import dashboard_home

req = RequestFactory().get('/')
resp = dashboard_home(req)
html = resp.content.decode('utf-8')

out_path = os.path.join('scripts', 'dashboard_render.html')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html)

print(f'WROTE {out_path} (length={len(html)})')
