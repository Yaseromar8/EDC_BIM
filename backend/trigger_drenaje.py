import requests

urns = [
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkJ4RkxyZi1vU1F5YWtnZ3B3YmdLNGc_dmVyc2lvbj0zNw",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnJyV05tX28zUlhLWFJsNlZGdzQ5ZGc_dmVyc2lvbj02",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLnpWOE5LU2pzVDRxcUxLQ2plUm1pSEE_dmVyc2lvbj0xMQ",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLkRDZE43cktaUTZDQ3NvSnhsaXJKS3c_dmVyc2lvbj02",
    "dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLno4cDRVU3NBUnZHRkpjLXNLenVvSXc_dmVyc2lvbj03"
]

for urn in urns:
    print(f"Triggering extraction for {urn[:30]}...")
    try:
        res = requests.post('http://localhost:3000/api/inventory/extract', json={
            "urn": urn,
            "target_urn": "1_DRENAJE"
        })
        print("Response:", res.status_code, res.json())
    except Exception as e:
        print("Error triggering extraction:", e)

