import requests

url = "https://visor-ecd-backend.onrender.com/api/tracking?model_urn=1_CANAL"
headers = {
    "Origin": "https://visor-ecd-frontend.onrender.com",
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "Content-Type, Authorization"
}
try:
    response = requests.options(url, headers=headers)
    print("Status:", response.status_code)
    print("Headers:", response.headers)
except Exception as e:
    print(e)
