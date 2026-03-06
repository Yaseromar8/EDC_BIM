import os
import google.generativeai as genai
from dotenv import load_dotenv

# Cargar .env
load_dotenv('../.env')

api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("❌ ERROR: No hay API Key en el .env")
else:
    genai.configure(api_key=api_key)
    print("--- MODELOS DISPONIBLES ---")
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"✅ {m.name}")
    except Exception as e:
        print(f"❌ Error listando: {e}")
