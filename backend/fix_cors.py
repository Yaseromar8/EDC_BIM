import os
from google.cloud import storage

def configure_cors(bucket_name):
    """Sets a bucket's CORS policies configuration."""
    # bucket_name = "your-bucket-name"

    storage_client = storage.Client()
    bucket = storage_client.get_bucket(bucket_name)

    bucket.cors = [
        {
            "origin": ["*"],
            "method": ["PUT", "POST", "GET", "OPTIONS", "DELETE"],
            "responseHeader": ["Content-Type", "x-goog-resumable", "Origin", "Accept", "Authorization", "X-Requested-With"],
            "maxAgeSeconds": 3600
        }
    ]
    bucket.patch()

    print(f"CORS configuration for bucket {bucket_name} has been updated.")
    print(f"Current CORS: {bucket.cors}")

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        # try parent dir
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if '=' in line and not line.startswith('#'):
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value

if __name__ == "__main__":
    load_env()
    
    # Credenciales setup
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path:
        # Resolve path
        if not os.path.isabs(creds_path):
             os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.join(os.curdir, creds_path))

    bucket_name = os.environ.get("GCS_BUCKET_NAME")
    if not bucket_name or bucket_name == "TU_BUCKET_AQUI":
        print("Error: GCS_BUCKET_NAME not set in environment.")
    else:
        try:
            configure_cors(bucket_name)
        except Exception as e:
            print(f"Failed to configure CORS: {e}")
