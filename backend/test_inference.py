import os
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from dotenv import load_dotenv

# Load env
backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(os.path.dirname(backend_dir), '.env'))

PROJECT_ID = "correos-gmail-425301"
LOCATION = "us-east4"

# Resolve credentials path to absolute
creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
if creds_path and not os.path.isabs(creds_path):
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    alt_path = os.path.join(backend_dir, os.path.basename(creds_path))
    if os.path.exists(alt_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = alt_path

def test_inference():
    try:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        model = GenerativeModel("gemini-1.5-flash-001")
        print(f"Model initialized: {model}")
        
        # Test a very simple text generation
        response = model.generate_content("Hola, ¿estás disponible?")
        print(f"Response: {response.text}")
        
    except Exception as e:
        print(f"Error testing inference: {e}")

if __name__ == "__main__":
    test_inference()
