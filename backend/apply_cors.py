"""
Script para aplicar la configuración CORS al bucket de Google Cloud Storage.
Ejecutar una sola vez: python apply_cors.py
"""
import os
from dotenv import load_dotenv
load_dotenv()

from google.cloud import storage

BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "yaser-pqt08-talara")

cors_config = [
    {
        "origin": ["*"],
        "method": ["GET", "HEAD", "OPTIONS"],
        "responseHeader": [
            "Content-Type",
            "Authorization",
            "Content-Length",
            "User-Agent",
            "x-goog-resumable",
        ],
        "maxAgeSeconds": 3600
    }
]

def apply_cors():
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if creds_path and not os.path.isabs(creds_path):
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        alt_path = os.path.join(backend_dir, os.path.basename(creds_path))
        if os.path.exists(alt_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = alt_path
        else:
            root_path = os.path.join(os.path.dirname(backend_dir), creds_path)
            if os.path.exists(root_path):
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(root_path)

    try:
        client = storage.Client()
        bucket = client.get_bucket(BUCKET_NAME)
        bucket.cors = cors_config
        bucket.patch()
        print(f"✅ CORS aplicado exitosamente al bucket: {BUCKET_NAME}")
        print(f"   Ahora el navegador puede leer PDFs directamente para las miniaturas.")
    except Exception as e:
        print(f"❌ Error aplicando CORS: {e}")

if __name__ == "__main__":
    apply_cors()
