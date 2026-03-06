import os
from google.cloud import storage

def list_blobs():
    bucket_name = "yaser-pqt08-talara"
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "c:/Users/omars/OneDrive/Desktop/VISOR_APS_TL/backend/gcp_sa.json"
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blobs = list(bucket.list_blobs(max_results=20))
    for blob in blobs:
        print(f"Blob name: {blob.name}")

if __name__ == "__main__":
    list_blobs()
