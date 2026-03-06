import os
from google.cloud import storage
from dotenv import load_dotenv

def set_bucket_cors(bucket_name):
    """Establece la política CORS para permitir subidas directas (PUT) desde el visor docs."""
    creds_path = os.path.join(os.path.dirname(__file__), "gcp_sa.json")
    storage_client = storage.Client.from_service_account_json(creds_path)
    bucket = storage_client.get_bucket(bucket_name)

    bucket.cors = [
        {
            "origin": ["http://localhost:5174", "http://localhost:5173", "http://localhost:3000", "*"],
            "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "responseHeader": ["Content-Type", "x-goog-resumable", "Authorization"],
            "maxAgeSeconds": 3600
        }
    ]
    bucket.patch()

    print(f"✅ Política CORS actualizada para el bucket: {bucket_name}")
    print("🚀 Ahora puedes subir archivos de cualquier tamaño directamente a la nube.")

if __name__ == "__main__":
    load_dotenv()
    bucket_name = os.getenv('GCS_BUCKET_NAME')
    if bucket_name:
        try:
            set_bucket_cors(bucket_name)
        except Exception as e:
            print(f"❌ Error configurando CORS: {e}")
    else:
        print("⚠️ No se encontró GCS_BUCKET_NAME en el .env")
