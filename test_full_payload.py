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
            "id": "123456",
            "pin_type": "fotos",
            "x": 1, "y": 2, "z": 3,
            "val": "Test Laptop",
            "photos": []
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
