import requests

url = "https://visor-ecd-backend.onrender.com/api/tracking?model_urn=1_CANAL"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer DEMO_TOKEN"
}
data = {
  "avance": [],
  "fotos": [
    {
      "id": "1711234567890",
      "x": 12.3,
      "y": 45.6,
      "z": 78.9,
      "dbId": 1234,
      "codigoPartida": "abc",
      "partidaNombre": "def",
      "val": None
    }
  ],
  "docs": [],
  "rfis": [],
  "restricciones": [],
  "maquinaria": []
}

try:
    response = requests.post(url, headers=headers, json=data)
    print("Status:", response.status_code)
    print("Response:", response.text)
except Exception as e:
    print(e)
