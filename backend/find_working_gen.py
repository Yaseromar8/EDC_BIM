import os
import vertexai
from vertexai.generative_models import GenerativeModel
from dotenv import load_dotenv

load_dotenv('../.env')

PROJECT_ID = "correos-gmail-425301"
LOCATION = "us-central1"

# Intentamos los nombres de la "nueva generación" que vimos en tu lista
TEST_MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.0-flash-preview"
]

def find_working_model():
    # Asegurar credenciales
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and not os.path.isabs(creds_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.join("..", creds_path))

    vertexai.init(project=PROJECT_ID, location=LOCATION)
    
    print(f"--- BUSCANDO MODELO ACTIVO EN PROYECTO PREVIEW ---")
    for m_name in TEST_MODELS:
        print(f"Probando {m_name}...", end=" ")
        try:
            model = GenerativeModel(m_name)
            # Prueba real de generación (muy corta)
            response = model.generate_content("Responde 'OK'", generation_config={"max_output_tokens": 5})
            print(f"✅ ¡FUNCIONA! Respuesta: {response.text.strip()}")
            return m_name
        except Exception as e:
            err = str(e)
            if "404" in err:
                print("❌ 404")
            elif "429" in err:
                print("⚠️ 429 (Cuota)")
            else:
                print(f"❌ Error: {err[:60]}")
    return None

if __name__ == "__main__":
    find_working_model()
