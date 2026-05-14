import requests
import time
url = "https://visor-ecd-backend.onrender.com/health"
try:
    response = requests.get(url, timeout=5)
    print("Status:", response.status_code)
except Exception as e:
    print(e)
