import os
import vertexai
from google.cloud import aiplatform
from dotenv import load_dotenv

load_dotenv('../.env')

PROJECT_ID = "correos-gmail-425301"
LOCATION = "us-central1"

def list_vertex_models():
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and not os.path.isabs(creds_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.join("..", creds_path))

    print(f"--- LISTANDO MODELOS DISPONIBLES EN VERTEX ({LOCATION}) ---")
    try:
        # Inicializamos la plataforma
        aiplatform.init(project=PROJECT_ID, location=LOCATION)
        
        # En Vertex, los modelos base se listan a través del Model Garden o por intentos
        # Pero vamos a intentar listar los 'Publisher Models' de Google
        from google.cloud.aiplatform_v1 import ModelGardenServiceClient
        client = ModelGardenServiceClient(client_options={"api_endpoint": f"{LOCATION}-aiplatform.googleapis.com"})
        
        # Intentamos una forma más directa: ver qué modelos responden a una simple llamada
        test_names = [
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-2.0-flash-exp",
            "gemini-1.0-pro"
        ]
        
        from vertexai.generative_models import GenerativeModel
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        
        for name in test_names:
            try:
                model = GenerativeModel(name)
                # No generamos contenido, solo vemos si el objeto se crea y carga el modelo base
                print(f"✅ CONEXIÓN POSIBLE: {name}")
            except Exception as e:
                print(f"❌ NO DISPONIBLE: {name} ({str(e)[:50]})")

    except Exception as e:
        print(f"❌ Error general: {e}")

if __name__ == "__main__":
    list_vertex_models()
