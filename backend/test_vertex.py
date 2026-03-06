import os
from google.cloud import aiplatform
from dotenv import load_dotenv

# Load env
backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(os.path.dirname(backend_dir), '.env'))

PROJECT_ID = os.environ.get("GCP_PROJECT_ID") or "correos-gmail-425301"
LOCATION = "us-central1"

# Resolve credentials path to absolute
creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
if creds_path and not os.path.isabs(creds_path):
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    alt_path = os.path.join(backend_dir, os.path.basename(creds_path))
    if os.path.exists(alt_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = alt_path

print(f"Testing Project: {PROJECT_ID}")
print(f"Creds Path: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}")

def list_models():
    try:
        aiplatform.init(project=PROJECT_ID, location=LOCATION)
        # This is a low level way to check if we can reach the service
        from google.cloud.aiplatform.gapic import ModelServiceClient
        client = ModelServiceClient(client_options={"api_endpoint": f"{LOCATION}-aiplatform.googleapis.com"})
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        
        print(f"Attempting to list models in {parent}...")
        results = client.list_models(parent=parent)
        for model in results:
            print(f"Model: {model.display_name} ({model.name})")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_models()
