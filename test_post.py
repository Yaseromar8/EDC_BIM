import requests

url = "http://localhost:3000/api/tracking?model_urn=1_CANAL"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer DEMO_TOKEN"
}
data = {
    "fotos": [
        {
            "id": "test-tablet-pin",
            "pin_type": "fotos",
            "x": 1, "y": 2, "z": 3,
            "val": "Test Tablet",
            "photos": []
        }
    ]
}
try:
    response = requests.post(url, headers=headers, json=data)
    print(response.status_code)
    print(response.text)
except Exception as e:
    print(e)
