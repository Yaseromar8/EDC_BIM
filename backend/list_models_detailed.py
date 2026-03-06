import os
import google.generativeai as genai
from dotenv import load_dotenv

# Cargar .env desde el directorio padre si es necesario
load_dotenv('../.env')

api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    print("❌ ERROR: No hay API Key en el .env")
else:
    genai.configure(api_key=api_key)
    print("--- LISTADO COMPLETO DE MODELOS ---")
    try:
        models = genai.list_models()
        for m in models:
            # Solo modelos que soporten generación de contenido
            if 'generateContent' in m.supported_generation_methods:
                print(f"MODELO: {m.name}")
    except Exception as e:
        print(f"❌ Error listando: {e}")
