import os
import json
from google.cloud import storage
import urllib.parse

from gcs_manager import get_storage_client

def set_bucket_cors():
    try:
        client = get_storage_client()
        bucket_name = os.environ.get("GCS_BUCKET_NAME")
        if not bucket_name:
            print("GCS_BUCKET_NAME not found in environment!")
            return
            
        bucket = client.bucket(bucket_name)
        
        # Define the CORS policy based on the required headers for Resumable Uploads
        policies = [
            {
                "origin": ["*"],
                "method": ["GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD"],
                "responseHeader": [
                    "Content-Type",
                    "Authorization",
                    "Content-Length",
                    "Content-Range",
                    "User-Agent",
                    "x-goog-resumable",
                    "x-goog-content-length-range"
                ],
                "maxAgeSeconds": 3600
            }
        ]
        
        bucket.cors = policies
        bucket.patch()
        print(f"Successfully set CORS config on bucket '{bucket_name}'.")
    except Exception as e:
        print(f"Error setting CORS: {e}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    set_bucket_cors()
