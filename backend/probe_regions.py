import os
import vertexai
from vertexai.generative_models import GenerativeModel
from dotenv import load_dotenv

load_dotenv('../.env')

PROJECT_ID = os.environ.get("GCP_PROJECT_ID") or "correos-gmail-425301"
REGIONS = ["us-central1", "us-east4", "us-east1", "us-west1", "southamerica-east1"]

def probe_regions():
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if creds_path and not os.path.isabs(creds_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(os.path.join("..", creds_path))

    print(f"--- PROBANDO REGIONES EN PROYECTO: {PROJECT_ID} ---")
    
    for region in REGIONS:
        print(f"Probando: {region}...", end=" ")
        try:
            vertexai.init(project=PROJECT_ID, location=region)
            model = GenerativeModel("gemini-1.5-flash")
            # Intento de generación mínima
            model.generate_content("hi", generation_config={"max_output_tokens": 1})
            print(f"✅ ¡ÉXITO!")
            return region
        except Exception as e:
            if "404" in str(e):
                print("❌ 404 (No habilitado)")
            elif "403" in str(e):
                print("⚠️ 403 (Permiso/Facturación)")
            else:
                print(f"❓ Error: {str(e)[:50]}")
    
    return None

if __name__ == "__main__":
    winner = probe_regions()
    if winner:
        print(f"\n🚀 LA REGIÓN CORRECTA ES: {winner}")
    else:
        print("\n❌ No se encontró ninguna región con Gemini habilitado.")
