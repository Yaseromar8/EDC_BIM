import os
from google.cloud import aiplatform
from google.cloud.aiplatform.gapic import ModelServiceClient
from dotenv import load_dotenv

# Load env from parent dir
load_dotenv('../.env')

PROJECT_ID = os.environ.get("GCP_PROJECT_ID") or "correos-gmail-425301"
# Probamos us-central1 primero
LOCATION = "us-central1"

def list_supported_models():
    # Resolve credentials
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and not os.path.isabs(creds_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.join("..", creds_path))

    print(f"--- LISTANDO MODELOS EN {LOCATION} ---")
    try:
        client_options = {"api_endpoint": f"{LOCATION}-aiplatform.googleapis.com"}
        client = ModelServiceClient(client_options=client_options)
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        
        # Intentamos obtener los modelos base de la editorial 'google'
        # Nota: list_models a veces solo muestra modelos entrenados por el usuario.
        # Para modelos base, a veces es mejor intentar inferencia directa o revisar el Model Garden.
        
        print(f"Buscando modelos en: {parent}")
        # En lugar de listar (que puede fallar por permisos de admin), vamos a probar 
        # los nombres más probables de las versiones nuevas que vimos en tu captura.
        
        test_models = [
            "gemini-1.5-flash-002",
            "gemini-1.5-pro-002",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-2.0-flash-exp"
        ]
        
        from vertexai.generative_models import GenerativeModel
        import vertexai
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        
        for m_name in test_models:
            try:
                model = GenerativeModel(m_name)
                # Intento de generación mínima
                response = model.generate_content("ping", generation_config={"max_output_tokens": 5})
                print(f"✅ MODELO FUNCIONAL: {m_name}")
            except Exception as e:
                if "404" in str(e):
                    print(f"❌ 404 - No encontrado: {m_name}")
                elif "403" in str(e):
                    print(f"⚠️ 403 - Permiso denegado: {m_name}")
                else:
                    print(f"❓ ERROR en {m_name}: {str(e)[:100]}")

    except Exception as e:
        print(f"FATAL ERROR: {e}")

if __name__ == "__main__":
    list_supported_models()
