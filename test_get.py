import requests

url = "https://visor-ecd-backend.onrender.com/api/project-pins?model_urn=1_CANAL"
try:
    response = requests.get(url)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print(e)
