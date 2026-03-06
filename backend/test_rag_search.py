from google.cloud import discoveryengine_v1beta as discoveryengine
import os

PROJECT_ID = "correos-gmail-425301"
LOCATION = "global"
# El ID que sacamos de tu captura
ENGINE_ID = "visor-inteligente-talara_1772391119562"

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "c:/Users/omars/OneDrive/Desktop/VISOR_APS_TL/backend/gcp_sa.json"

def test_search():
    client = discoveryengine.SearchServiceClient()
    
    serving_config = f"projects/{PROJECT_ID}/locations/{LOCATION}/collections/default_collection/engines/{ENGINE_ID}/servingConfigs/default_serving_config"
    
    request = discoveryengine.SearchRequest(
        serving_config=serving_config,
        query="que documentos hay?",
        page_size=3,
        content_search_spec={
            "summary_spec": {
                "summary_result_count": 5,
                "include_citations": True,
                "model_spec": {"version": "stable"},
                "model_prompt_spec": {"preamble": "Eres un experto en ingenieria. Responde en español basado en los documentos."}
            }
        }
    )
    
    print(f"Probando búsqueda en {ENGINE_ID}...")
    try:
        response = client.search(request)
        print("✅ Conexión exitosa!")
        print("Respuesta de la IA:", response.summary.summary_text)
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_search()
