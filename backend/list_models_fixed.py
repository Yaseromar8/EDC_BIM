import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv('../.env')

api_key = os.environ.get("GOOGLE_API_KEY")
if api_key:
    genai.configure(api_key=api_key)
    with open('models_utf8.txt', 'w', encoding='utf-8') as f:
        f.write("--- MODELOS ---\n")
        try:
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    f.write(f"{m.name}\n")
        except Exception as e:
            f.write(f"Error: {e}\n")
