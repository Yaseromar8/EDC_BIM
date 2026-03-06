import requests
import json

url = 'http://localhost:3000/api/tracking'
headers = {'Content-Type': 'application/json'}
data = {
    "avance": [{"id": 1670000000, "val": "50%"}],
    "fotos": [],
    "detalles": {
        "1670000000": [{"Partida": "Test", "Avance": 50}]
    }
}

try:
    print(f"Sending POST to {url}...")
    response = requests.post(url, headers=headers, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
