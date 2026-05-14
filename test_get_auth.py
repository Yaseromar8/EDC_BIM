import requests

url = "https://visor-ecd-backend.onrender.com/api/project-pins?model_urn=1_CANAL"
headers = {"Authorization": "Bearer DEMO_TOKEN"}
try:
    response = requests.get(url, headers=headers)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print(e)
